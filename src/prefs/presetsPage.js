// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {supports, toHex} from '../lib/capabilities.js';
import {displayName, getDevicesConfig, getPresets, readDevicesCache, setPresets} from '../lib/config.js';
import {escapeMarkup} from '../lib/markdown.js';
import {newId, sanitizePresets, sceneOptions} from '../lib/presets.js';

// Mode choices in the step editor, in order. `kind` is the scene kind or null.
const MODES = () => [
    {id: 'keep', label: _('Keep Current'), kind: null},
    {id: 'temperature', label: _('White'), kind: null},
    {id: 'color', label: _('Colour'), kind: null},
    {id: 'scene', label: _('Scene'), kind: 'scene'},
    {id: 'diyScene', label: _('DIY Scene'), kind: 'diyScene'},
    {id: 'snapshot', label: _('Snapshot'), kind: 'snapshot'},
    {id: 'musicMode', label: _('Music Mode'), kind: 'musicMode'},
];

function stepSummary(step) {
    if (step.power === false)
        return _('Off');
    const parts = [_('On')];
    if (Number.isFinite(step.brightness))
        parts.push(`${step.brightness}%`);
    if (step.scene)
        parts.push(step.scene.name);
    else if (step.color)
        parts.push(toHex(step.color));
    else if (Number.isFinite(step.temperature))
        parts.push(`${step.temperature} K`);
    return parts.join(', ');
}

// Dialog that edits one preset step. onSave(step) is called with the result.
const StepDialog = GObject.registerClass(
class LightsBuddyStepDialog extends Adw.Dialog {
    _init({devices, config, step, onSave}) {
        super._init({title: step ? _('Edit Light') : _('Add Light'), content_width: 460});
        this._devices = devices;
        this._onSave = onSave;
        step = step ?? {deviceId: devices[0].id, power: true};

        const header = new Adw.HeaderBar({show_end_title_buttons: false, show_start_title_buttons: false});
        const cancel = new Gtk.Button({label: _('Cancel')});
        cancel.connect('clicked', () => this.close());
        const save = new Gtk.Button({label: _('Save'), css_classes: ['suggested-action']});
        save.connect('clicked', () => this._save());
        header.pack_start(cancel);
        header.pack_end(save);

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        page.add(group);

        this._device = new Adw.ComboRow({
            title: _('Light'),
            model: Gtk.StringList.new(devices.map(d => displayName(d, config[d.id]))),
            selected: Math.max(0, devices.findIndex(d => d.id === step.deviceId)),
        });
        group.add(this._device);

        this._power = new Adw.SwitchRow({title: _('Turn On'), active: step.power !== false});
        group.add(this._power);

        this._brightness = new Adw.SpinRow({
            title: _('Brightness'),
            subtitle: _('Percent. 0 keeps the current brightness.'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 100, step_increment: 5, page_increment: 10}),
            value: step.brightness ?? 0,
        });
        group.add(this._brightness);

        this._modes = MODES();
        let mode = 'keep';
        if (step.scene)
            mode = step.scene.kind;
        else if (step.color)
            mode = 'color';
        else if (Number.isFinite(step.temperature))
            mode = 'temperature';
        this._mode = new Adw.ComboRow({title: _('Light Mode'), model: Gtk.StringList.new(this._modes.map(m => m.label))});
        group.add(this._mode);

        this._temperature = new Adw.SpinRow({
            title: _('Colour Temperature'),
            subtitle: _('Kelvin'),
            adjustment: new Gtk.Adjustment({lower: 2000, upper: 9000, step_increment: 100, page_increment: 500}),
            value: step.temperature ?? 4000,
        });
        group.add(this._temperature);

        const rgba = new Gdk.RGBA();
        rgba.parse(step.color ? toHex(step.color) : '#ff8800');
        this._colorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: false}),
            rgba,
            valign: Gtk.Align.CENTER,
        });
        this._color = new Adw.ActionRow({title: _('Colour')});
        this._color.add_suffix(this._colorButton);
        group.add(this._color);

        this._scene = new Adw.ComboRow({title: _('Scene'), enable_search: true});
        this._scene.set_expression(Gtk.PropertyExpression.new(Gtk.StringObject, null, 'string'));
        group.add(this._scene);

        this._initialScene = step.scene?.name ?? null;
        this._device.connect('notify::selected', () => this._updateModes());
        this._mode.connect('notify::selected', () => this._updateVisibility());
        this._power.connect('notify::active', () => this._updateVisibility());
        this._updateModes(mode);

        const toolbar = new Adw.ToolbarView({content: page});
        toolbar.add_top_bar(header);
        this.child = toolbar;
    }

    get _selectedDevice() {
        return this._devices[this._device.selected];
    }

    // Shows only the modes the selected light supports.
    _updateModes(preferred) {
        const device = this._selectedDevice;
        const current = preferred ?? this._availableModes?.[this._mode.selected]?.id;
        this._availableModes = this._modes.filter(m => {
            if (m.id === 'keep')
                return true;
            if (m.kind)
                return sceneOptions(device, m.kind).length > 0 && supports(device.capabilities, m.kind);
            return supports(device.capabilities, m.id);
        });
        this._mode.model = Gtk.StringList.new(this._availableModes.map(m => m.label));
        this._mode.selected = Math.max(0, this._availableModes.findIndex(m => m.id === current));

        const t = device.capabilities.temperature;
        if (t) {
            this._temperature.adjustment.lower = t.min;
            this._temperature.adjustment.upper = t.max;
        }
        this._brightness.visible = supports(device.capabilities, 'brightness');
        this._updateVisibility();
    }

    _updateVisibility() {
        const on = this._power.active;
        const mode = this._availableModes[this._mode.selected];
        this._brightness.sensitive = on;
        this._mode.visible = on;
        this._temperature.visible = on && mode?.id === 'temperature';
        this._color.visible = on && mode?.id === 'color';
        this._scene.visible = on && Boolean(mode?.kind);

        if (mode?.kind) {
            const options = sceneOptions(this._selectedDevice, mode.kind);
            if (this._sceneKind !== mode.kind || this._sceneDevice !== this._selectedDevice) {
                this._sceneKind = mode.kind;
                this._sceneDevice = this._selectedDevice;
                this._sceneOptions = options;
                this._scene.title = mode.label;
                this._scene.model = Gtk.StringList.new(options.map(o => o.name));
                this._scene.selected = Math.max(0, options.findIndex(o => o.name === this._initialScene));
            }
        }
    }

    _save() {
        const device = this._selectedDevice;
        const step = {deviceId: device.id, power: this._power.active};
        if (step.power) {
            if (this._brightness.visible && this._brightness.value > 0)
                step.brightness = Math.round(this._brightness.value);
            const mode = this._availableModes[this._mode.selected];
            if (mode?.id === 'temperature') {
                step.temperature = Math.round(this._temperature.value);
            } else if (mode?.id === 'color') {
                const c = this._colorButton.rgba;
                step.color = {r: Math.round(c.red * 255), g: Math.round(c.green * 255), b: Math.round(c.blue * 255)};
            } else if (mode?.kind) {
                const option = this._sceneOptions?.[this._scene.selected];
                if (option)
                    step.scene = {kind: mode.kind, name: option.name, value: option.value};
            }
        }
        this._onSave(step);
        this.close();
    }
});

export const PresetsPage = GObject.registerClass(
class LightsBuddyPresetsPage extends Adw.PreferencesPage {
    _init({window, settings}) {
        super._init({title: _('Presets'), icon_name: 'view-list-bullet-symbolic', name: 'presets'});
        this._window = window;
        this._settings = settings;
        this._groups = [];
        this._writing = false;

        this._settingsIds = ['presets', 'devices-config', 'cache-stamp'].map(k =>
            settings.connect(`changed::${k}`, () => {
                if (!this._writing)
                    this.refresh();
            }));
        this.connect('destroy', () => this._settingsIds.forEach(id => settings.disconnect(id)));
        this.refresh();
    }

    _save(presets) {
        this._writing = true;
        try {
            setPresets(this._settings, presets);
        } finally {
            this._writing = false;
        }
        this.refresh();
    }

    refresh() {
        this._groups.forEach(g => this.remove(g));
        this._groups = [];

        this._presets = sanitizePresets(getPresets(this._settings));
        this._devices = readDevicesCache().devices;
        this._config = getDevicesConfig(this._settings);
        const byId = new Map(this._devices.map(d => [d.id, d]));

        const list = new Adw.PreferencesGroup({
            title: _('Presets'),
            description: _('A preset sets one or more lights in one click. Presets appear at the top of the top-bar menu. You can also save a light’s current state as a preset from its menu.'),
        });
        const add = new Gtk.Button({icon_name: 'list-add-symbolic', css_classes: ['flat'], tooltip_text: _('Add Preset'),
                                    sensitive: this._devices.length > 0});
        add.connect('clicked', () => this._addPreset());
        list.set_header_suffix(add);

        if (!this._presets.length) {
            const empty = new Adw.ActionRow({
                title: this._devices.length ? _('No presets yet') : _('Fetch your lights first'),
                subtitle: this._devices.length ? _('Use the + button to create one') : _('Presets need at least one light'),
            });
            list.add(empty);
        }

        this._presets.forEach((preset, index) => list.add(this._presetRow(preset, index, byId)));
        this.add(list);
        this._groups.push(list);
    }

    _presetRow(preset, index, byId) {
        const row = new Adw.ExpanderRow({
            title: escapeMarkup(preset.name),
            subtitle: preset.steps.length
                ? preset.steps.map(s => escapeMarkup(byId.has(s.deviceId) ? displayName(byId.get(s.deviceId), this._config[s.deviceId]) : _('Unknown light'))).join(', ')
                : _('No lights yet'),
        });

        const up = new Gtk.Button({icon_name: 'go-up-symbolic', css_classes: ['flat'], valign: Gtk.Align.CENTER,
                                   tooltip_text: _('Move Up'), sensitive: index > 0});
        up.connect('clicked', () => this._move(index, -1));
        const down = new Gtk.Button({icon_name: 'go-down-symbolic', css_classes: ['flat'], valign: Gtk.Align.CENTER,
                                     tooltip_text: _('Move Down'), sensitive: index < this._presets.length - 1});
        down.connect('clicked', () => this._move(index, 1));
        row.add_suffix(up);
        row.add_suffix(down);

        const name = new Adw.EntryRow({title: _('Name'), text: preset.name, show_apply_button: true});
        name.connect('apply', () => this._update(index, p => ({...p, name: name.text.trim() || p.name})));
        row.add_row(name);

        preset.steps.forEach((step, stepIndex) => {
            const device = byId.get(step.deviceId);
            const stepRow = new Adw.ActionRow({
                title: escapeMarkup(device ? displayName(device, this._config[step.deviceId]) : _('Unknown light')),
                subtitle: escapeMarkup(device ? stepSummary(step) : _('This light is no longer in your Govee account')),
            });
            if (device) {
                const edit = new Gtk.Button({icon_name: 'document-edit-symbolic', css_classes: ['flat'],
                                             valign: Gtk.Align.CENTER, tooltip_text: _('Edit')});
                edit.connect('clicked', () => this._editStep(index, stepIndex));
                stepRow.add_suffix(edit);
            }
            const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', css_classes: ['flat'],
                                           valign: Gtk.Align.CENTER, tooltip_text: _('Remove')});
            remove.connect('clicked', () => this._update(index, p => ({...p, steps: p.steps.filter((_s, i) => i !== stepIndex)})));
            stepRow.add_suffix(remove);
            row.add_row(stepRow);
        });

        const addStep = new Adw.ButtonRow({title: _('Add Light'), start_icon_name: 'list-add-symbolic'});
        addStep.connect('activated', () => this._editStep(index, -1));
        row.add_row(addStep);

        const remove = new Adw.ButtonRow({title: _('Delete Preset')});
        remove.add_css_class('destructive-action');
        remove.connect('activated', () => this._save(this._presets.filter((_p, i) => i !== index)));
        row.add_row(remove);
        return row;
    }

    _update(index, fn) {
        const presets = [...this._presets];
        presets[index] = fn(presets[index]);
        this._save(presets);
    }

    _move(index, delta) {
        const presets = [...this._presets];
        const [preset] = presets.splice(index, 1);
        presets.splice(index + delta, 0, preset);
        this._save(presets);
    }

    _addPreset() {
        const presets = [...this._presets, {id: newId(), name: _('New Preset'), steps: []}];
        this._save(presets);
        this._editStep(presets.length - 1, -1);
    }

    // stepIndex -1 adds a new step
    _editStep(index, stepIndex) {
        if (!this._devices.length)
            return;
        const dialog = new StepDialog({
            devices: this._devices,
            config: this._config,
            step: stepIndex >= 0 ? this._presets[index].steps[stepIndex] : null,
            onSave: step => this._update(index, p => {
                const steps = [...p.steps];
                if (stepIndex >= 0)
                    steps[stepIndex] = step;
                else
                    steps.push(step);
                return {...p, steps};
            }),
        });
        dialog.present(this._window);
    }
});
