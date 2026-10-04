// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// A row with an arrow that shows or hides content below it, without closing
// the menu. GNOME's PopupSubMenu can't be used here: only one submenu may be
// open at a time, so a submenu inside another one closes its parent.
export const ExpanderItem = GObject.registerClass(
class LightsBuddyExpanderItem extends PopupMenu.PopupBaseMenuItem {
    _init(text, icon, onToggle) {
        super._init({style_class: 'lightsbuddy-expander-item'});
        this._onToggle = onToggle;

        this.icon = new St.Icon({style_class: 'popup-menu-icon'});
        if (icon instanceof Gio.Icon)
            this.icon.gicon = icon;
        else
            this.icon.icon_name = icon;
        this.add_child(this.icon);

        this.label = new St.Label({text, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this.add_child(this.label);
        this.label_actor = this.label;

        this._arrow = new St.Icon({
            icon_name: 'pan-end-symbolic',
            style_class: 'popup-menu-arrow',
            y_align: Clutter.ActorAlign.CENTER,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this.add_child(this._arrow);
    }

    addSuffix(actor) {
        this.insert_child_below(actor, this._arrow);
    }

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
});
