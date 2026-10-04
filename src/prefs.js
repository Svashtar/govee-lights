// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import System from 'system';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';

import {formatDebugInfo, formatGjsVersion} from './lib/debugInfo.js';
import {AboutPage} from './prefs/aboutPage.js';

export default class GoveeLightsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .add_search_path(`${this.path}/icons`);

        const settings = this.getSettings();
        window.set_default_size(680, 760);
        window.search_enabled = true;

        window.add(new AboutPage({
            window,
            settings,
            metadata: this.metadata,
            path: this.path,
            getDebugInfo: () => this._debugInfo(settings),
        }));
    }

    async _debugInfo(settings) {
        const devices = JSON.parse(settings.get_string('devices-config'));
        return formatDebugInfo({
            extensionVersion: this.metadata['version-name'] ?? String(this.metadata.version),
            commit: this.metadata.commit,
            shellVersion: Config.PACKAGE_VERSION,
            gjsVersion: formatGjsVersion(System.version),
            os: GLib.get_os_info('PRETTY_NAME') ?? 'unknown',
            sessionType: GLib.getenv('XDG_SESSION_TYPE') ?? 'unknown',
            useLan: settings.get_boolean('use-lan'),
            hasApiKey: false,
            lights: Object.values(devices).map(d => ({
                sku: d.sku ?? '?',
                connection: 'unknown',
                placement: d.placement ?? 'hidden',
            })),
        });
    }
}
