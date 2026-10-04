import {test, assertEqual, done} from './harness.js';
import {nextCloudStatus} from '../src/lib/config.js';

const fresh = {okAt: 0, error: null, errorAt: 0};

test('first success is recorded', () => {
    assertEqual(nextCloudStatus(fresh, null, 1000), {okAt: 1000, error: null, errorAt: 0});
});

test('successes are written at most once a minute', () => {
    assertEqual(nextCloudStatus({okAt: 1000, error: null, errorAt: 0}, null, 1030), null);
    assertEqual(nextCloudStatus({okAt: 1000, error: null, errorAt: 0}, null, 1060).okAt, 1060);
});

test('account errors are recorded and keep the last success', () => {
    assertEqual(nextCloudStatus({okAt: 1000, error: null, errorAt: 0}, {kind: 'auth'}, 1010),
                {okAt: 1000, error: 'auth', errorAt: 1010});
    assertEqual(nextCloudStatus(fresh, {kind: 'rate-limit'}, 5).error, 'rate-limit');
    assertEqual(nextCloudStatus(fresh, {kind: 'network'}, 5).error, 'network');
});

test('a light-level failure says nothing about the key', () => {
    assertEqual(nextCloudStatus(fresh, {kind: 'device'}, 5), null);
    assertEqual(nextCloudStatus(fresh, {kind: 'api'}, 5), null);
});

test('a success right after an error clears it at once', () => {
    assertEqual(nextCloudStatus({okAt: 1000, error: 'auth', errorAt: 1010}, null, 1015),
                {okAt: 1015, error: null, errorAt: 0});
});

done();
