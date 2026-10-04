// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// Settings export/import. The API key lives in the keyring and is never part
// of a backup. Pure so it can be unit tested.

export const BACKUP_FORMAT = 'govee-lights-settings';
export const BACKUP_VERSION = 1;

// [GSettings key, backup field, type check]
const FIELDS = [
    ['devices-config', 'devices', v => v !== null && typeof v === 'object' && !Array.isArray(v)],
    ['presets', 'presets', v => Array.isArray(v)],
    ['use-lan', 'useLan', v => typeof v === 'boolean'],
    ['refresh-stale-seconds', 'refreshStaleSeconds', v => Number.isInteger(v) && v >= 30 && v <= 3600],
];

const JSON_KEYS = new Set(['devices-config', 'presets']);

// values: {gsettingsKey: value} with JSON keys already parsed
export function buildBackup(values, extensionVersion) {
    const backup = {format: BACKUP_FORMAT, version: BACKUP_VERSION, extensionVersion};
    for (const [key, field] of FIELDS)
        backup[field] = values[key];
    return JSON.stringify(backup, null, 2);
}

// Returns {gsettingsKey: value}; JSON keys come back as strings ready for set_string().
// Throws Error with a user-facing message when the file is not a valid backup.
export function parseBackup(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('The file is not valid JSON.');
    }
    if (data?.format !== BACKUP_FORMAT)
        throw new Error('The file is not a Govee Lights settings backup.');
    if (data.version > BACKUP_VERSION)
        throw new Error('The backup was made by a newer version of Govee Lights.');

    const result = {};
    for (const [key, field, valid] of FIELDS) {
        if (!(field in data))
            continue;
        if (!valid(data[field]))
            throw new Error(`The backup has an invalid “${field}” value.`);
        result[key] = JSON_KEYS.has(key) ? JSON.stringify(data[field]) : data[field];
    }
    return result;
}

export const BACKUP_KEYS = FIELDS.map(([key]) => key);
