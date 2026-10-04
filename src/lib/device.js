// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import {supports} from './capabilities.js';
import {DEFAULT_PLACEMENT, displayName} from './config.js';
import {Emitter} from './emitter.js';

// One light: what the cloud says it can do, what the user configured, how it
// is reached and its last known state.
//
// Signals: 'changed' — state, name, placement or connection changed
export class Device extends Emitter {
    constructor(cached, config = {}) {
        super();
        this.id = cached.id;
        this.sku = cached.sku;
        this.goveeName = cached.name;
        this.capabilities = cached.capabilities;
        this.scenes = cached.scenes ?? [];
        this.diyScenes = cached.diyScenes ?? [];
        this.config = config;
        this.ip = null;
        this.state = {online: null, power: null, brightness: null, color: null, kelvin: null, scene: null};
        this.cloudUpdated = 0;
        this.busy = false;
        this.error = null;
    }

    get name() {
        return displayName({name: this.goveeName, sku: this.sku}, this.config);
    }

    get placement() {
        return this.config.placement ?? DEFAULT_PLACEMENT;
    }

    get order() {
        return this.config.order ?? 0;
    }

    get connection() {
        return this.ip ? 'lan' : 'cloud';
    }

    supports(action) {
        return supports(this.capabilities, action);
    }

    // Shallow-merges into state and emits 'changed' if anything differs.
    update(changes) {
        let changed = false;
        for (const [k, v] of Object.entries(changes)) {
            if (JSON.stringify(this.state[k]) !== JSON.stringify(v)) {
                this.state[k] = v;
                changed = true;
            }
        }
        if (changed)
            this.emit('changed');
    }

    setConfig(config) {
        this.config = config ?? {};
        this.emit('changed');
    }

    setIp(ip) {
        if (this.ip === ip)
            return;
        this.ip = ip;
        this.emit('changed');
    }

    setError(error) {
        this.error = error;
        this.emit('changed');
    }

    destroy() {
        this.disconnectAll();
    }
}
