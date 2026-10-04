import {test, assertEqual, done} from './harness.js';
import {Throttle, Debounce} from '../src/lib/throttle.js';
import {FakeTimers} from './fakeTimers.js';

test('throttle: first value at once, then at most one per interval, ending on the latest', () => {
    const t = new FakeTimers(), sent = [];
    const th = new Throttle(100, v => sent.push([t.now, v]), t);
    th.push(1);
    t.advance(30); th.push(2);
    t.advance(30); th.push(3);
    t.advance(100);
    t.advance(30); th.push(4);
    t.advance(500);
    assertEqual(sent, [[0, 1], [100, 3], [200, 4]]);
});

test('debounce: only the last value, flush sends at once', () => {
    const t = new FakeTimers(), sent = [];
    const d = new Debounce(400, v => sent.push([t.now, v]), t);
    d.push(1); t.advance(100); d.push(2); t.advance(500);
    assertEqual(sent, [[500, 2]]);
    d.push(3); t.advance(50); d.flush(); t.advance(1000);
    assertEqual(sent, [[500, 2], [650, 3]]);
});

test('cancel drops pending values', () => {
    const t = new FakeTimers(), sent = [];
    const d = new Debounce(400, v => sent.push(v), t);
    d.push(1); d.cancel(); t.advance(1000);
    assertEqual(sent, []);
});

done();
