// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

// Asks for a preset name; onSave(name) runs when the user confirms.
export const SavePresetDialog = GObject.registerClass(
class GoveeLightsSavePresetDialog extends ModalDialog.ModalDialog {
    _init(suggestedName, description, onSave) {
        super._init({styleClass: 'govee-save-preset-dialog'});
        this._onSave = onSave;

        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'govee-save-preset-box'});
        box.add_child(new St.Label({text: _('Save as Preset'), style_class: 'headline'}));
        box.add_child(new St.Label({text: description, style_class: 'govee-save-preset-description'}));
        this._entry = new St.Entry({text: suggestedName, can_focus: true, x_expand: true, style_class: 'govee-save-preset-entry'});
        this._entry.clutter_text.connect('activate', () => this._save());
        box.add_child(this._entry);
        this.contentLayout.add_child(box);

        this.addButton({label: _('Cancel'), action: () => this.close(), key: Clutter.KEY_Escape});
        this.addButton({label: _('Save'), action: () => this._save(), default: true});
        this.setInitialKeyFocus(this._entry.clutter_text);
        this._entry.clutter_text.set_selection(0, -1);
    }

    _save() {
        const name = this._entry.text.trim();
        if (!name)
            return;
        this.close();
        this._onSave(name);
    }
});
