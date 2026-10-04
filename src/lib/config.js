// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

// Settings and cache files shared by the shell and the preferences window.
//
// GSettings holds what the user chose (aliases, placements, presets).
// ~/.cache/govee-lights/ holds what Govee told us, so menus render at once:
//   devices.json  cloud device list with parsed capabilities and scene lists
//   lan.json      {deviceId: {ip, firmware, seen}} written by the shell's LAN scans

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const PLACEMENTS = ['hidden', 'panel', 'quick-settings'];
export const DEFAULT_PLACEMENT = 'panel';

const CACHE_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'govee-lights']);
export const DEVICES_CACHE = GLib.build_filenamev([CACHE_DIR, 'devices.json']);
export const LAN_CACHE = GLib.build_filenamev([CACHE_DIR, 'lan.json']);

function parseJson(text, fallback) {
    try {
        const value = JSON.parse(text);
        return value ?? fallback;
    } catch {
        return fallback;
    }
}

// {id: {sku, alias, placement, order}}
export function getDevicesConfig(settings) {
    const value = parseJson(settings.get_string('devices-config'), {});
    return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function setDevicesConfig(settings, config) {
    settings.set_string('devices-config', JSON.stringify(config));
}

export function updateDeviceConfig(settings, id, changes) {
    const config = getDevicesConfig(settings);
    config[id] = {...config[id], ...changes};
    setDevicesConfig(settings, config);
}

// Adds newly discovered devices (appended, in the top-bar menu) and keeps
// settings for devices that disappeared, in case they come back.
export function mergeDevicesConfig(config, devices) {
    const merged = {...config};
    let order = Math.max(-1, ...Object.values(merged).map(c => c.order ?? -1));
    for (const d of devices) {
        if (merged[d.id]) {
            merged[d.id] = {...merged[d.id], sku: d.sku};
        } else {
            merged[d.id] = {sku: d.sku, alias: '', placement: DEFAULT_PLACEMENT, order: ++order};
        }
    }
    return merged;
}

export function getPresets(settings) {
    const value = parseJson(settings.get_string('presets'), []);
    return Array.isArray(value) ? value : [];
}

export function setPresets(settings, presets) {
    settings.set_string('presets', JSON.stringify(presets));
}

function readJsonFile(path, fallback) {
    try {
        const [, bytes] = GLib.file_get_contents(path);
        return parseJson(new TextDecoder().decode(bytes), fallback);
    } catch {
        return fallback;
    }
}

function writeJsonFile(path, value) {
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
    GLib.file_set_contents(path, JSON.stringify(value, null, 1));
}

// {updated: unix seconds, devices: [{id, sku, name, capabilities, scenes, diyScenes}]}
export function readDevicesCache() {
    const cache = readJsonFile(DEVICES_CACHE, null);
    return Array.isArray(cache?.devices) ? cache : {updated: 0, devices: []};
}

export function writeDevicesCache(devices) {
    writeJsonFile(DEVICES_CACHE, {updated: Math.floor(Date.now() / 1000), devices});
}

export function readLanCache() {
    const value = readJsonFile(LAN_CACHE, {});
    return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function writeLanCache(lan) {
    writeJsonFile(LAN_CACHE, lan);
}

// Calls `callback` whenever `path` changes. Returns the monitor; keep a
// reference and call cancel() on it when done.
export function monitorFile(path, callback) {
    const monitor = Gio.File.new_for_path(path).monitor_file(Gio.FileMonitorFlags.NONE, null);
    // file_set_contents() replaces the file atomically, which shows up as
    // CREATED or RENAMED rather than CHANGED, so react to anything but DELETED.
    monitor.connect('changed', (_m, _f, _o, event) => {
        if (event !== Gio.FileMonitorEvent.DELETED && event !== Gio.FileMonitorEvent.ATTRIBUTE_CHANGED)
            callback();
    });
    return monitor;
}

export function displayName(device, config) {
    return config?.alias?.trim() || device.name || device.sku;
}

// {day: 'YYYY-MM-DD', count}
function getRequestCounter(settings) {
    const value = parseJson(settings.get_string('request-counter'), {});
    return {day: String(value.day ?? ''), count: Number(value.count) || 0};
}

function todayKey() {
    return GLib.DateTime.new_now_local().format('%F');
}

// Requests made today, or 0 when the counter is from an earlier day.
export function requestsToday(settings) {
    const counter = getRequestCounter(settings);
    return counter.day === todayKey() ? counter.count : 0;
}

// Returns an onRequest callback for CloudClient that bumps the shared counter.
export function requestCounter(settings) {
    return () => {
        const day = todayKey();
        const counter = getRequestCounter(settings);
        const count = counter.day === day ? counter.count + 1 : 1;
        settings.set_string('request-counter', JSON.stringify({day, count}));
    };
}

// Errors that say something about the account or connection, not one light.
const ACCOUNT_ERRORS = new Set(['auth', 'rate-limit', 'network']);
const OK_WRITE_INTERVAL_S = 60;

// {okAt, error, errorAt}; times are unix seconds, 0 when never.
export function getCloudStatus(settings) {
    const v = parseJson(settings.get_string('cloud-status'), {});
    return {
        okAt: Number(v.okAt) || 0,
        error: typeof v.error === 'string' ? v.error : null,
        errorAt: Number(v.errorAt) || 0,
    };
}

// Pure: the status after a request, or null when nothing needs writing.
// Successes are written at most once a minute, unless they clear an error.
export function nextCloudStatus(prev, error, now) {
    if (error) {
        if (!ACCOUNT_ERRORS.has(error.kind))
            return null;
        return {...prev, error: error.kind, errorAt: now};
    }
    if (!prev.error && now - prev.okAt < OK_WRITE_INTERVAL_S)
        return null;
    return {okAt: now, error: null, errorAt: 0};
}

// onResult callback for CloudClient.
export function cloudStatusRecorder(settings) {
    return error => {
        const next = nextCloudStatus(getCloudStatus(settings), error, Math.floor(Date.now() / 1000));
        if (next)
            settings.set_string('cloud-status', JSON.stringify(next));
    };
}

export function resetCloudStatus(settings) {
    settings.reset('cloud-status');
}
