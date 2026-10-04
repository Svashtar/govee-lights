// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import System from 'system';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';

import {LAN_CACHE, getDevicesConfig, monitorFile, readDevicesCache, readLanCache} from './lib/config.js';
import {formatDebugInfo, formatGjsVersion} from './lib/debugInfo.js';
import {lookupApiKey} from './lib/secret.js';
import {AboutPage} from './prefs/aboutPage.js';
import {AccountPage} from './prefs/accountPage.js';
import {DevicesPage} from './prefs/devicesPage.js';
import {PresetsPage} from './prefs/presetsPage.js';

export default class LightsBuddyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .add_search_path(`${this.path}/icons`);

        const settings = this.getSettings();
        const docsUrl = `${this.metadata.url}/blob/main/docs`;
        window.set_default_size(700, 780);
        window.search_enabled = true;

        const account = new AccountPage({window, settings, docsUrl});
        const devices = new DevicesPage({window, settings});
        window.add(account);
        window.add(devices);
        window.add(new PresetsPage({window, settings}));
        window.add(new AboutPage({
            window,
            settings,
            metadata: this.metadata,
            path: this.path,
            getDebugInfo: () => this._debugInfo(settings),
        }));

        // The shell writes LAN scan results; show them as they arrive.
        const lanMonitor = monitorFile(LAN_CACHE, () => {
            account.refresh();
            devices.refresh();
        });
        window.connect('close-request', () => {
            lanMonitor.cancel();
            return false;
        });

        if (!readDevicesCache().devices.length)
            window.set_visible_page(account);
    }

    async _debugInfo(settings) {
        const config = getDevicesConfig(settings);
        const lan = readLanCache();
        return formatDebugInfo({
            extensionVersion: this.metadata['version-name'],
            commit: this.metadata.commit,
            shellVersion: Config.PACKAGE_VERSION,
            gjsVersion: formatGjsVersion(System.version),
            os: GLib.get_os_info('PRETTY_NAME') ?? 'unknown',
            sessionType: GLib.getenv('XDG_SESSION_TYPE') ?? 'unknown',
            useLan: settings.get_boolean('use-lan'),
            hasApiKey: Boolean(await lookupApiKey().catch(() => null)),
            lights: readDevicesCache().devices.map(d => ({
                sku: d.sku,
                connection: lan[d.id] ? 'LAN' : 'cloud',
                placement: config[d.id]?.placement ?? 'panel',
            })),
        });
    }
}
