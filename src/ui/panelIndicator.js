// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {DeviceControls, stateSummary} from './deviceControls.js';

// Collapsible section for one light: name, state and a power switch in the
// header, its controls inside.
const DeviceSubMenu = GObject.registerClass(
class GoveeLightsDeviceSubMenu extends PopupMenu.PopupSubMenuMenuItem {
    _init(device, manager, gicon, onSavePreset) {
        super._init(device.name, true);
        this._device = device;
        this.icon.gicon = gicon;
        this.add_style_class_name('govee-device-item');

        this._summary = new St.Label({style_class: 'govee-device-summary', y_align: Clutter.ActorAlign.CENTER, opacity: 160});
        this.insert_child_below(this._summary, this._triangleBin);

        if (device.supports('power')) {
            this._switch = new PopupMenu.Switch(false);
            const button = new St.Button({
                child: this._switch,
                style_class: 'govee-power-button',
                y_align: Clutter.ActorAlign.CENTER,
                can_focus: true,
                accessible_name: _('Power'),
            });
            button.connect('clicked', () => manager.control(device, 'power', !this._switch.state));
            this.insert_child_below(button, this._triangleBin);
        }

        this._controls = new DeviceControls(this.menu, device, manager, {showPower: false, onSavePreset});
        this._changedId = device.connect('changed', () => this._sync());
        this._sync();
        this.connect('destroy', () => {
            device.disconnect(this._changedId);
            this._controls.destroy();
        });
    }

    _sync() {
        this.label.text = this._device.name;
        this._summary.text = stateSummary(this._device);
        if (this._switch)
            this._switch.state = Boolean(this._device.state.power);
        this.icon.opacity = this._device.state.power ? 255 : 120;
    }
});

export const PanelIndicator = GObject.registerClass(
class GoveeLightsPanelIndicator extends PanelMenu.Button {
    // callbacks: {openPreferences(), savePreset(devices)}
    _init(manager, gicon, callbacks) {
        super._init(0.5, _('Govee Lights'));
        this._manager = manager;
        this._callbacks = callbacks;
        this._gicon = gicon;

        this.add_child(new St.Icon({gicon, style_class: 'system-status-icon'}));

        this.menu.actor.add_style_class_name('govee-menu');
        this._content = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._content);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction(_('Refresh'), () => manager.sync().catch(e => logError(e, 'govee-lights: refresh')),
            'view-refresh-symbolic');
        this.menu.addAction(_('Settings'), () => callbacks.openPreferences(), 'preferences-system-symbolic');

        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                manager.menuOpened(this._devices);
        });
        this._managerId = manager.connect('devices-changed', () => this.rebuild());
        this.connect('destroy', () => manager.disconnect(this._managerId));
        this.rebuild();
    }

    get _devices() {
        return this._manager.devices.filter(d => d.placement === 'panel');
    }

    rebuild() {
        this._content.removeAll();
        const devices = this._devices;
        const presets = this._manager.presets;
        const allDevices = this._manager.devices;

        if (!allDevices.length) {
            const setup = new PopupMenu.PopupMenuItem(this._manager.hasApiKey
                ? _('No lights found. Open Settings to fetch them.')
                : _('Set Up Govee Lights…'));
            setup.connect('activate', () => this._callbacks.openPreferences());
            this._content.addMenuItem(setup);
        }

        if (presets.length) {
            const header = new PopupMenu.PopupMenuItem(_('Presets'), {reactive: false, style_class: 'govee-section-title'});
            header.label.opacity = 180;
            this._content.addMenuItem(header);
            for (const preset of presets) {
                this._content.addAction(preset.name, () => this._manager.applyPreset(preset)
                    .catch(e => logError(e, 'govee-lights: preset')), 'media-playback-start-symbolic');
            }
            if (devices.length)
                this._content.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        for (const device of devices)
            this._content.addMenuItem(new DeviceSubMenu(device, this._manager, this._gicon, this._callbacks.savePreset));

        if (devices.length > 1)
            this._content.addAction(_('Save All as Preset…'), () => this._callbacks.savePreset(devices));

        // Nothing to show here when every light lives in Quick Settings.
        this.visible = !allDevices.length || devices.length > 0 || presets.length > 0;
    }
});
