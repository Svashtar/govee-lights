// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {CheckItem} from './checkItem.js';
import {DeviceControls, stateSummary} from './deviceControls.js';
import {ExpanderItem} from './expanderItem.js';

// Header row for one light: name, state, power switch and expander arrow.
const DeviceHeader = GObject.registerClass(
class GoveeLightsDeviceHeader extends ExpanderItem {
    _init(device, manager, gicon, onToggle) {
        super._init(device.name, gicon, onToggle);
        this._device = device;

        this._summary = new St.Label({style_class: 'govee-device-summary', y_align: Clutter.ActorAlign.CENTER, opacity: 160});
        this.addSuffix(this._summary);

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
            this.addSuffix(button);
        }
    }

    sync() {
        this.label.text = this._device.name;
        this._summary.text = stateSummary(this._device);
        if (this._switch)
            this._switch.state = Boolean(this._device.state.power);
        this.icon.opacity = this._device.state.power ? 255 : 120;
    }
});

// A light in the top-bar menu: its header plus its controls, which are only
// shown while expanded.
class DeviceSection extends PopupMenu.PopupMenuSection {
    constructor(device, manager, gicon, onSavePreset, onExpand) {
        super();
        this.device = device;
        this._onExpand = onExpand;
        this.expanded = false;

        this._header = new DeviceHeader(device, manager, gicon, () => this.setExpanded(!this.expanded));
        this.addMenuItem(this._header);

        this._body = new PopupMenu.PopupMenuSection();
        this._body.actor.add_style_class_name('govee-device-controls');
        this._body.actor.visible = false;
        this.addMenuItem(this._body);
        this._controls = new DeviceControls(this._body, device, manager, {showPower: false, onSavePreset});

        this._changedId = device.connect('changed', () => this._header.sync());
        this._header.sync();
    }

    setExpanded(expanded) {
        if (this.expanded === expanded)
            return;
        this.expanded = expanded;
        this._body.actor.visible = expanded;
        this._header.setExpanded(expanded);
        if (expanded)
            this._onExpand(this);
    }

    destroy() {
        this.device.disconnect(this._changedId);
        this._controls.destroy();
        super.destroy();
    }
}

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
        this.connect('destroy', () => {
            manager.disconnect(this._managerId);
            if (this._presetChangedId)
                manager.disconnect(this._presetChangedId);
        });
        this.rebuild();
    }

    get _devices() {
        return this._manager.devices.filter(d => d.placement === 'panel');
    }

    rebuild() {
        if (this._presetChangedId)
            this._manager.disconnect(this._presetChangedId);
        this._presetChangedId = 0;
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
            // Applying keeps the menu open, so presets can be tried one after
            // another; the active one shows a checkmark.
            const items = presets.map(preset => {
                const item = new CheckItem(preset.name,
                                           () => this._manager.applyPreset(preset).catch(e => logError(e, 'govee-lights: preset')),
                                           {iconName: 'media-playback-start-symbolic'});
                this._content.addMenuItem(item);
                return [preset.id, item];
            });
            const syncPresets = () => items.forEach(([id, item]) => item.setChecked(id === this._manager.activePresetId));
            syncPresets();
            this._presetChangedId = this._manager.connect('preset-changed', syncPresets);
            if (devices.length)
                this._content.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        // One light open at a time, like the submenus elsewhere in the shell.
        const sections = devices.map(device => new DeviceSection(device, this._manager, this._gicon,
                                                                 this._callbacks.savePreset, opened => sections.forEach(s => s !== opened && s.setExpanded(false))));
        sections.forEach(section => this._content.addMenuItem(section));

        if (devices.length > 1)
            this._content.addAction(_('Save All as Preset…'), () => this._callbacks.savePreset(devices));

        // Nothing to show here when every light lives in Quick Settings.
        this.visible = !allDevices.length || devices.length > 0 || presets.length > 0;
    }
});
