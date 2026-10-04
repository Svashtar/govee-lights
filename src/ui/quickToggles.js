// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {DeviceControls, stateSummary} from './deviceControls.js';

// One tile: clicking it toggles power, the arrow opens the light's controls.
const DeviceToggle = GObject.registerClass(
class GoveeLightsDeviceToggle extends QuickSettings.QuickMenuToggle {
    _init(device, manager, gicon, onSavePreset) {
        super._init({title: device.name, gicon, toggle_mode: false});
        this._device = device;
        this._gicon = gicon;
        this.menuButtonAccessibleName = _('%s Settings').format(device.name);
        this.menu.box.add_style_class_name('govee-quick-menu');

        this.connect('clicked', () => {
            if (device.supports('power'))
                manager.control(device, 'power', !device.state.power);
        });
        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                manager.menuOpened([device]);
        });

        this._controls = new DeviceControls(this.menu, device, manager, {showPower: false, onSavePreset});
        this._changedId = device.connect('changed', () => this._sync());
        this._sync();
        this.connect('destroy', () => {
            device.disconnect(this._changedId);
            this._controls.destroy();
        });
    }

    _sync() {
        const summary = stateSummary(this._device);
        this.title = this._device.name;
        this.subtitle = summary;
        this.checked = Boolean(this._device.state.power);
        this.menu.setHeader(this._gicon, this._device.name, summary);
    }
});

const Indicator = GObject.registerClass(
class GoveeLightsQuickIndicator extends QuickSettings.SystemIndicator {
    _init(devices, manager, gicon, onSavePreset) {
        super._init();
        for (const device of devices)
            this.quickSettingsItems.push(new DeviceToggle(device, manager, gicon, onSavePreset));
        this.connect('destroy', () => this.quickSettingsItems.forEach(item => item.destroy()));
    }
});

// Keeps one tile per light placed in Quick Settings, in the user's order.
export class QuickToggles {
    constructor(manager, gicon, onSavePreset) {
        this._manager = manager;
        this._gicon = gicon;
        this._onSavePreset = onSavePreset;
        this._indicator = null;
        this._key = null;
        this._managerId = manager.connect('devices-changed', () => this._update());
        this._update();
    }

    _update() {
        const devices = this._manager.devices.filter(d => d.placement === 'quick-settings');
        // Tiles update their own names and state; rebuild only when the set
        // or order of lights changes.
        const key = devices.map(d => `${d.id}:${d.scenes.length}:${d.diyScenes.length}`).join(',');
        if (key === this._key)
            return;
        this._key = key;

        this._indicator?.destroy();
        this._indicator = null;
        if (!devices.length)
            return;
        this._indicator = new Indicator(devices, this._manager, this._gicon, this._onSavePreset);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    destroy() {
        this._manager.disconnect(this._managerId);
        this._indicator?.destroy();
        this._indicator = null;
    }
}
