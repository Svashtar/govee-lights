// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// Rate limiting for slider drags. Timer functions are injected so the logic
// runs under tests without a main loop; the shell passes GLib-based ones.

// Sends the first value at once, then at most one value per `interval` ms,
// always ending with the latest value.
export class Throttle {
    constructor(interval, send, timers) {
        this._interval = interval;
        this._send = send;
        this._timers = timers;
        this._timer = null;
        this._pending = undefined;
    }

    push(value) {
        if (this._timer) {
            this._pending = value;
            return;
        }
        this._send(value);
        this._arm();
    }

    _arm() {
        this._timer = this._timers.setTimeout(() => {
            this._timer = null;
            if (this._pending !== undefined) {
                const value = this._pending;
                this._pending = undefined;
                this._send(value);
                this._arm();
            }
        }, this._interval);
    }

    cancel() {
        if (this._timer)
            this._timers.clearTimeout(this._timer);
        this._timer = null;
        this._pending = undefined;
    }
}

// Sends only the latest value, `delay` ms after the last push. flush() sends
// a waiting value now (slider released).
export class Debounce {
    constructor(delay, send, timers) {
        this._delay = delay;
        this._send = send;
        this._timers = timers;
        this._timer = null;
        this._pending = undefined;
    }

    push(value) {
        this._pending = value;
        if (this._timer)
            this._timers.clearTimeout(this._timer);
        this._timer = this._timers.setTimeout(() => this.flush(), this._delay);
    }

    flush() {
        if (this._timer)
            this._timers.clearTimeout(this._timer);
        this._timer = null;
        if (this._pending !== undefined) {
            const value = this._pending;
            this._pending = undefined;
            this._send(value);
        }
    }

    cancel() {
        if (this._timer)
            this._timers.clearTimeout(this._timer);
        this._timer = null;
        this._pending = undefined;
    }
}
