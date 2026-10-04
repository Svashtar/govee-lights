// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

// Fetches the light list and scene lists from the cloud and writes the device
// cache. Used by the preferences window ("Fetch Lights") and by the shell when
// the cache is empty.

import {readDevicesCache, writeDevicesCache} from './config.js';

// Returns the new device list. A scene list that fails to load keeps its
// previous value instead of failing the whole sync; auth and rate-limit
// errors still abort, because every following call would fail the same way.
export async function syncDevices(client) {
    const previous = new Map(readDevicesCache().devices.map(d => [d.id, d]));
    const devices = await client.getDevices();

    const load = async (device, supported, fetch, field) => {
        if (!supported) {
            device[field] = [];
            return;
        }
        try {
            device[field] = await fetch(device);
        } catch (e) {
            if (e.kind === 'auth' || e.kind === 'rate-limit')
                throw e;
            console.warn(`govee-lights: could not load ${field} for ${device.sku}: ${e.message}`);
            device[field] = previous.get(device.id)?.[field] ?? [];
        }
    };

    await Promise.all(devices.map(d => Promise.all([
        load(d, d.capabilities.scenes, x => client.getScenes(x), 'scenes'),
        load(d, d.capabilities.diyScenes, x => client.getDiyScenes(x), 'diyScenes'),
    ])));

    writeDevicesCache(devices);
    return devices;
}
