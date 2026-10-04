// Usage: gjs -m tools/secret-check.js — prints whether an API key is stored.
import GLib from 'gi://GLib';
import {lookupApiKey} from '../src/lib/secret.js';

const loop = new GLib.MainLoop(null, false);
lookupApiKey()
    .then(k => print(k ? `API key stored (${k.length} chars)` : 'No API key stored'))
    .catch(e => print(`Keyring error: ${e.message}`))
    .finally(() => loop.quit());
loop.run();
