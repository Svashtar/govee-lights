// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// Owns every Device, both transports and the refresh policy. UIs call
// control()/applyPreset()/menuOpened() and listen to Device 'changed'.
//
// Signals:
//   'devices-changed'  the set, order, names or placements of devices changed
//   'error'            (kind, message) for errors the user should see once
//                      (auth, rate-limit); per-device errors go on Device.error

import GLib from 'gi://GLib';

import {cloudCommand, flattenState, lanCommand, optimisticState, stateFromCloud, stateFromLan} from './capabilities.js';
import {CloudClient, DAILY_LIMIT} from './cloudClient.js';
import {
    DEVICES_CACHE, getDevicesConfig, getPresets, mergeDevicesConfig, monitorFile, readDevicesCache,
    readLanCache, requestCounter, requestsToday, setDevicesConfig, writeLanCache,
} from './config.js';
import {Device} from './device.js';
import {Emitter} from './emitter.js';
import {LanClient} from './lanClient.js';
import {planPreset} from './presets.js';
import {CLOUD_DEBOUNCE_MS, LAN_CONFIRM_MS, LAN_THROTTLE_MS, chooseRoute, isStale} from './routing.js';
import {lookupApiKey} from './secret.js';
import {syncDevices} from './sync.js';
import {Debounce, Throttle} from './throttle.js';

const SCAN_INTERVAL_S = 5 * 60;
// A light that misses this many scans in a row is treated as off the LAN.
const LAN_MISSES_ALLOWED = 2;
const RATE_WARNING_AT = Math.floor(DAILY_LIMIT * 0.9);

// GLib-backed timers for Throttle/Debounce; all ids are tracked so destroy()
// can remove them.
class Timers {
    constructor() {
        this._ids = new Set();
    }

    setTimeout(fn, ms) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._ids.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._ids.add(id);
        return id;
    }

    clearTimeout(id) {
        if (this._ids.delete(id))
            GLib.source_remove(id);
    }

    clearAll() {
        this._ids.forEach(id => GLib.source_remove(id));
        this._ids.clear();
    }
}

export class DeviceManager extends Emitter {
    constructor(settings) {
        super();
        this._settings = settings;
        this._timers = new Timers();
        this._devices = new Map();
        this._senders = new Map();
        this._confirms = new Map();
        this._lan = null;
        this._cloud = null;
        this._lanSeen = new Map();
        this._scanId = 0;
        this._destroyed = false;
        this.lanError = null;
        this.hasApiKey = false;
    }

    get devices() {
        return [...this._devices.values()].sort((a, b) => a.order - b.order);
    }

    get useLan() {
        return this._settings.get_boolean('use-lan') && this._lan?.running;
    }

    get presets() {
        return getPresets(this._settings);
    }

    async start() {
        this._loadDevices();

        this._settingsIds = [
            this._settings.connect('changed::devices-config', () => this._applyConfig()),
            // Prefs bump this after fetching lights or changing the API key.
            this._settings.connect('changed::cache-stamp', () => this._reload()),
            this._settings.connect('changed::use-lan', () => this._updateLan()),
            this._settings.connect('changed::lan-scan-request', () => this.scan()),
            this._settings.connect('changed::presets', () => this.emit('devices-changed')),
        ];
        // Prefs may rewrite the cache while the shell runs.
        this._cacheMonitor = monitorFile(DEVICES_CACHE, () => this._loadDevices());

        this._updateLan();
        await this._connectCloud();
        if (this._destroyed)
            return;

        // First run with a key but no cache (e.g. key set from another machine's backup).
        if (this._cloud && !this._devices.size)
            await this.sync().catch(e => this._handleError(null, e));
    }

    destroy() {
        this._destroyed = true;
        this._settingsIds?.forEach(id => this._settings.disconnect(id));
        this._cacheMonitor?.cancel();
        if (this._scanId)
            GLib.source_remove(this._scanId);
        this._senders.forEach(s => s.cancel());
        this._timers.clearAll();
        this._lan?.destroy();
        this._cloud?.destroy();
        this._devices.forEach(d => d.destroy());
        this._devices.clear();
        this.disconnectAll();
    }

    // ---- Device list -------------------------------------------------------

    _loadDevices() {
        const {devices} = readDevicesCache();
        const config = getDevicesConfig(this._settings);
        const lan = readLanCache();
        const seen = new Set();

        for (const cached of devices) {
            seen.add(cached.id);
            const existing = this._devices.get(cached.id);
            if (existing) {
                Object.assign(existing, {
                    sku: cached.sku, goveeName: cached.name, capabilities: cached.capabilities,
                    scenes: cached.scenes ?? [], diyScenes: cached.diyScenes ?? [],
                });
                existing.setConfig(config[cached.id]);
            } else {
                const device = new Device(cached, config[cached.id]);
                if (lan[cached.id]?.ip)
                    device.ip = lan[cached.id].ip;
                this._devices.set(cached.id, device);
            }
        }
        for (const [id, device] of this._devices) {
            if (!seen.has(id)) {
                device.destroy();
                this._devices.delete(id);
            }
        }
        this.emit('devices-changed');
    }

    async _reload() {
        this._cloud?.destroy();
        this._cloud = null;
        await this._connectCloud();
        if (this._destroyed)
            return;
        this._loadDevices();
        this.refreshAll(false);
    }

    _applyConfig() {
        const config = getDevicesConfig(this._settings);
        this._devices.forEach(d => {
            d.config = config[d.id] ?? {};
        });
        this.emit('devices-changed');
    }

    async _connectCloud() {
        try {
            const apiKey = await lookupApiKey();
            this.hasApiKey = Boolean(apiKey);
            if (apiKey && !this._destroyed) {
                const count = requestCounter(this._settings);
                this._cloud = new CloudClient({apiKey, onRequest: () => this._countRequest(count)});
            }
        } catch (e) {
            console.warn(`govee-lights: keyring unavailable: ${e.message}`);
        }
    }

    _countRequest(count) {
        count();
        const used = requestsToday(this._settings);
        if (used === RATE_WARNING_AT)
            this.emit('error', 'rate-warning', `${used} of ${DAILY_LIMIT}`);
    }

    // Re-reads the API key (after the prefs window changed it) and the device list.
    async sync() {
        this._cloud?.destroy();
        this._cloud = null;
        await this._connectCloud();
        if (!this._cloud)
            return;
        const devices = await syncDevices(this._cloud);
        setDevicesConfig(this._settings, mergeDevicesConfig(getDevicesConfig(this._settings), devices));
        this._loadDevices();
        await this.refreshAll(true);
    }

    // ---- LAN ---------------------------------------------------------------

    _updateLan() {
        const wanted = this._settings.get_boolean('use-lan');
        if (wanted && !this._lan) {
            this._lan = new LanClient();
            try {
                this._lan.start();
                this.lanError = null;
            } catch (e) {
                // Port 4002 taken without SO_REUSEPORT, or no network: cloud only.
                this.lanError = e.message;
                console.warn(`govee-lights: LAN disabled: ${e.message}`);
                this._lan = null;
                return;
            }
            this._lan.connect('device-found', (_c, found) => this._onLanDevice(found));
            this._lan.connect('status', (_c, ip, data) => this._onLanStatus(ip, data));
            this.scan();
            this._scanId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, SCAN_INTERVAL_S, () => {
                this.scan();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!wanted && this._lan) {
            GLib.source_remove(this._scanId);
            this._scanId = 0;
            this._lan.destroy();
            this._lan = null;
            this._devices.forEach(d => d.setIp(null));
        }
    }

    // Sends a scan and, a few seconds later, forgets lights that stopped answering.
    scan() {
        if (!this._lan)
            return;
        try {
            this._lan.scan();
        } catch (e) {
            console.warn(`govee-lights: LAN scan failed: ${e.message}`);
            return;
        }
        this._timers.setTimeout(() => this._afterScan(), 3000);
    }

    _afterScan() {
        const lan = {};
        for (const device of this._devices.values()) {
            const seen = this._lanSeen.get(device.id);
            if (!seen)
                continue;
            if (seen.missed > LAN_MISSES_ALLOWED) {
                this._lanSeen.delete(device.id);
                device.setIp(null);
                continue;
            }
            lan[device.id] = {ip: seen.ip, firmware: seen.firmware, seen: seen.at};
            seen.missed++;
        }
        try {
            writeLanCache(lan);
        } catch (e) {
            console.warn(`govee-lights: could not write LAN cache: ${e.message}`);
        }
    }

    _onLanDevice(found) {
        this._lanSeen.set(found.id, {ip: found.ip, firmware: found.firmware, at: Math.floor(Date.now() / 1000), missed: 0});
        const device = this._devices.get(found.id);
        if (!device)
            return;
        const isNew = !device.ip;
        device.setIp(found.ip);
        if (isNew)
            this._lan.requestStatus(found.ip);
    }

    _onLanStatus(ip, data) {
        for (const device of this._devices.values()) {
            if (device.ip === ip) {
                device.update(stateFromLan(data));
                device.setError(null);
            }
        }
    }

    // ---- State refresh ----------------------------------------------------

    // Called when a menu showing `devices` opens. LAN reads are free; cloud
    // reads happen only when the last one is older than refresh-stale-seconds.
    menuOpened(devices = this.devices) {
        if (this._lan && devices.some(d => !d.ip))
            this.scan();
        for (const device of devices)
            this.refresh(device).catch(e => this._handleError(device, e));
    }

    async refresh(device, force = false) {
        if (this.useLan && device.ip) {
            this._lan.requestStatus(device.ip);
            return;
        }
        if (!this._cloud)
            return;
        const stale = isStale(device.cloudUpdated, Date.now(), this._settings.get_uint('refresh-stale-seconds'));
        if (!force && !stale)
            return;
        device.cloudUpdated = Date.now();
        const body = await this._cloud.getState(device);
        device.update(stateFromCloud(flattenState(body), device.capabilities));
        device.setError(null);
    }

    refreshAll(force = true) {
        return Promise.all(this.devices.map(d => this.refresh(d, force).catch(e => this._handleError(d, e))));
    }

    // ---- Control ----------------------------------------------------------

    // live: true while a slider is being dragged; the final value is sent
    // again with live: false when it is released.
    control(device, action, value, {live = false} = {}) {
        const route = chooseRoute({ip: this.useLan ? device.ip : null, hasCloud: Boolean(this._cloud)}, action, true);
        if (!route) {
            device.setError(this.hasApiKey ? 'unreachable' : 'no-key');
            return;
        }
        device.update(optimisticState(action, value));

        const key = `${device.id}:${action}:${route}`;
        let sender = this._senders.get(key);
        if (!sender) {
            sender = route === 'lan'
                ? new Throttle(LAN_THROTTLE_MS, v => this._sendLan(device, action, v), this._timers)
                : new Debounce(CLOUD_DEBOUNCE_MS, v => this._sendCloud(device, action, v), this._timers);
            this._senders.set(key, sender);
        }
        sender.push(value);
        if (!live && sender instanceof Debounce)
            sender.flush();
    }

    _sendLan(device, action, value) {
        const command = lanCommand(device.capabilities, action, value);
        try {
            this._lan.command(device.ip, command.cmd, command.data);
        } catch (e) {
            this._handleError(device, e);
            return;
        }
        // Confirm once the burst is over; this also corrects the optimistic state.
        this._timers.clearTimeout(this._confirms.get(device.id));
        this._confirms.set(device.id, this._timers.setTimeout(() => {
            this._confirms.delete(device.id);
            this._lan?.requestStatus(device.ip);
        }, LAN_CONFIRM_MS));
    }

    async _sendCloud(device, action, value) {
        device.busy = true;
        try {
            await this._cloud.control(device, cloudCommand(device.capabilities, action, value));
            device.setError(null);
        } catch (e) {
            this._handleError(device, e);
            // The optimistic state may be wrong now; read the real one.
            this.refresh(device, true).catch(() => {});
        } finally {
            device.busy = false;
        }
    }

    // Runs every light's steps in parallel; steps for one light run in order.
    async applyPreset(preset) {
        const {plans} = planPreset(preset, this._devices);
        await Promise.all(plans.map(async ({deviceId, actions}) => {
            const device = this._devices.get(deviceId);
            for (const {action, value} of actions) {
                this.control(device, action, value);
                // Give the light a moment between commands, so the power-on
                // isn't overtaken by the colour that follows it.
                await new Promise(resolve => this._timers.setTimeout(resolve, device.ip ? 150 : 300));
            }
        }));
    }

    _handleError(device, e) {
        if (e.kind === 'cancelled' || this._destroyed)
            return;
        console.warn(`govee-lights: ${device?.sku ?? 'sync'}: ${e.message}`);
        if (e.kind === 'auth' || e.kind === 'rate-limit')
            this.emit('error', e.kind, e.message);
        device?.setError(e.kind ?? 'error');
    }
}
