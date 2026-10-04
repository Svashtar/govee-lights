// SPDX-License-Identifier: GPL-2.0-or-later
// Tiny test harness for `gjs -m`: no dependencies, exits non-zero on failure.

const results = {passed: 0, failed: 0};

export function test(name, fn) {
    try {
        fn();
        results.passed++;
        print(`  ok   ${name}`);
    } catch (e) {
        results.failed++;
        print(`  FAIL ${name}\n       ${e.message}`);
    }
}

export function assertEqual(actual, expected, msg = '') {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}${msg ? ': ' : ''}expected ${e}, got ${a}`);
}

export function assertThrows(fn, pattern) {
    try {
        fn();
    } catch (e) {
        if (pattern && !pattern.test(e.message))
            throw new Error(`threw "${e.message}", expected ${pattern}`);
        return;
    }
    throw new Error('expected an exception');
}

export function done() {
    print(`  ${results.passed} passed, ${results.failed} failed`);
    if (results.failed)
        imports.system.exit(1);
}
