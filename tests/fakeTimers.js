// SPDX-License-Identifier: GPL-2.0-or-later

// Manual clock for tests.
export class FakeTimers {
    constructor() {
        this.now = 0;
        this._next = 1;
        this._timers = new Map();
    }

    setTimeout(fn, ms) {
        const id = this._next++;
        this._timers.set(id, {fn, at: this.now + ms});
        return id;
    }

    clearTimeout(id) {
        this._timers.delete(id);
    }

    advance(ms) {
        const end = this.now + ms;
        for (;;) {
            const due = [...this._timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due)
                break;
            this._timers.delete(due[0]);
            this.now = due[1].at;
            due[1].fn();
        }
        this.now = end;
    }
}
