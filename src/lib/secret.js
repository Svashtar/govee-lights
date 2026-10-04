// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// The Govee API key lives in the user's keyring (GNOME Keyring / KWallet via
// the Secret Service), never in GSettings. Shared by the shell and prefs.

import Gio from 'gi://Gio';
import Secret from 'gi://Secret';

Gio._promisify(Secret, 'password_lookup', 'password_lookup_finish');
Gio._promisify(Secret, 'password_store', 'password_store_finish');
Gio._promisify(Secret, 'password_clear', 'password_clear_finish');

const SCHEMA = new Secret.Schema('com.svashta.GoveeLights', Secret.SchemaFlags.NONE, {
    account: Secret.SchemaAttributeType.STRING,
});
const ATTRIBUTES = {account: 'govee-api'};

export async function lookupApiKey() {
    return (await Secret.password_lookup(SCHEMA, ATTRIBUTES, null)) || null;
}

export async function storeApiKey(apiKey) {
    await Secret.password_store(SCHEMA, ATTRIBUTES, Secret.COLLECTION_DEFAULT,
        'Govee Lights API key', apiKey, null);
}

export async function clearApiKey() {
    await Secret.password_clear(SCHEMA, ATTRIBUTES, null);
}
