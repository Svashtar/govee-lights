// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// Govee capability model: parses the cloud's capability list into what the UI
// needs, converts state from both transports into one shape, and builds the
// command for each action. Pure (no gi imports) so it is unit tested.
//
// Internal state shape, shared by the cloud and LAN paths:
//   {online, power, brightness (percent 1–100), color: {r,g,b} | null,
//    kelvin | null, scene: {kind, name} | null}

const T = 'devices.capabilities.';

export const CAP = {
    online: {type: `${T}online`, instance: 'online'},
    power: {type: `${T}on_off`, instance: 'powerSwitch'},
    brightness: {type: `${T}range`, instance: 'brightness'},
    temperature: {type: `${T}color_setting`, instance: 'colorTemperatureK'},
    color: {type: `${T}color_setting`, instance: 'colorRgb'},
    scene: {type: `${T}dynamic_scene`, instance: 'lightScene'},
    diyScene: {type: `${T}dynamic_scene`, instance: 'diyScene'},
    snapshot: {type: `${T}dynamic_scene`, instance: 'snapshot'},
    musicMode: {type: `${T}music_setting`, instance: 'musicMode'},
};

// Actions the LAN API can carry. Everything else needs the cloud.
export const LAN_ACTIONS = new Set(['power', 'brightness', 'temperature', 'color']);

export const key = cap => `${cap.type}.${cap.instance}`;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, Math.round(v)));

function rangeOf(cap, fallback) {
    const r = cap?.parameters?.range;
    if (Number.isFinite(r?.min) && Number.isFinite(r?.max) && r.max > r.min)
        return {min: r.min, max: r.max};
    return fallback;
}

function enumOptions(options) {
    if (!Array.isArray(options))
        return [];
    return options
        .filter(o => typeof o?.name === 'string' && o.value !== undefined)
        .map(o => ({name: o.name, value: o.value}));
}

// capabilities: the `capabilities` array of one device from GET user/devices.
// Scene and DIY scene lists come from separate endpoints (see parseSceneList)
// and are filled in later; here only their support is recorded.
export function parseCapabilities(capabilities = []) {
    const find = cap => capabilities.find(c => c?.type === cap.type && c?.instance === cap.instance);

    const brightness = find(CAP.brightness);
    const temperature = find(CAP.temperature);
    const music = find(CAP.musicMode);
    const musicFields = music?.parameters?.fields ?? [];
    const musicModeField = musicFields.find(f => f.fieldName === 'musicMode');
    const sensitivityField = musicFields.find(f => f.fieldName === 'sensitivity');

    return {
        power: Boolean(find(CAP.power)),
        brightness: brightness ? rangeOf(brightness, {min: 1, max: 100}) : null,
        temperature: temperature ? rangeOf(temperature, {min: 2000, max: 9000}) : null,
        color: Boolean(find(CAP.color)),
        scenes: Boolean(find(CAP.scene)),
        diyScenes: Boolean(find(CAP.diyScene)),
        snapshots: enumOptions(find(CAP.snapshot)?.parameters?.options),
        musicModes: enumOptions(musicModeField?.options),
        musicSensitivity: sensitivityField ? rangeOf(sensitivityField, {min: 0, max: 100}) : null,
    };
}

// Response body of POST device/scenes or device/diy-scenes →
// [{name, value}] where value is what device/control expects.
export function parseSceneList(body, cap) {
    const caps = body?.payload?.capabilities;
    if (!Array.isArray(caps))
        return [];
    const match = caps.find(c => c?.instance === cap.instance) ?? caps[0];
    return enumOptions(match?.parameters?.options);
}

// ---- Colour --------------------------------------------------------------

export const packRgb = ({r, g, b}) => ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
export const unpackRgb = n => ({r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff});

// h in [0, 360), s and v in [0, 1]
export function hsvToRgb(h, s, v) {
    const f = n => {
        const k = (n + h / 60) % 6;
        return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
    };
    return {r: f(5), g: f(3), b: f(1)};
}

export function rgbToHsv({r, g, b}) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
    let h = 0;
    if (d) {
        if (max === R)
            h = 60 * (((G - B) / d) % 6);
        else if (max === G)
            h = 60 * ((B - R) / d + 2);
        else
            h = 60 * ((R - G) / d + 4);
    }
    return {h: (h + 360) % 360, s: max ? d / max : 0, v: max};
}

// Approximate colour of a white light at `kelvin`, for previews only
// (Tanner Helland's fit of the black-body curve).
export function kelvinToRgb(kelvin) {
    const t = kelvin / 100;
    const c = x => clamp(x, 0, 255);
    const r = t <= 66 ? 255 : c(329.698727446 * (t - 60) ** -0.1332047592);
    const g = t <= 66 ? c(99.4708025861 * Math.log(t) - 161.1195681661) : c(288.1221695283 * (t - 60) ** -0.0755148492);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : c(138.5177312231 * Math.log(t - 10) - 305.0447927307);
    return {r, g, b};
}

export const toHex = ({r, g, b}) => `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;

// ---- Brightness scale ----------------------------------------------------

// Some lights report brightness on a non-percent range (e.g. 0–254). The UI
// and the LAN API always work in percent.
export function brightnessToPercent(value, range) {
    if (!range || (range.min <= 1 && range.max === 100))
        return clamp(value, 1, 100);
    return clamp(((value - range.min) / (range.max - range.min)) * 99 + 1, 1, 100);
}

export function brightnessFromPercent(percent, range) {
    if (!range || (range.min <= 1 && range.max === 100))
        return clamp(percent, Math.max(1, range?.min ?? 1), 100);
    return clamp(range.min + ((percent - 1) / 99) * (range.max - range.min), range.min, range.max);
}

// ---- State ---------------------------------------------------------------

// Response body of POST device/state → {"type.instance": value}
export function flattenState(body) {
    const caps = (body?.payload ?? body)?.capabilities;
    const flat = {};
    if (Array.isArray(caps)) {
        for (const c of caps) {
            if (c?.type && c.state && 'value' in c.state)
                flat[`${c.type}.${c.instance}`] = c.state.value;
        }
    }
    return flat;
}

export function stateFromCloud(flat, caps) {
    const state = {};
    const online = flat[key(CAP.online)];
    if (online !== undefined)
        state.online = online === true || online === 'true' || online === 1;
    if (flat[key(CAP.power)] !== undefined)
        state.power = Number(flat[key(CAP.power)]) === 1;
    if (Number.isFinite(flat[key(CAP.brightness)]))
        state.brightness = brightnessToPercent(flat[key(CAP.brightness)], caps.brightness);

    // Govee reports both values; a temperature of 0 means the light is in
    // RGB mode, otherwise it is showing white at that temperature.
    const kelvin = flat[key(CAP.temperature)];
    const rgb = flat[key(CAP.color)];
    if (Number.isFinite(kelvin) && kelvin > 0) {
        state.kelvin = kelvin;
        state.color = null;
    } else if (Number.isFinite(rgb)) {
        state.color = unpackRgb(rgb);
        state.kelvin = null;
    }
    return state;
}

// devStatus data → state. LAN replies only come from lights that are online.
export function stateFromLan(data) {
    const state = {online: true};
    if (data.onOff !== undefined)
        state.power = Number(data.onOff) === 1;
    if (Number.isFinite(data.brightness))
        state.brightness = clamp(data.brightness, 1, 100);
    if (Number.isFinite(data.colorTemInKelvin) && data.colorTemInKelvin > 0) {
        state.kelvin = data.colorTemInKelvin;
        state.color = null;
    } else if (data.color) {
        state.color = {r: data.color.r ?? 0, g: data.color.g ?? 0, b: data.color.b ?? 0};
        state.kelvin = null;
    }
    return state;
}

// The state a successful action leads to, applied before the light confirms.
export function optimisticState(action, value) {
    switch (action) {
    case 'power': return {power: Boolean(value)};
    case 'brightness': return {power: true, brightness: value};
    case 'temperature': return {power: true, kelvin: value, color: null, scene: null};
    case 'color': return {power: true, color: value, kelvin: null, scene: null};
    case 'scene': case 'diyScene': case 'snapshot': case 'musicMode':
        return {power: true, scene: {kind: action, name: value.name}};
    default: return {};
    }
}

// ---- Commands ------------------------------------------------------------

export function supports(caps, action) {
    switch (action) {
    case 'power': return caps.power;
    case 'brightness': return caps.brightness !== null;
    case 'temperature': return caps.temperature !== null;
    case 'color': return caps.color;
    case 'scene': return caps.scenes;
    case 'diyScene': return caps.diyScenes;
    case 'snapshot': return caps.snapshots.length > 0;
    case 'musicMode': return caps.musicModes.length > 0;
    default: return false;
    }
}

// value per action:
//   power: boolean, brightness: percent, temperature: kelvin, color: {r,g,b},
//   scene/diyScene/snapshot/musicMode: an option {name, value}
// Returns the device/control `capability` object.
export function cloudCommand(caps, action, value) {
    switch (action) {
    case 'power':
        return {...CAP.power, value: value ? 1 : 0};
    case 'brightness':
        return {...CAP.brightness, value: brightnessFromPercent(value, caps.brightness)};
    case 'temperature':
        return {...CAP.temperature, value: clamp(value, caps.temperature.min, caps.temperature.max)};
    case 'color':
        return {...CAP.color, value: packRgb(value)};
    case 'scene':
    case 'diyScene':
    case 'snapshot':
        return {...CAP[action], value: value.value};
    case 'musicMode': {
        const v = {musicMode: value.value};
        if (caps.musicSensitivity)
            v.sensitivity = clamp(50, caps.musicSensitivity.min, caps.musicSensitivity.max);
        return {...CAP.musicMode, value: v};
    }
    default:
        throw new Error(`Unknown action ${action}`);
    }
}

// Returns {cmd, data} for the LAN API, or null when the action needs the cloud.
export function lanCommand(caps, action, value) {
    switch (action) {
    case 'power':
        return {cmd: 'turn', data: {value: value ? 1 : 0}};
    case 'brightness':
        return {cmd: 'brightness', data: {value: clamp(value, 1, 100)}};
    case 'temperature':
        return {cmd: 'colorwc', data: {color: {r: 0, g: 0, b: 0}, colorTemInKelvin: clamp(value, caps.temperature.min, caps.temperature.max)}};
    case 'color':
        return {cmd: 'colorwc', data: {color: value, colorTemInKelvin: 0}};
    default:
        return null;
    }
}
