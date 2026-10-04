import {test, assertEqual, assertThrows, done} from './harness.js';
import {parseChangelog, escapeMarkup} from '../src/lib/markdown.js';
import {buildBackup, parseBackup} from '../src/lib/settingsBackup.js';
import {formatDebugInfo, formatGjsVersion} from '../src/lib/debugInfo.js';

test('escapes Pango markup', () => {
    assertEqual(escapeMarkup('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
});

test('changelog: skips intro, parses releases, sections and items', () => {
    const md = '# Changelog\n\nIntro text.\n\n## [1.0] - 2026-10-04\n\n### Added\n- New `thing` & **bold**\n  continued\n  - nested\n\n## [Unreleased]\n- loose\n\n[1.0]: https://x';
    assertEqual(parseChangelog(md), [
        {version: '1.0', date: '2026-10-04', sections: [{title: 'Added', items: [
            {markup: 'New <tt>thing</tt> &amp; <b>bold</b> continued', level: 0},
            {markup: 'nested', level: 1},
        ]}]},
        {version: 'Unreleased', date: null, sections: [{title: '', items: [{markup: 'loose', level: 0}]}]},
    ]);
});

test('backup round-trip keeps values and omits the API key', () => {
    const values = {'devices-config': {a: {alias: 'Desk'}}, presets: [], 'use-lan': false, 'refresh-stale-seconds': 300};
    const json = buildBackup(values, '0.1.0');
    assertEqual(json.includes('apiKey'), false);
    assertEqual(parseBackup(json), {
        'devices-config': '{"a":{"alias":"Desk"}}', presets: '[]', 'use-lan': false, 'refresh-stale-seconds': 300,
    });
});

test('backup rejects foreign and invalid files', () => {
    assertThrows(() => parseBackup('nope'), /not valid JSON/);
    assertThrows(() => parseBackup('{"format":"other"}'), /not a Govee Lights/);
    assertThrows(() => parseBackup('{"format":"govee-lights-settings","version":1,"presets":{}}'), /presets/);
    assertThrows(() => parseBackup('{"format":"govee-lights-settings","version":99}'), /newer version/);
});

test('debug info lists models but no identifiers', () => {
    const text = formatDebugInfo({
        extensionVersion: '0.1.0', shellVersion: '50.5', gjsVersion: '1.88.1', os: 'CachyOS',
        sessionType: 'wayland', useLan: true, hasApiKey: true,
        lights: [{sku: 'H6008', connection: 'LAN', placement: 'quick-settings'}],
    });
    assertEqual(text.split('\n').at(-1), '  - H6008: LAN, quick-settings');
});

test('gjs version formatting', () => {
    assertEqual(formatGjsVersion(18801), '1.88.1');
});

done();
