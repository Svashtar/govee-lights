import {test, assertEqual, done} from './harness.js';
import * as C from '../src/lib/capabilities.js';

const DEVICE_CAPS = [
    {type: 'devices.capabilities.on_off', instance: 'powerSwitch', parameters: {dataType: 'ENUM', options: [{name: 'on', value: 1}, {name: 'off', value: 0}]}},
    {type: 'devices.capabilities.range', instance: 'brightness', parameters: {range: {min: 1, max: 100, precision: 1}}},
    {type: 'devices.capabilities.color_setting', instance: 'colorRgb', parameters: {range: {min: 0, max: 16777215}}},
    {type: 'devices.capabilities.color_setting', instance: 'colorTemperatureK', parameters: {range: {min: 2700, max: 6500}}},
    {type: 'devices.capabilities.dynamic_scene', instance: 'lightScene', parameters: {dataType: 'ENUM', options: []}},
    {type: 'devices.capabilities.dynamic_scene', instance: 'snapshot', parameters: {dataType: 'ENUM', options: [{name: 'Evening', value: 4711}]}},
    {type: 'devices.capabilities.music_setting', instance: 'musicMode', parameters: {dataType: 'STRUCT', fields: [
        {fieldName: 'musicMode', dataType: 'ENUM', options: [{name: 'Energic', value: 5}, {name: 'Rhythm', value: 3}]},
        {fieldName: 'sensitivity', dataType: 'INTEGER', range: {min: 0, max: 100}},
    ]}},
];

const caps = C.parseCapabilities(DEVICE_CAPS);

test('parses supported capabilities and ranges', () => {
    assertEqual(caps.power, true);
    assertEqual(caps.brightness, {min: 1, max: 100});
    assertEqual(caps.temperature, {min: 2700, max: 6500});
    assertEqual(caps.color, true);
    assertEqual(caps.scenes, true);
    assertEqual(caps.diyScenes, false);
    assertEqual(caps.snapshots, [{name: 'Evening', value: 4711}]);
    assertEqual(caps.musicModes.map(m => m.name), ['Energic', 'Rhythm']);
});

test('gates every control, colour included', () => {
    const plug = C.parseCapabilities([DEVICE_CAPS[0]]);
    for (const action of ['brightness', 'temperature', 'color', 'scene', 'diyScene', 'snapshot', 'musicMode'])
        assertEqual(C.supports(plug, action), false, action);
    assertEqual(C.supports(plug, 'power'), true);
});

test('falls back to sane ranges when parameters are missing or broken', () => {
    const c = C.parseCapabilities([
        {type: 'devices.capabilities.range', instance: 'brightness'},
        {type: 'devices.capabilities.color_setting', instance: 'colorTemperatureK', parameters: {range: {min: 5, max: 5}}},
    ]);
    assertEqual(c.brightness, {min: 1, max: 100});
    assertEqual(c.temperature, {min: 2000, max: 9000});
});

test('rgb packing round-trips', () => {
    assertEqual(C.packRgb({r: 255, g: 128, b: 1}), 0xff8001);
    assertEqual(C.unpackRgb(0xff8001), {r: 255, g: 128, b: 1});
});

test('hsv conversions', () => {
    assertEqual(C.hsvToRgb(0, 1, 1), {r: 255, g: 0, b: 0});
    assertEqual(C.hsvToRgb(120, 1, 1), {r: 0, g: 255, b: 0});
    assertEqual(C.hsvToRgb(240, 1, 1), {r: 0, g: 0, b: 255});
    assertEqual(Math.round(C.rgbToHsv({r: 0, g: 0, b: 255}).h), 240);
    assertEqual(C.toHex({r: 255, g: 8, b: 0}), '#ff0800');
});

test('kelvin preview: warm is orange, cool is bluish', () => {
    const warm = C.kelvinToRgb(2700), cool = C.kelvinToRgb(6500);
    assertEqual(warm.r > warm.b, true);
    assertEqual(cool.b >= 250, true);
});

test('brightness scaling for non-percent ranges', () => {
    const r = {min: 0, max: 254};
    assertEqual(C.brightnessFromPercent(100, r), 254);
    assertEqual(C.brightnessFromPercent(1, r), 0);
    assertEqual(C.brightnessToPercent(254, r), 100);
    assertEqual(C.brightnessFromPercent(150, {min: 1, max: 100}), 100);
    assertEqual(C.brightnessFromPercent(0, {min: 1, max: 100}), 1);
});

test('cloud state: temperature mode vs colour mode', () => {
    const flat = C.flattenState({payload: {capabilities: [
        {type: 'devices.capabilities.online', instance: 'online', state: {value: true}},
        {type: 'devices.capabilities.on_off', instance: 'powerSwitch', state: {value: 1}},
        {type: 'devices.capabilities.range', instance: 'brightness', state: {value: 40}},
        {type: 'devices.capabilities.color_setting', instance: 'colorRgb', state: {value: 0xff0000}},
        {type: 'devices.capabilities.color_setting', instance: 'colorTemperatureK', state: {value: 0}},
    ]}});
    assertEqual(C.stateFromCloud(flat, caps), {online: true, power: true, brightness: 40, color: {r: 255, g: 0, b: 0}, kelvin: null});
    flat['devices.capabilities.color_setting.colorTemperatureK'] = 3000;
    assertEqual(C.stateFromCloud(flat, caps).kelvin, 3000);
    assertEqual(C.stateFromCloud(flat, caps).color, null);
});

test('LAN state', () => {
    assertEqual(C.stateFromLan({onOff: 0, brightness: 55, color: {r: 1, g: 2, b: 3}, colorTemInKelvin: 0}),
        {online: true, power: false, brightness: 55, color: {r: 1, g: 2, b: 3}, kelvin: null});
});

test('cloud commands', () => {
    assertEqual(C.cloudCommand(caps, 'power', false).value, 0);
    assertEqual(C.cloudCommand(caps, 'temperature', 9000).value, 6500);
    assertEqual(C.cloudCommand(caps, 'color', {r: 0, g: 0, b: 255}), {type: 'devices.capabilities.color_setting', instance: 'colorRgb', value: 255});
    assertEqual(C.cloudCommand(caps, 'scene', {name: 'Aurora', value: {id: 1, paramId: 2}}).value, {id: 1, paramId: 2});
    assertEqual(C.cloudCommand(caps, 'musicMode', {name: 'Energic', value: 5}).value, {musicMode: 5, sensitivity: 50});
});

test('LAN commands exist only for LAN actions', () => {
    assertEqual(C.lanCommand(caps, 'brightness', 120), {cmd: 'brightness', data: {value: 100}});
    assertEqual(C.lanCommand(caps, 'temperature', 1000).data.colorTemInKelvin, 2700);
    assertEqual(C.lanCommand(caps, 'scene', {name: 'x', value: 1}), null);
});

test('scene list parsing', () => {
    const body = {payload: {capabilities: [{type: 'devices.capabilities.dynamic_scene', instance: 'lightScene',
        parameters: {options: [{name: 'Sunrise', value: {id: 10, paramId: 20}}, {bad: true}]}}]}};
    assertEqual(C.parseSceneList(body, C.CAP.scene), [{name: 'Sunrise', value: {id: 10, paramId: 20}}]);
    assertEqual(C.parseSceneList({}, C.CAP.scene), []);
});

test('optimistic state', () => {
    assertEqual(C.optimisticState('color', {r: 1, g: 2, b: 3}), {power: true, color: {r: 1, g: 2, b: 3}, kelvin: null, scene: null});
    assertEqual(C.optimisticState('scene', {name: 'Aurora', value: 1}).scene, {kind: 'scene', name: 'Aurora'});
});

done();
