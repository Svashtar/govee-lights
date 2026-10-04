import {test, assertEqual, done} from './harness.js';
import {parseCapabilities} from '../src/lib/capabilities.js';
import {planPreset, stepFromState, sanitizePresets, matchesQuery} from '../src/lib/presets.js';

const full = parseCapabilities([
    {type: 'devices.capabilities.on_off', instance: 'powerSwitch'},
    {type: 'devices.capabilities.range', instance: 'brightness'},
    {type: 'devices.capabilities.color_setting', instance: 'colorRgb'},
    {type: 'devices.capabilities.color_setting', instance: 'colorTemperatureK'},
    {type: 'devices.capabilities.dynamic_scene', instance: 'lightScene'},
]);
const plug = parseCapabilities([{type: 'devices.capabilities.on_off', instance: 'powerSwitch'}]);
const devices = new Map([
    ['A', {id: 'A', capabilities: full, scenes: [{name: 'Aurora', value: {id: 1, paramId: 2}}], diyScenes: []}],
    ['B', {id: 'B', capabilities: plug, scenes: [], diyScenes: []}],
]);

test('multi-light preset plans each light in order', () => {
    const {plans, skipped} = planPreset({steps: [
        {deviceId: 'A', brightness: 20, scene: {kind: 'scene', name: 'Aurora', value: {id: 1, paramId: 2}}},
        {deviceId: 'B', power: false},
        {deviceId: 'GONE', power: true},
    ]}, devices);
    assertEqual(plans, [
        {deviceId: 'A', actions: [
            {action: 'power', value: true}, {action: 'brightness', value: 20},
            {action: 'scene', value: {name: 'Aurora', value: {id: 1, paramId: 2}}},
        ]},
        {deviceId: 'B', actions: [{action: 'power', value: false}]},
    ]);
    assertEqual(skipped, ['GONE']);
});

test('unsupported values are dropped, not sent', () => {
    const {plans} = planPreset({steps: [{deviceId: 'B', brightness: 50, color: {r: 1, g: 2, b: 3}}]}, devices);
    assertEqual(plans[0].actions, [{action: 'power', value: true}]);
});

test('colour wins over temperature only when no scene', () => {
    const {plans} = planPreset({steps: [{deviceId: 'A', color: {r: 1, g: 2, b: 3}, temperature: 3000}]}, devices);
    assertEqual(plans[0].actions.at(-1).action, 'color');
});

test('step from current state', () => {
    const dev = devices.get('A');
    assertEqual(stepFromState(dev, {power: true, brightness: 40, scene: {kind: 'scene', name: 'Aurora'}, color: {r: 1, g: 1, b: 1}}),
        {deviceId: 'A', power: true, brightness: 40, scene: {kind: 'scene', name: 'Aurora', value: {id: 1, paramId: 2}}});
    assertEqual(stepFromState(dev, {power: true, brightness: 40, kelvin: 2700, color: null}),
        {deviceId: 'A', power: true, brightness: 40, temperature: 2700});
    assertEqual(stepFromState(dev, {power: false, brightness: 40}), {deviceId: 'A', power: false});
});

test('sanitize drops junk', () => {
    const out = sanitizePresets([{id: 'x', name: 'Ok', steps: [{deviceId: 'A'}, null, {foo: 1}]}, {name: 5}, null]);
    assertEqual(out, [{id: 'x', name: 'Ok', steps: [{deviceId: 'A'}]}]);
});

test('option search ignores case, accents and word order', () => {
    assertEqual(matchesQuery('Auróra Borealis', 'aurora'), true);
    assertEqual(matchesQuery('Auróra Borealis', 'bor aur'), true);
    assertEqual(matchesQuery('Sunrise', 'aurora'), false);
    assertEqual(matchesQuery('Sunrise', '  '), true);
});

done();
