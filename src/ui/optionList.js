// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {matchesQuery} from '../lib/presets.js';
import {CheckItem} from './checkItem.js';
import {ExpanderItem} from './expanderItem.js';

// Longer lists get a search field and scroll inside a fixed height.
const LONG_LIST = 8;

// Scenes, DIY scenes, snapshots or music modes of one light: a header row
// that expands a scrollable list. Picking an option keeps the list open and
// moves the checkmark, so options can be tried one after another.
export class OptionList extends PopupMenu.PopupMenuSection {
    // options: [{name, value}]; onPick(option); onExpand(list) when opened
    constructor({label, iconName, searchHint, options, onPick, onExpand}) {
        super();
        this.expanded = false;
        this._onExpand = onExpand;

        this._header = new ExpanderItem(label, iconName, () => this.setExpanded(!this.expanded));
        this.addMenuItem(this._header);

        const long = options.length > LONG_LIST;
        if (long) {
            this._search = new St.Entry({
                hint_text: searchHint,
                can_focus: true,
                style_class: 'lightsbuddy-option-search',
                primary_icon: new St.Icon({icon_name: 'edit-find-symbolic', style_class: 'popup-menu-icon'}),
                visible: false,
            });
            this.box.add_child(this._search);
        }

        const listBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
        this._items = options.map(option => {
            const item = new CheckItem(option.name, () => onPick(option));
            listBox.add_child(item);
            return {name: option.name, item};
        });
        this._empty = new St.Label({text: _('No matches'), style_class: 'lightsbuddy-option-empty', visible: false});
        listBox.add_child(this._empty);

        this._scroll = new St.ScrollView({
            style_class: long ? 'lightsbuddy-option-list lightsbuddy-option-list-long' : 'lightsbuddy-option-list',
            child: listBox,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: long ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER,
            visible: false,
        });
        this.box.add_child(this._scroll);

        if (long)
            this._connectSearch();
    }

    _connectSearch() {
        const text = this._search.clutter_text;
        const firstMatch = () => this._items.find(i => i.item.visible)?.item;

        text.connect('text-changed', () => {
            let shown = 0;
            for (const {name, item} of this._items) {
                item.visible = matchesQuery(name, this._search.text);
                shown += item.visible ? 1 : 0;
            }
            this._empty.visible = shown === 0;
        });
        text.connect('activate', () => firstMatch()?.activate(Clutter.get_current_event()));
        text.connect('key-press-event', (_actor, event) => {
            const first = firstMatch();
            if (event.get_key_symbol() !== Clutter.KEY_Down || !first)
                return Clutter.EVENT_PROPAGATE;
            first.grab_key_focus();
            return Clutter.EVENT_STOP;
        });
    }

    setExpanded(expanded) {
        if (this.expanded === expanded)
            return;
        this.expanded = expanded;
        this._header.setExpanded(expanded);
        this._scroll.visible = expanded;
        if (this._search) {
            this._search.visible = expanded;
            if (expanded)
                this._search.clutter_text.grab_key_focus();
            else
                this._search.text = '';
        }
        if (expanded)
            this._onExpand(this);
    }

    // Marks the option named `name` (or none, for null).
    setChecked(name) {
        for (const {name: n, item} of this._items)
            item.setChecked(n === name);
    }
}
