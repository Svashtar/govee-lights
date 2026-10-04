// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

// Minimal signal emitter for plain JS classes, so library code also runs
// outside gnome-shell (tests, spikes). connect() returns an id for disconnect().
export class Emitter {
    #handlers = new Map();
    #nextId = 1;

    connect(name, callback) {
        const id = this.#nextId++;
        this.#handlers.set(id, {name, callback});
        return id;
    }

    disconnect(id) {
        this.#handlers.delete(id);
    }

    disconnectAll() {
        this.#handlers.clear();
    }

    emit(name, ...args) {
        for (const {name: n, callback} of [...this.#handlers.values()]) {
            if (n !== name)
                continue;
            try {
                callback(this, ...args);
            } catch (e) {
                logError(e, `govee-lights: "${name}" handler`);
            }
        }
    }
}
