// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {DeviceControls, stateSummary} from './deviceControls.js';

// Header row for one light: icon, name, state, power switch and an expander
// arrow. GNOME menus allow only one open submenu at a time, so a light can't
// be a submenu itself: its Scenes/DIY/Music submenus would close it when they
// open. The header instead shows or hides a plain section below it.
const DeviceHeader = GObject.registerClass(
class GoveeLightsDeviceHeader extends PopupMenu.PopupBaseMenuItem {
    _init(device, manager, gicon, onToggle) {
        super._init({style_class: 'govee-device-item'});
        this._device = device;
        this._onToggle = onToggle;

        this._icon = new St.Icon({gicon, style_class: 'popup-menu-icon'});
        this.add_child(this._icon);
        this.label = new St.Label({y_align: Clutter.ActorAlign.CENTER, x_expand: true});
        this.add_child(this.label);
        this.label_actor = this.label;

        this._summary = new St.Label({style_class: 'govee-device-summary', y_align: Clutter.ActorAlign.CENTER, opacity: 160});
        this.add_child(this._summary);

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
            this.add_child(button);
        }

        this._arrow = new St.Icon({
            icon_name: 'pan-end-symbolic',
            style_class: 'popup-menu-arrow',
            y_align: Clutter.ActorAlign.CENTER,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this.add_child(this._arrow);
        this.setExpanded(false);
    }

    // Toggles the section instead of emitting 'activate', which would close the menu.
    activate(_event) {
        this._onToggle();
    }

    setExpanded(expanded) {
        this._arrow.rotation_angle_z = expanded ? 90 : 0;
        if (expanded)
            this.add_accessible_state(Atk.StateType.EXPANDED);
        else
            this.remove_accessible_state(Atk.StateType.EXPANDED);
    }

    sync() {
        this.label.text = this._device.name;
        this._summary.text = stateSummary(this._device);
        if (this._switch)
            this._switch.state = Boolean(this._device.state.power);
        this._icon.opacity = this._device.state.power ? 255 : 120;
    }
});

// A preset row. Choosing it applies the preset and keeps the menu open, so
// you can try presets one after another; the active one shows a checkmark.
const PresetItem = GObject.registerClass(
class GoveeLightsPresetItem extends PopupMenu.PopupBaseMenuItem {
    _init(preset, manager) {
        super._init({style_class: 'govee-preset-item'});
        this._preset = preset;
        this._manager = manager;

        this.add_child(new St.Icon({icon_name: 'media-playback-start-symbolic', style_class: 'popup-menu-icon'}));
        this.label = new St.Label({text: preset.name, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this.add_child(this.label);
        this.label_actor = this.label;
        this._check = new St.Icon({icon_name: 'object-select-symbolic', style_class: 'popup-menu-icon'});
        this.add_child(this._check);

        this._changedId = manager.connect('preset-changed', () => this._sync());
        this.connect('destroy', () => manager.disconnect(this._changedId));
        this._sync();
    }

    // Applies without emitting 'activate', which would close the menu.
    activate(_event) {
        this._manager.applyPreset(this._preset).catch(e => logError(e, 'govee-lights: preset'));
    }

    _sync() {
        const active = this._manager.activePresetId === this._preset.id;
        this._check.opacity = active ? 255 : 0;
        if (active)
            this.add_accessible_state(Atk.StateType.CHECKED);
        else
            this.remove_accessible_state(Atk.StateType.CHECKED);
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
            for (const preset of presets)
                this._content.addMenuItem(new PresetItem(preset, this._manager));
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
