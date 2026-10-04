import {test, assertEqual, done} from './harness.js';
import {chooseRoute, isStale} from '../src/lib/routing.js';

test('LAN first for LAN actions', () => {
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: true}, 'brightness', true), 'lan');
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: true}, 'color', true), 'lan');
});

test('cloud for scenes even when the light is on LAN', () => {
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: true}, 'scene', true), 'cloud');
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: true}, 'musicMode', true), 'cloud');
});

test('cloud when LAN is off or the light has no IP', () => {
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: true}, 'power', false), 'cloud');
    assertEqual(chooseRoute({ip: null, hasCloud: true}, 'power', true), 'cloud');
});

test('no route without a key or LAN', () => {
    assertEqual(chooseRoute({ip: null, hasCloud: false}, 'power', true), null);
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: false}, 'scene', true), null);
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: false}, 'power', true), 'lan');
});

test('staleness', () => {
    assertEqual(isStale(0, 121000, 120), true);
    assertEqual(isStale(0, 119000, 120), false);
});

done();
