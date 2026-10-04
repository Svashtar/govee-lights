// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// The Govee API key lives in the user's keyring (GNOME Keyring / KWallet via
// the Secret Service), never in GSettings. Shared by the shell and prefs.

import Gio from 'gi://Gio';
import Secret from 'gi://Secret';

Gio._promisify(Secret, 'password_lookup', 'password_lookup_finish');
Gio._promisify(Secret, 'password_store', 'password_store_finish');
Gio._promisify(Secret, 'password_clear', 'password_clear_finish');

const ATTRIBUTES = {account: 'govee-api'};

// Created per call so nothing is built when the module is imported.
function schema() {
    return new Secret.Schema('com.svashta.GoveeLights', Secret.SchemaFlags.NONE, {
        account: Secret.SchemaAttributeType.STRING,
    });
}

export async function lookupApiKey(cancellable = null) {
    return (await Secret.password_lookup(schema(), ATTRIBUTES, cancellable)) || null;
}

export async function storeApiKey(apiKey) {
    await Secret.password_store(schema(), ATTRIBUTES, Secret.COLLECTION_DEFAULT,
                                'Govee Lights API key', apiKey, null);
}

export async function clearApiKey() {
    await Secret.password_clear(schema(), ATTRIBUTES, null);
}
