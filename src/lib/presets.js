// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// User presets that set one or more lights at once ("Movie night").
// Pure (no gi imports) so it is unit tested.
//
// Preset: {id, name, steps: [Step]}
// Step:   {deviceId, power?: boolean, brightness?: percent,
//          temperature?: kelvin | color?: {r,g,b} | scene?: {kind, name, value}}
//   scene.kind is one of SCENE_KINDS. Only one of temperature/color/scene is used.

import {supports} from './capabilities.js';

export const SCENE_KINDS = ['scene', 'diyScene', 'snapshot', 'musicMode'];

export function newId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Govee returns options in no useful order. Natural, case-insensitive
// alphabetical order: "Scene 2" before "Scene 10".
const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});

export function sortOptions(options) {
    return [...options].sort((a, b) => collator.compare(a.name, b.name));
}

// The options a device offers for each scene kind, sorted by name.
export function sceneOptions(device, kind) {
    switch (kind) {
    case 'scene': return sortOptions(device.scenes ?? []);
    case 'diyScene': return sortOptions(device.diyScenes ?? []);
    case 'snapshot': return sortOptions(device.capabilities.snapshots);
    case 'musicMode': return sortOptions(device.capabilities.musicModes);
    default: return [];
    }
}

// Turns a preset into per-device action lists, in the order they should be
// sent. devices: Map id → {capabilities, scenes, diyScenes}.
// Returns {plans: [{deviceId, actions: [{action, value}]}], skipped: [deviceId]}
export function planPreset(preset, devices) {
    const plans = [];
    const skipped = [];

    for (const step of preset.steps ?? []) {
        const device = devices.get(step.deviceId);
        if (!device) {
            skipped.push(step.deviceId);
            continue;
        }
        const caps = device.capabilities;
        const actions = [];
        const add = (action, value) => {
            if (supports(caps, action))
                actions.push({action, value});
        };

        if (step.power === false) {
            add('power', false);
        } else {
            // Lights ignore changes while off, so switch on first.
            add('power', true);
            if (Number.isFinite(step.brightness))
                add('brightness', step.brightness);
            if (step.scene && SCENE_KINDS.includes(step.scene.kind))
                add(step.scene.kind, {name: step.scene.name, value: step.scene.value});
            else if (step.color)
                add('color', step.color);
            else if (Number.isFinite(step.temperature))
                add('temperature', step.temperature);
        }
        if (actions.length)
            plans.push({deviceId: step.deviceId, actions});
        else
            skipped.push(step.deviceId);
    }
    return {plans, skipped};
}

// A step that recreates a light's current state. A running scene is kept
// only when it can be found by name in the device's option list.
export function stepFromState(device, state) {
    const step = {deviceId: device.id, power: state.power !== false};
    if (!step.power)
        return step;
    if (Number.isFinite(state.brightness))
        step.brightness = state.brightness;
    const option = state.scene && sceneOptions(device, state.scene.kind).find(o => o.name === state.scene.name);
    if (option)
        step.scene = {kind: state.scene.kind, name: option.name, value: option.value};
    else if (state.color)
        step.color = {...state.color};
    else if (Number.isFinite(state.kelvin))
        step.temperature = state.kelvin;
    return step;
}

// Drops steps for unknown devices and invalid values; used when loading
// presets from settings or an imported backup.
export function sanitizePresets(presets) {
    if (!Array.isArray(presets))
        return [];
    return presets
        .filter(p => p && typeof p.name === 'string' && Array.isArray(p.steps))
        .map(p => ({
            id: typeof p.id === 'string' ? p.id : newId(),
            name: p.name,
            steps: p.steps.filter(s => s && typeof s.deviceId === 'string'),
        }));
}

// Folds case and accents, so "aurora" matches "Auróra".
export function searchKey(text) {
    return String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

// Whether an option name matches a search query: every word of the query
// must appear somewhere in the name, in any order.
export function matchesQuery(name, query) {
    const words = searchKey(query).split(/\s+/).filter(Boolean);
    const key = searchKey(name);
    return words.every(w => key.includes(w));
}
