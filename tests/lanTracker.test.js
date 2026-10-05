import {test, assertEqual, done} from './harness.js';
import {LanTracker} from '../src/lib/lanTracker.js';

test('a light that answers is reachable', () => {
    const t = new LanTracker(2);
    assertEqual(t.heard('A', {ip: '10.0.0.5', firmware: '1.0'}, 100), true);
    assertEqual(t.endRound(), {dropped: [], reachable: {A: {ip: '10.0.0.5', firmware: '1.0', seen: 100}}});
});

test('missing a few scans keeps the light; too many drops it', () => {
    const t = new LanTracker(2);
    t.heard('A', {ip: '10.0.0.5'}, 100);
    t.endRound();
    assertEqual(t.endRound().dropped, []);
    assertEqual(t.endRound().dropped, []);
    assertEqual(t.endRound().dropped, ['A']);
    assertEqual(t.endRound().reachable, {});
});

test('a direct status reply counts as heard, even without a scan reply', () => {
    const t = new LanTracker(0);
    t.restore('A', {ip: '10.0.0.5', firmware: '1.0', seen: 1});
    assertEqual(t.heardFromIp('10.0.0.5', 200), 'A');
    assertEqual(t.endRound(), {dropped: [], reachable: {A: {ip: '10.0.0.5', firmware: '1.0', seen: 200}}});
    assertEqual(t.heardFromIp('10.0.0.9', 200), null);
});

test('a cached light that never answers is dropped after the allowed misses', () => {
    const t = new LanTracker(1);
    t.restore('A', {ip: '10.0.0.5'});
    assertEqual(t.endRound().dropped, []);
    assertEqual(t.endRound().dropped, ['A']);
});

test('a new address is reported, the same one is not', () => {
    const t = new LanTracker(2);
    t.heard('A', {ip: '10.0.0.5'}, 1);
    assertEqual(t.heard('A', {ip: '10.0.0.5'}, 2), false);
    assertEqual(t.heard('A', {ip: '10.0.0.6'}, 3), true);
    assertEqual(t.knownIps(), ['10.0.0.6']);
});

done();
