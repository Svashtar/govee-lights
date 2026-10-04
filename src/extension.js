// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {getPresets, setPresets} from './lib/config.js';
import {DeviceManager} from './lib/deviceManager.js';
import {newId, stepFromState} from './lib/presets.js';
import {PanelIndicator} from './ui/panelIndicator.js';
import {QuickToggles} from './ui/quickToggles.js';
import {SavePresetDialog} from './ui/savePresetDialog.js';

export default class LightsBuddyExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._gicon = Gio.icon_new_for_string(`${this.path}/icons/lightsbuddy-symbolic.svg`);
        this._notified = new Set();
        this._timeouts = new Set();

        this._manager = new DeviceManager(this._settings);
        this._errorId = this._manager.connect('error', (_m, kind, message) => this._notify(kind, message));

        const savePreset = devices => this._savePreset(devices);
        this._indicator = new PanelIndicator(this._manager, this._gicon, {
            openPreferences: () => this.openPreferences(),
            savePreset,
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._quickToggles = new QuickToggles(this._manager, this._gicon, savePreset);

        this._manager.start().catch(e => logError(e, 'lightsbuddy: start'));
    }

    disable() {
        this._quickToggles?.destroy();
        this._quickToggles = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._timeouts.forEach(id => GLib.source_remove(id));
        this._timeouts = null;
        this._source?.destroy();
        this._source = null;
        this._manager?.disconnect(this._errorId);
        this._manager?.destroy();
        this._manager = null;
        this._settings = null;
        this._gicon = null;
        this._notified = null;
    }

    _savePreset(devices) {
        const known = devices.filter(d => d.state.power !== null);
        if (!known.length) {
            Main.notify(_('LightsBuddy'), _('The light’s state isn’t known yet. Open its menu and try again.'));
            return;
        }
        const suggested = known.length === 1 ? known[0].name : _('My Preset');
        const description = known.map(d => d.name).join(', ');
        const dialog = new SavePresetDialog(suggested, description, name => {
            const presets = getPresets(this._settings);
            presets.push({id: newId(), name, steps: known.map(d => stepFromState(d, d.state))});
            setPresets(this._settings, presets);
        });
        dialog.open();
    }

    // Auth and rate-limit problems are shown once per session each, not on
    // every failed request.
    _notify(kind, message) {
        if (this._notified.has(kind))
            return;
        this._notified.add(kind);

        let title, body;
        switch (kind) {
        case 'auth':
            title = _('Govee API key rejected');
            body = _('Check the key in LightsBuddy settings.');
            break;
        case 'rate-limit':
            title = _('Govee rate limit reached');
            body = _('Cloud control pauses until the limit resets. Lights on your LAN keep working.');
            break;
        case 'rate-warning':
            title = _('Almost at the Govee daily limit');
            body = _('%s cloud requests used today.').format(message);
            break;
        default:
            return;
        }

        if (!this._source) {
            this._source = new MessageTray.Source({title: _('LightsBuddy'), icon: this._gicon});
            this._source.connect('destroy', () => {
                this._source = null;
            });
            Main.messageTray.add(this._source);
        }
        const notification = new MessageTray.Notification({source: this._source, title, body});
        if (kind === 'auth')
            notification.addAction(_('Open Settings'), () => this.openPreferences());
        this._source.addNotification(notification);

        // Allow the same warning again later in a long session.
        const id = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 3600, () => {
            this._timeouts.delete(id);
            this._notified.delete(kind);
            return GLib.SOURCE_REMOVE;
        });
        this._timeouts.add(id);
    }
}
