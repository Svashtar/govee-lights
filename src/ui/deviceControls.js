// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

// Menu controls for one light, shared by the top-bar menu and the Quick
// Settings tiles. Only controls the light supports are added.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

import {hsvToRgb, rgbToHsv, toHex} from '../lib/capabilities.js';
import {sceneOptions} from '../lib/presets.js';
import {hueSlider, temperatureSlider} from './gradientSlider.js';
import {OptionList} from './optionList.js';

const SWATCHES = [
    {r: 255, g: 0, b: 0}, {r: 255, g: 120, b: 0}, {r: 255, g: 210, b: 0}, {r: 0, g: 220, b: 60},
    {r: 0, g: 200, b: 255}, {r: 0, g: 60, b: 255}, {r: 150, g: 0, b: 255}, {r: 255, g: 0, b: 160},
];

const SCENE_MENUS = () => [
    {kind: 'scene', label: _('Scenes'), search: _('Search scenes'), icon: 'starred-symbolic'},
    {kind: 'diyScene', label: _('DIY Scenes'), search: _('Search DIY scenes'), icon: 'applications-graphics-symbolic'},
    {kind: 'snapshot', label: _('Snapshots'), search: _('Search snapshots'), icon: 'camera-photo-symbolic'},
    {kind: 'musicMode', label: _('Music Modes'), search: _('Search music modes'), icon: 'audio-x-generic-symbolic'},
];

export function stateSummary(device) {
    const {state} = device;
    if (device.error === 'no-key')
        return _('No API key');
    if (state.online === false)
        return _('Offline');
    if (state.power === null)
        return '';
    if (!state.power)
        return _('Off');
    if (state.scene)
        return state.scene.name;
    return state.brightness !== null ? `${state.brightness}%` : _('On');
}

function errorText(device) {
    switch (device.error) {
    case null: return null;
    case 'no-key': return _('Add your API key in Settings');
    case 'unreachable': return _('Not reachable');
    case 'auth': return _('API key rejected');
    case 'rate-limit': return _('Govee rate limit reached');
    case 'network': return _('No connection to Govee');
    default: return _('Last command failed');
    }
}

// A menu row holding a slider, like the Quick Settings brightness slider.
class SliderRow {
    constructor(section, iconName, slider, accessibleName) {
        this.item = new PopupMenu.PopupBaseMenuItem({activate: false, style_class: 'lightsbuddy-slider-item'});
        this.item.add_child(new St.Icon({icon_name: iconName, style_class: 'popup-menu-icon'}));
        this.slider = slider;
        this.slider.accessible_name = accessibleName;
        this.item.add_child(this.slider);
        this.item.connect('key-press-event', (_a, event) => this.slider.emit('key-press-event', event));
        this.dragging = false;
        this.slider.connect('drag-begin', () => {
            this.dragging = true;
        });
        section.addMenuItem(this.item);
    }

    // onChange(value 0–1, live). Every change is sent as live, so scrolling
    // and arrow keys are debounced on the cloud too; releasing a drag sends
    // the final value at once.
    onChange(callback) {
        this.slider.connect('notify::value', () => {
            if (!this._setting)
                callback(this.slider.value, true);
        });
        this.slider.connect('drag-end', () => {
            this.dragging = false;
            callback(this.slider.value, false);
        });
    }

    set(value) {
        if (this.dragging)
            return;
        this._setting = true;
        this.slider.value = value;
        this._setting = false;
    }
}

export class DeviceControls {
    // options.showPower: add a power switch (the Quick Settings tile has its own)
    // options.onSavePreset: (devices) => void
    constructor(section, device, manager, {showPower = true, onSavePreset = null} = {}) {
        this._device = device;
        this._manager = manager;
        this._section = section;
        const send = (action, value, live = false) => manager.control(device, action, value, {live});

        if (showPower && device.supports('power')) {
            this._power = new PopupMenu.PopupSwitchMenuItem(_('Power'), false);
            this._power.connect('toggled', (_i, on) => send('power', on));
            section.addMenuItem(this._power);
        }

        if (device.supports('brightness')) {
            this._brightness = new SliderRow(section, 'display-brightness-symbolic', new Slider.Slider(0), _('Brightness'));
            this._brightness.onChange((v, live) => send('brightness', Math.max(1, Math.round(v * 100)), live));
        }

        const t = device.capabilities.temperature;
        if (t) {
            this._temperature = new SliderRow(section, 'weather-clear-symbolic', temperatureSlider(0.5, t.min, t.max), _('White'));
            this._temperature.onChange((v, live) => send('temperature', Math.round(t.min + v * (t.max - t.min)), live));
        }

        if (device.supports('color')) {
            this._hue = new SliderRow(section, 'applications-graphics-symbolic', hueSlider(0), _('Colour'));
            this._hue.onChange((v, live) => send('color', hsvToRgb(Math.min(v, 0.999) * 360, 1, 1), live));
            section.addMenuItem(this._swatchRow(c => send('color', c)));
        }

        this._lists = [];
        this._sceneKey = undefined;
        for (const {kind, label, search, icon} of SCENE_MENUS()) {
            const options = sceneOptions(device, kind);
            if (!options.length || !device.supports(kind))
                continue;
            const list = new OptionList({
                label,
                iconName: icon,
                searchHint: search,
                options,
                onPick: option => send(kind, option),
                onExpand: opened => this._lists.forEach(l => l.list !== opened && l.list.setExpanded(false)),
            });
            this._lists.push({kind, list});
            section.addMenuItem(list);
        }

        if (onSavePreset)
            section.addAction(_('Save as Preset…'), () => onSavePreset([device]));

        this._status = new PopupMenu.PopupMenuItem('', {reactive: false, style_class: 'lightsbuddy-status-item'});
        this._status.label.opacity = 150;
        section.addMenuItem(this._status);

        this._changedId = device.connect('changed', () => this.sync());
        this.sync();
    }

    _swatchRow(onPick) {
        const item = new PopupMenu.PopupBaseMenuItem({activate: false, can_focus: false, style_class: 'lightsbuddy-swatch-item'});
        const box = new St.BoxLayout({x_expand: true, x_align: Clutter.ActorAlign.CENTER, style_class: 'lightsbuddy-swatches'});
        for (const color of SWATCHES) {
            const button = new St.Button({
                style_class: 'lightsbuddy-swatch',
                style: `background-color: ${toHex(color)};`,
                can_focus: true,
                accessible_name: toHex(color),
            });
            button.connect('clicked', () => onPick(color));
            box.add_child(button);
        }
        item.add_child(box);
        return item;
    }

    sync() {
        const {state} = this._device;
        // Only walk the option lists when the scene actually changed.
        const sceneKey = state.scene ? `${state.scene.kind}:${state.scene.name}` : null;
        if (sceneKey !== this._sceneKey) {
            this._sceneKey = sceneKey;
            for (const {kind, list} of this._lists)
                list.setChecked(state.scene?.kind === kind ? state.scene.name : null);
        }
        this._power?.setToggleState(Boolean(state.power));
        if (state.brightness !== null)
            this._brightness?.set(state.brightness / 100);
        const t = this._device.capabilities.temperature;
        if (this._temperature && state.kelvin)
            this._temperature.set((state.kelvin - t.min) / (t.max - t.min));
        if (this._hue && state.color)
            this._hue.set(rgbToHsv(state.color).h / 360);

        const error = errorText(this._device);
        const route = this._device.ip && this._manager.useLan ? _('LAN') : _('Cloud');
        this._status.label.text = error ?? (state.online === false ? _('Offline') : route);
    }

    destroy() {
        this._device.disconnect(this._changedId);
    }
}
