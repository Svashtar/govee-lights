// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

// Settings export/import. The API key lives in the keyring and is never part
// of a backup. Pure so it can be unit tested.

export class BackupError extends Error {
    // reason: 'not-json' | 'not-backup' | 'newer' | 'invalid'; field: for 'invalid'
    constructor(reason, field = null) {
        super(field ? `${reason}: ${field}` : reason);
        this.name = 'BackupError';
        this.reason = reason;
        this.field = field;
    }
}

const BACKUP_FORMAT = 'govee-lights-settings';
const BACKUP_VERSION = 1;

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
// Throws BackupError when the file is not a valid backup; prefs shows a
// translated message for its `reason`.
export function parseBackup(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new BackupError('not-json');
    }
    if (data?.format !== BACKUP_FORMAT)
        throw new BackupError('not-backup');
    if (data.version > BACKUP_VERSION)
        throw new BackupError('newer');

    const result = {};
    for (const [key, field, valid] of FIELDS) {
        if (!(field in data))
            continue;
        if (!valid(data[field]))
            throw new BackupError('invalid', field);
        result[key] = JSON_KEYS.has(key) ? JSON.stringify(data[field]) : data[field];
    }
    return result;
}

export const BACKUP_KEYS = FIELDS.map(([key]) => key);
