// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _, ngettext} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    DEFAULT_PLACEMENT, PLACEMENTS, displayName, getDevicesConfig, readDevicesCache,
    readLanCache, setDevicesConfig, updateDeviceConfig,
} from '../lib/config.js';
import {escapeMarkup} from '../lib/markdown.js';

const PLACEMENT_LABELS = () => [_('Hidden'), _('Top Bar Menu'), _('Quick Settings')];

export function featureSummary(caps, device) {
    const parts = [];
    if (caps.power)
        parts.push(_('Power'));
    if (caps.brightness)
        parts.push(_('Brightness'));
    if (caps.temperature)
        parts.push(_('White %d–%d K').format(caps.temperature.min, caps.temperature.max));
    if (caps.color)
        parts.push(_('Colour'));
    if (device.scenes?.length)
        parts.push(ngettext('%d scene', '%d scenes', device.scenes.length).format(device.scenes.length));
    if (device.diyScenes?.length)
        parts.push(ngettext('%d DIY scene', '%d DIY scenes', device.diyScenes.length).format(device.diyScenes.length));
    if (caps.snapshots.length)
        parts.push(ngettext('%d snapshot', '%d snapshots', caps.snapshots.length).format(caps.snapshots.length));
    if (caps.musicModes.length)
        parts.push(ngettext('%d music mode', '%d music modes', caps.musicModes.length).format(caps.musicModes.length));
    return parts.join(', ');
}

function infoRow(title, value) {
    const row = new Adw.ActionRow({title, subtitle: value, subtitle_selectable: true});
    row.add_css_class('property');
    return row;
}

export const DevicesPage = GObject.registerClass(
class GoveeLightsDevicesPage extends Adw.PreferencesPage {
    _init({window, settings}) {
        super._init({title: _('Lights'), icon_name: 'display-brightness-symbolic', name: 'devices'});
        this._window = window;
        this._settings = settings;
        this._groups = [];
        this._writing = false;

        this._settingsIds = [
            settings.connect('changed::cache-stamp', () => this.refresh()),
            settings.connect('changed::devices-config', () => {
                if (!this._writing)
                    this.refresh();
            }),
        ];
        this.connect('destroy', () => this._settingsIds.forEach(id => settings.disconnect(id)));
        this.refresh();
    }

    _write(fn) {
        this._writing = true;
        try {
            fn();
        } finally {
            this._writing = false;
        }
    }

    refresh() {
        this._groups.forEach(g => this.remove(g));
        this._groups = [];

        const {devices} = readDevicesCache();
        const config = getDevicesConfig(this._settings);
        const lan = readLanCache();

        if (!devices.length) {
            const empty = new Adw.PreferencesGroup();
            empty.add(new Adw.StatusPage({
                icon_name: 'govee-lights-symbolic',
                title: _('No Lights Yet'),
                description: _('Add your Govee API key on the Account page, then fetch your lights.'),
                vexpand: true,
            }));
            this._addGroup(empty);
            return;
        }

        const sorted = [...devices].sort((a, b) => (config[a.id]?.order ?? 0) - (config[b.id]?.order ?? 0));
        const group = new Adw.PreferencesGroup({
            title: _('Your Lights'),
            description: _('Rename lights and choose where each one appears. Lights in Quick Settings get their own tile.'),
        });
        sorted.forEach((device, index) => group.add(this._deviceRow(device, config[device.id] ?? {}, lan[device.id], index, sorted)));
        this._addGroup(group);
    }

    _addGroup(group) {
        this.add(group);
        this._groups.push(group);
    }

    _deviceRow(device, config, lan, index, sorted) {
        const row = new Adw.ExpanderRow({
            title: escapeMarkup(displayName(device, config)),
            subtitle: lan ? _('%s · LAN').format(device.sku) : _('%s · Cloud').format(device.sku),
        });

        // Reorder buttons
        const up = new Gtk.Button({icon_name: 'go-up-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'],
            tooltip_text: _('Move Up'), sensitive: index > 0});
        const down = new Gtk.Button({icon_name: 'go-down-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'],
            tooltip_text: _('Move Down'), sensitive: index < sorted.length - 1});
        up.connect('clicked', () => this._move(sorted, index, -1));
        down.connect('clicked', () => this._move(sorted, index, 1));
        row.add_suffix(up);
        row.add_suffix(down);

        const alias = new Adw.EntryRow({title: _('Name'), text: config.alias ?? '', show_apply_button: true});
        alias.connect('apply', () => {
            this._write(() => updateDeviceConfig(this._settings, device.id, {alias: alias.text.trim()}));
            row.title = escapeMarkup(displayName(device, {alias: alias.text}));
        });
        row.add_row(alias);

        const placement = new Adw.ComboRow({
            title: _('Show In'),
            model: Gtk.StringList.new(PLACEMENT_LABELS()),
            selected: Math.max(0, PLACEMENTS.indexOf(config.placement ?? DEFAULT_PLACEMENT)),
        });
        placement.connect('notify::selected', () => {
            this._write(() => updateDeviceConfig(this._settings, device.id, {placement: PLACEMENTS[placement.selected]}));
        });
        row.add_row(placement);

        row.add_row(infoRow(_('Name in Govee Home'), device.name));
        row.add_row(infoRow(_('Model'), device.sku));
        row.add_row(infoRow(_('Connection'), lan
            ? _('LAN (%s), cloud for scenes').format(lan.ip)
            : _('Cloud only. Turn on LAN Control in the Govee Home app for instant control.')));
        row.add_row(infoRow(_('Features'), featureSummary(device.capabilities, device) || _('None reported')));
        return row;
    }

    _move(sorted, index, delta) {
        const ids = sorted.map(d => d.id);
        const [id] = ids.splice(index, 1);
        ids.splice(index + delta, 0, id);
        const config = getDevicesConfig(this._settings);
        ids.forEach((deviceId, order) => {
            config[deviceId] = {...config[deviceId], order};
        });
        setDevicesConfig(this._settings, config);
    }
});

