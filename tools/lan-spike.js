// Usage: gjs -m tools/lan-spike.js
// Scans the local network for Govee lights with LAN Control enabled and
// prints what each one reports. Read-only: sends only scan and devStatus.
import GLib from 'gi://GLib';
import {LanClient} from '../src/lib/lanClient.js';

const loop = new GLib.MainLoop(null, false);
const lan = new LanClient();
const found = new Map();

lan.connect('device-found', (_c, d) => {
    if (found.has(d.ip))
        return;
    found.set(d.ip, d);
    print(`found  ${d.sku}  ${d.id}  ${d.ip}  fw ${d.firmware}`);
    lan.requestStatus(d.ip);
});
lan.connect('status', (_c, ip, s) => print(`status ${found.get(ip)?.sku ?? ip}: ${JSON.stringify(s)}`));

lan.start();
for (const delay of [0, 1000, 2500])
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay || 1, () => (lan.scan(), GLib.SOURCE_REMOVE));
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
    print(`${found.size} light(s) answered`);
    lan.destroy();
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
