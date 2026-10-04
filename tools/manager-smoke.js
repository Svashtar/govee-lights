// Usage: GSETTINGS_SCHEMA_DIR=src/schemas GSETTINGS_BACKEND=memory gjs -m tools/manager-smoke.js
// Starts the DeviceManager outside the shell for a few seconds, prints the
// lights it knows and how each is reached, then destroys it.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {DeviceManager} from '../src/lib/deviceManager.js';

const settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.lightsbuddy'});
const manager = new DeviceManager(settings);
const loop = new GLib.MainLoop(null, false);

manager.connect('error', (_m, kind, message) => print(`error ${kind}: ${message}`));
manager.start().then(() => {
    print(`api key: ${manager.hasApiKey}, LAN: ${manager.useLan}${manager.lanError ? ` (${manager.lanError})` : ''}`);
    manager.menuOpened();
}).catch(e => logError(e));

GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
    for (const d of manager.devices)
        print(`${d.sku}  ${d.name}  ${d.connection}  ${JSON.stringify(d.state)}${d.error ? `  error: ${d.error}` : ''}`);
    print(`${manager.devices.length} light(s)`);
    manager.destroy();
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
