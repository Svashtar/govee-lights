// Usage: gjs -m tools/cloud-check.js [API_KEY]
// Lists your Govee lights through the cloud API. Without an argument it uses
// the key stored by the preferences window. Read-only.
import GLib from 'gi://GLib';
import {CloudClient} from '../src/lib/cloudClient.js';
import {lookupApiKey} from '../src/lib/secret.js';

const loop = new GLib.MainLoop(null, false);
(async () => {
    const apiKey = ARGV[0] ?? await lookupApiKey();
    if (!apiKey)
        throw new Error('No API key: pass one or save it in the preferences first');
    const client = new CloudClient({apiKey});
    const devices = await client.getDevices();
    for (const d of devices)
        print(`${d.sku}  ${d.name}  ${JSON.stringify(d.capabilities)}`);
    print(`${devices.length} light(s)`);
})().catch(e => print(`${e.name} [${e.kind ?? '-'}]: ${e.message}`)).finally(() => loop.quit());
loop.run();
