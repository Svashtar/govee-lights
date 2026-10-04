import {test, assertEqual, done} from './harness.js';
import {chooseRoute, isStale} from '../src/lib/routing.js';

test('LAN first for LAN actions', () => {
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: true}, 'brightness'), 'lan');
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: true}, 'color'), 'lan');
});

test('cloud for scenes even when the light is on LAN', () => {
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: true}, 'scene'), 'cloud');
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: true}, 'musicMode'), 'cloud');
});

test('cloud when the light has no LAN address (or LAN is off)', () => {
    assertEqual(chooseRoute({ip: null, hasCloud: true}, 'power'), 'cloud');
});

test('no route without a key or LAN', () => {
    assertEqual(chooseRoute({ip: null, hasCloud: false}, 'power'), null);
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: false}, 'scene'), null);
    assertEqual(chooseRoute({ip: '10.0.0.5', hasCloud: false}, 'power'), 'lan');
});

test('staleness', () => {
    assertEqual(isStale(0, 121000, 120), true);
    assertEqual(isStale(0, 119000, 120), false);
});

done();
