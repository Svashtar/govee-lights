// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _, ngettext} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {CloudClient, DAILY_LIMIT} from '../lib/cloudClient.js';
import {
    getDevicesConfig, mergeDevicesConfig, readDevicesCache, readLanCache,
    requestCounter, requestsToday, setDevicesConfig,
} from '../lib/config.js';
import {clearApiKey, lookupApiKey, storeApiKey} from '../lib/secret.js';
import {syncDevices} from '../lib/sync.js';

export function errorMessage(e) {
    switch (e.kind) {
    case 'auth': return _('Govee rejected the API key. Check it and try again.');
    case 'rate-limit': return _('Govee’s request limit was reached. Try again later.');
    case 'network': return _('Could not reach Govee. Check your internet connection.');
    default: return e.message;
    }
}

export const AccountPage = GObject.registerClass(
class GoveeLightsAccountPage extends Adw.PreferencesPage {
    _init({window, settings, docsUrl}) {
        super._init({title: _('Account'), icon_name: 'avatar-default-symbolic', name: 'account'});
        this._window = window;
        this._settings = settings;

        // Govee account -----------------------------------------------------
        const account = new Adw.PreferencesGroup({
            title: _('Govee Account'),
            description: _('In the Govee Home app, open Profile → Settings → Apply for API Key. The key arrives by email.'),
        });

        this._keyRow = new Adw.PasswordEntryRow({title: _('API Key'), show_apply_button: true});
        this._keyRow.connect('apply', () => this._saveKey());
        account.add(this._keyRow);

        this._fetchButton = new Gtk.Button({label: _('Fetch Lights'), valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
        this._fetchButton.connect('clicked', () => this._fetch());
        this._spinner = new Adw.Spinner({visible: false});
        this._statusRow = new Adw.ActionRow({title: _('Lights')});
        this._statusRow.add_suffix(this._spinner);
        this._statusRow.add_suffix(this._fetchButton);
        account.add(this._statusRow);

        const removeKey = new Adw.ButtonRow({title: _('Remove API Key')});
        removeKey.add_css_class('destructive-action');
        removeKey.connect('activated', () => this._removeKey());
        account.add(removeKey);

        const help = new Adw.ActionRow({title: _('How to Get an API Key'), activatable: true});
        help.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        help.connect('activated', () => new Gtk.UriLauncher({uri: `${docsUrl}/getting-started.md`}).launch(this._window, null, null));
        account.add(help);
        this.add(account);

        // Local network -----------------------------------------------------
        const lan = new Adw.PreferencesGroup({
            title: _('Local Network'),
            description: _('Lights with LAN Control turned on respond instantly and work without internet. Turn it on per light in the Govee Home app: open the light, then Settings → LAN Control.'),
        });
        const lanSwitch = new Adw.SwitchRow({title: _('Control Lights over LAN'), subtitle: _('Falls back to the cloud when a light can’t be reached')});
        settings.bind('use-lan', lanSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        lan.add(lanSwitch);

        this._lanRow = new Adw.ActionRow({title: _('Reachable on LAN')});
        const scan = new Gtk.Button({label: _('Scan Now'), valign: Gtk.Align.CENTER});
        scan.connect('clicked', () => settings.set_int64('lan-scan-request', GLib.get_real_time()));
        settings.bind('use-lan', scan, 'sensitive', Gio.SettingsBindFlags.GET);
        this._lanRow.add_suffix(scan);
        lan.add(this._lanRow);
        this.add(lan);

        // Cloud usage -------------------------------------------------------
        const usage = new Adw.PreferencesGroup({
            title: _('Cloud Usage'),
            description: _('Govee allows 10,000 cloud requests per day. Commands sent over LAN don’t count.'),
        });
        this._usageRow = new Adw.ActionRow({title: _('Requests Today')});
        usage.add(this._usageRow);

        const refresh = new Adw.SpinRow({
            title: _('Refresh Light State After'),
            subtitle: _('Seconds. Cloud state is refreshed when a menu opens and is older than this.'),
            adjustment: new Gtk.Adjustment({lower: 30, upper: 3600, step_increment: 30, page_increment: 300}),
        });
        settings.bind('refresh-stale-seconds', refresh, 'value', Gio.SettingsBindFlags.DEFAULT);
        usage.add(refresh);
        this.add(usage);

        this._settingsIds = [
            settings.connect('changed::request-counter', () => this._updateUsage()),
            settings.connect('changed::cache-stamp', () => this.refresh()),
        ];
        this.connect('destroy', () => this._settingsIds.forEach(id => settings.disconnect(id)));

        this._loadKey();
        this.refresh();
        this._updateUsage();
    }

    async _loadKey() {
        try {
            this._hasKey = Boolean(await lookupApiKey());
            this._keyRow.text = '';
            this._keyRow.title = this._hasKey ? _('API Key (saved in your keyring)') : _('API Key');
        } catch (e) {
            this._toast(_('Could not open the keyring: %s').format(e.message));
        }
        this._fetchButton.sensitive = Boolean(this._hasKey);
    }

    async _saveKey() {
        const key = this._keyRow.text.trim();
        if (!key)
            return;
        try {
            await storeApiKey(key);
            await this._loadKey();
            this._settings.set_int64('cache-stamp', GLib.get_real_time());
            await this._fetch();
        } catch (e) {
            this._toast(_('Could not save the key: %s').format(e.message));
        }
    }

    async _removeKey() {
        try {
            await clearApiKey();
            await this._loadKey();
            this._settings.set_int64('cache-stamp', GLib.get_real_time());
            this._toast(_('API key removed'));
        } catch (e) {
            this._toast(e.message);
        }
    }

    async _fetch() {
        const apiKey = await lookupApiKey().catch(() => null);
        if (!apiKey) {
            this._toast(_('Enter your API key first'));
            return;
        }
        this._fetchButton.sensitive = false;
        this._spinner.visible = true;
        const client = new CloudClient({apiKey, onRequest: requestCounter(this._settings)});
        try {
            const devices = await syncDevices(client);
            setDevicesConfig(this._settings, mergeDevicesConfig(getDevicesConfig(this._settings), devices));
            this._settings.set_int64('cache-stamp', GLib.get_real_time());
            this._settings.set_int64('lan-scan-request', GLib.get_real_time());
            this._toast(ngettext('Found %d light', 'Found %d lights', devices.length).format(devices.length));
        } catch (e) {
            this._statusRow.subtitle = errorMessage(e);
        } finally {
            client.destroy();
            this._fetchButton.sensitive = true;
            this._spinner.visible = false;
        }
    }

    // Called when the device or LAN cache changes.
    refresh() {
        const {devices, updated} = readDevicesCache();
        if (!devices.length) {
            this._statusRow.subtitle = _('No lights fetched yet');
        } else {
            const when = GLib.DateTime.new_from_unix_local(updated).format('%x %X');
            this._statusRow.subtitle = ngettext('%d light, updated %s', '%d lights, updated %s', devices.length)
                .format(devices.length, when);
        }

        const lan = readLanCache();
        const reachable = devices.filter(d => lan[d.id]).length;
        this._lanRow.subtitle = devices.length
            ? _('%d of %d lights').format(reachable, devices.length)
            : _('Fetch your lights first');
    }

    _updateUsage() {
        const count = requestsToday(this._settings);
        this._usageRow.subtitle = _('%d of %d').format(count, DAILY_LIMIT);
    }

    _toast(title) {
        this._window.add_toast(new Adw.Toast({title}));
    }
});
