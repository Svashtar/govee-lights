// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class GoveeLightsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        console.debug(`[${this.metadata.uuid}] enabled`);
    }

    disable() {
        this._settings = null;
        console.debug(`[${this.metadata.uuid}] disabled`);
    }
}
