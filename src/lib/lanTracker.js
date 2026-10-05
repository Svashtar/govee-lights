// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

// Which lights are reachable on the LAN. A light counts as reachable while it
// answers either a multicast scan or a direct status request; Wi-Fi drops
// multicast easily (lights in power save miss it), so a missed scan alone
// says little. A light is dropped after missing `missesAllowed` rounds in a
// row. Pure, so it is unit tested.
export class LanTracker {
    constructor(missesAllowed) {
        this._missesAllowed = missesAllowed;
        this._entries = new Map(); // id → {ip, firmware, seen, missed}
        this._heard = new Set();
    }

    // Seeds a light from the cache at startup; it must answer to stay.
    restore(id, {ip, firmware = null, seen = 0}) {
        this._entries.set(id, {ip, firmware, seen, missed: 0});
    }

    // A scan reply. Returns true when the light is new or has a new address.
    heard(id, {ip, firmware}, now) {
        const old = this._entries.get(id);
        this._entries.set(id, {ip, firmware: firmware ?? old?.firmware ?? null, seen: now, missed: 0});
        this._heard.add(id);
        return old?.ip !== ip;
    }

    // A status reply, which only carries the sender's address.
    heardFromIp(ip, now) {
        for (const [id, entry] of this._entries) {
            if (entry.ip === ip) {
                entry.seen = now;
                entry.missed = 0;
                this._heard.add(id);
                return id;
            }
        }
        return null;
    }

    knownIps() {
        return [...this._entries.values()].map(e => e.ip);
    }

    // Ends a scan round: counts a miss for every light that stayed silent.
    // Returns the ids dropped now and the lights still reachable.
    endRound() {
        const dropped = [];
        for (const [id, entry] of this._entries) {
            if (this._heard.has(id))
                continue;
            entry.missed++;
            if (entry.missed > this._missesAllowed) {
                this._entries.delete(id);
                dropped.push(id);
            }
        }
        this._heard.clear();
        const reachable = {};
        for (const [id, {ip, firmware, seen}] of this._entries)
            reachable[id] = {ip, firmware, seen};
        return {dropped, reachable};
    }
}
