// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {changelogToMarkup} from '../lib/markdown.js';
import {BACKUP_KEYS, buildBackup, parseBackup} from '../lib/settingsBackup.js';

const JSON_KEYS = new Set(['devices-config', 'presets']);

Gio._promisify(Gtk.FileDialog.prototype, 'save', 'save_finish');
Gio._promisify(Gtk.FileDialog.prototype, 'open', 'open_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

function linkRow(title, subtitle, uri) {
    const row = new Adw.ActionRow({title, subtitle, activatable: true});
    row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
    row.connect('activated', () => {
        new Gtk.UriLauncher({uri}).launch(row.get_root(), null, null);
    });
    return row;
}

function suffixLabel(row, label) {
    row.add_suffix(new Gtk.Label({label, css_classes: ['dim-label'], selectable: true}));
    return row;
}

export const AboutPage = GObject.registerClass(
class GoveeLightsAboutPage extends Adw.PreferencesPage {
    // getDebugInfo: async () => string
    _init({window, settings, metadata, path, getDebugInfo}) {
        super._init({title: _('About'), icon_name: 'help-about-symbolic', name: 'about'});

        this._window = window;
        this._settings = settings;
        this._metadata = metadata;

        const version = metadata['version-name'] ?? String(metadata.version);
        const repo = metadata.url;

        // Header ---------------------------------------------------------------
        const header = new Adw.PreferencesGroup();
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6, margin_bottom: 12});
        box.append(new Gtk.Image({icon_name: 'govee-lights', pixel_size: 112, margin_bottom: 6}));
        box.append(new Gtk.Label({label: _('Govee Lights'), css_classes: ['title-1']}));
        box.append(new Gtk.Label({
            label: _('Control your Govee lights from the top bar and Quick Settings'),
            css_classes: ['dim-label'],
            wrap: true,
            justify: Gtk.Justification.CENTER,
        }));
        header.add(box);
        this.add(header);

        // Version --------------------------------------------------------------
        const info = new Adw.PreferencesGroup();
        info.add(suffixLabel(new Adw.ActionRow({title: _('Version')}), version));
        if (metadata.commit)
            info.add(suffixLabel(new Adw.ActionRow({title: _('Git commit')}), metadata.commit));

        const whatsNew = new Adw.ActionRow({title: _('What’s New'), activatable: true});
        whatsNew.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
        whatsNew.connect('activated', () => this._showChangelog(path));
        info.add(whatsNew);
        this.add(info);

        // Links ----------------------------------------------------------------
        const links = new Adw.PreferencesGroup({title: _('Help')});
        links.add(linkRow(_('Website'), _('Features, screenshots and installation'), repo));
        links.add(linkRow(_('Documentation'), _('Setup, LAN control, presets and troubleshooting'), `${repo}/tree/main/docs`));
        links.add(linkRow(_('Report an Issue'), _('Include the debug info below'), `${repo}/issues/new/choose`));

        const debugRow = new Adw.ActionRow({
            title: _('Copy Debug Info'),
            subtitle: _('Versions, settings and light models. Never your API key or device IDs.'),
            activatable: true,
        });
        debugRow.add_suffix(new Gtk.Image({icon_name: 'edit-copy-symbolic'}));
        debugRow.connect('activated', async () => {
            try {
                const text = await getDebugInfo();
                Gdk.Display.get_default().get_clipboard().set(text);
                this._toast(_('Debug info copied'));
            } catch (e) {
                logError(e, 'govee-lights: debug info');
                this._toast(_('Could not collect debug info'));
            }
        });
        links.add(debugRow);
        this.add(links);

        // Settings backup ------------------------------------------------------
        const backup = new Adw.PreferencesGroup({
            title: _('Settings'),
            description: _('Backups include names, placements and presets. The API key stays in your keyring.'),
        });
        const exportRow = new Adw.ActionRow({title: _('Export Settings…'), activatable: true});
        exportRow.connect('activated', () => this._export().catch(e => this._fail(e)));
        const importRow = new Adw.ActionRow({title: _('Import Settings…'), activatable: true});
        importRow.connect('activated', () => this._import().catch(e => this._fail(e)));
        const resetRow = new Adw.ActionRow({title: _('Reset All Settings…'), activatable: true});
        resetRow.add_css_class('error');
        resetRow.connect('activated', () => this._confirmReset());
        for (const row of [exportRow, importRow, resetRow])
            backup.add(row);
        this.add(backup);

        // Legal ----------------------------------------------------------------
        const legal = new Adw.PreferencesGroup();
        legal.add(linkRow(_('License'), _('GNU General Public License, version 2 or later'),
            'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html'));
        const disclaimer = new Gtk.Label({
            label: _('Govee is a trademark of Shenzhen Intellirocks Tech. Co., Ltd. This extension is not affiliated with or endorsed by Govee.'),
            css_classes: ['dim-label', 'caption'],
            wrap: true,
            justify: Gtk.Justification.CENTER,
            margin_top: 12,
        });
        legal.add(disclaimer);
        this.add(legal);
    }

    _toast(title) {
        this._window.add_toast(new Adw.Toast({title}));
    }

    _fail(e) {
        if (e.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED))
            return;
        logError(e, 'govee-lights: settings backup');
        this._toast(e.message);
    }

    _readChangelog(path) {
        // Packed builds ship CHANGELOG.md next to metadata.json; a source
        // checkout keeps it at the repository root.
        for (const candidate of [`${path}/CHANGELOG.md`, `${path}/../CHANGELOG.md`]) {
            try {
                const [, bytes] = GLib.file_get_contents(candidate);
                return new TextDecoder().decode(bytes);
            } catch {}
        }
        return null;
    }

    _showChangelog(path) {
        const text = this._readChangelog(path);
        const label = new Gtk.Label({
            label: text ? changelogToMarkup(text) : _('Release notes are not available.'),
            use_markup: Boolean(text),
            wrap: true,
            xalign: 0,
            selectable: true,
            margin_top: 18,
            margin_bottom: 18,
            margin_start: 18,
            margin_end: 18,
        });
        const card = new Gtk.Box({css_classes: ['card']});
        card.append(label);

        const clamp = new Adw.Clamp({child: card, margin_top: 12, margin_bottom: 24, margin_start: 12, margin_end: 12});
        const toolbar = new Adw.ToolbarView({content: new Gtk.ScrolledWindow({child: clamp, vexpand: true})});
        toolbar.add_top_bar(new Adw.HeaderBar());
        this._window.push_subpage(new Adw.NavigationPage({title: _('What’s New'), child: toolbar}));
    }

    _currentValues() {
        const values = {};
        for (const key of BACKUP_KEYS) {
            const variant = this._settings.get_value(key);
            values[key] = JSON_KEYS.has(key) ? JSON.parse(variant.unpack()) : variant.recursiveUnpack();
        }
        return values;
    }

    async _export() {
        const dialog = new Gtk.FileDialog({initial_name: 'govee-lights-settings.json'});
        const file = await dialog.save(this._window, null);
        const json = buildBackup(this._currentValues(), this._metadata['version-name']);
        await file.replace_contents_async(new TextEncoder().encode(json), null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        this._toast(_('Settings exported'));
    }

    async _import() {
        const filter = new Gtk.FileFilter({name: _('JSON files')});
        filter.add_mime_type('application/json');
        const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
        filters.append(filter);

        const dialog = new Gtk.FileDialog({filters});
        const file = await dialog.open(this._window, null);
        const [bytes] = await file.load_contents_async(null);
        const values = parseBackup(new TextDecoder().decode(bytes));

        for (const [key, value] of Object.entries(values)) {
            if (typeof value === 'string')
                this._settings.set_string(key, value);
            else if (typeof value === 'boolean')
                this._settings.set_boolean(key, value);
            else
                this._settings.set_uint(key, value);
        }
        this._toast(_('Settings imported'));
    }

    _confirmReset() {
        const dialog = new Adw.AlertDialog({
            heading: _('Reset All Settings?'),
            body: _('Names, placements and presets will be removed. Your API key is kept.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('reset', _('Reset'));
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.connect('response', (_d, response) => {
            if (response !== 'reset')
                return;
            for (const key of this._settings.settings_schema.list_keys()) {
                if (key !== 'request-counter')
                    this._settings.reset(key);
            }
            this._toast(_('Settings reset'));
        });
        dialog.present(this._window);
    }
});
