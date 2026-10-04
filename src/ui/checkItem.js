// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// A menu row that runs `onActivate` without closing the menu, with a
// checkmark at its right edge. Used for presets and scene lists, where you
// often try several in a row. GNOME's own ornament sits on the left (or just
// after the label), so this row draws its own.
export const CheckItem = GObject.registerClass(
class LightsBuddyCheckItem extends PopupMenu.PopupBaseMenuItem {
    _init(text, onActivate, {iconName = null, styleClass = null} = {}) {
        super._init(styleClass ? {style_class: styleClass} : {});
        this._onActivate = onActivate;

        if (iconName)
            this.add_child(new St.Icon({icon_name: iconName, style_class: 'popup-menu-icon'}));
        this.label = new St.Label({text, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this.add_child(this.label);
        this.label_actor = this.label;

        // Hidden with opacity, not visibility, so labels don't shift when the
        // checkmark moves to another row.
        this._check = new St.Icon({icon_name: 'object-select-symbolic', style_class: 'popup-menu-icon', opacity: 0});
        this.add_child(this._check);
        this.checked = false;
    }

    // Overrides the default, which emits 'activate' and closes the menu.
    activate(_event) {
        this._onActivate();
    }

    setChecked(checked) {
        if (this.checked === checked)
            return;
        this.checked = checked;
        this._check.opacity = checked ? 255 : 0;
        if (checked)
            this.add_accessible_state(Atk.StateType.CHECKED);
        else
            this.remove_accessible_state(Atk.StateType.CHECKED);
    }
});
