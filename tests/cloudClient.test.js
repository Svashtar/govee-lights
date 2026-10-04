import {test, assertEqual, assertThrows, done} from './harness.js';
import {checkResponse, retryDelay, GoveeError} from '../src/lib/cloudClient.js';

const kindOf = fn => {
    try {
        fn();
    } catch (e) {
        return e.kind;
    }
    return null;
};

test('maps HTTP failures to error kinds', () => {
    assertEqual(kindOf(() => checkResponse(401, {})), 'auth');
    assertEqual(kindOf(() => checkResponse(403, {})), 'auth');
    assertEqual(kindOf(() => checkResponse(429, {}, '1')), 'rate-limit');
    assertEqual(kindOf(() => checkResponse(404, {})), 'device');
    assertEqual(kindOf(() => checkResponse(503, null)), 'api');
});

test('reads Retry-After', () => {
    try {
        checkResponse(429, {}, '30');
    } catch (e) {
        assertEqual(e.retryAfter, 30);
    }
});

test('detects failures inside a 200 response', () => {
    assertEqual(kindOf(() => checkResponse(200, {code: 400, message: 'bad'})), 'api');
    assertEqual(kindOf(() => checkResponse(200, {code: 200, payload: {result: 'error', message: 'offline'}})), 'device');
    assertThrows(() => checkResponse(200, 'x'), /Unexpected/);
    assertEqual(checkResponse(200, {code: 200, data: []}).data, []);
});

test('retries only idempotent reads on server and network errors', () => {
    const server = new GoveeError('api', 'x', {status: 502});
    assertEqual(retryDelay(server, 0, true), 1000);
    assertEqual(retryDelay(server, 2, true), 4000);
    assertEqual(retryDelay(server, 3, true), null);
    assertEqual(retryDelay(server, 0, false), null, 'control is never retried');
    assertEqual(retryDelay(new GoveeError('network', 'x'), 1, true), 2000);
    assertEqual(retryDelay(new GoveeError('auth', 'x'), 0, true), null);
    assertEqual(retryDelay(new GoveeError('api', 'x', {status: 400}), 0, true), null);
});

test('rate limit: short waits are retried, long ones are not', () => {
    assertEqual(retryDelay(new GoveeError('rate-limit', 'x', {retryAfter: 2}), 0, true), 2000);
    assertEqual(retryDelay(new GoveeError('rate-limit', 'x', {retryAfter: 60}), 0, true), null);
    assertEqual(retryDelay(new GoveeError('rate-limit', 'x'), 0, true), null);
});

done();
