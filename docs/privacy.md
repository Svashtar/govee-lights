# Privacy

LightsBuddy is designed to keep as much as possible on your computer.

## Summary

- **No telemetry, no analytics, no servers of our own.**
- The extension talks only to **your lights on the local network** and the **official Govee cloud API**.
- Your **API key is stored in GNOME Keyring**, not in plain-text settings.
- **Debug info never contains your API key or device IDs**, and settings exports never contain your API key.

## What leaves your computer

### To the Govee cloud

Requests go to `https://openapi.api.govee.com/` over HTTPS, with your API key in the `Govee-API-Key` header. The extension makes these requests:

| Request | When |
|---|---|
| List your devices | When you press **Fetch Lights** on the Account page or **Refresh** in the top-bar menu, and at login if no device list is cached yet |
| Read a light's state | For lights not reachable on LAN: once at login, when you open a menu and the cached state is older than **Refresh Light State After** (2 minutes by default), after a failed command, and when you press **Refresh** |
| Control a light | When you change something and the light isn't reachable over LAN, and for scenes, DIY scenes, snapshots and music modes |
| List scenes and DIY scenes | Together with the device list, one request each per light that has them |

Govee receives what it needs to carry out those requests: your API key, the device ID and model, and the change you made. Govee's own privacy policy applies to that data.

If you turn off LAN control, every action goes through the cloud.

### On your local network

With LAN control on, the extension:

- sends a discovery message to the multicast address `239.255.255.250` on UDP port 4001;
- receives replies from your lights on UDP port 4002;
- sends commands and status requests to individual lights on UDP port 4003.

This traffic is unencrypted, as defined by Govee's LAN protocol, and stays on your local network. Other devices on the same network can see it, and any device on your network can send LAN commands to lights that have LAN Control enabled. See [LAN control](lan-control.md).

### Nothing else

The extension doesn't contact any other server. Links on the About page (website, documentation, issue tracker) only open in your browser when you click them.

## What is stored on your computer

| What | Where |
|---|---|
| API key | GNOME Keyring (Secret Service), via libsecret. Protected by your keyring password. |
| Light names, placements and order; presets; LAN on/off; refresh interval; today's cloud request count; when the API key last worked or failed | GSettings, under `/org/gnome/shell/extensions/lightsbuddy/` (view with `dconf dump /org/gnome/shell/extensions/lightsbuddy/`) |
| Device list, capabilities and scene lists | `~/.cache/lightsbuddy/devices.json`, so menus can be shown immediately after login. Safe to delete; it's rebuilt on the next fetch. |
| IP addresses of lights found on the LAN | `~/.cache/lightsbuddy/lan.json`, so the settings window can show which lights are reachable. Rewritten after every scan. |

## Debug info

**Settings → About → Copy Debug Info** copies a plain-text report to your clipboard for bug reports. It contains:

- extension version (and git commit for source builds);
- GNOME Shell and GJS versions, your OS name and session type (Wayland/X11);
- whether LAN control is on and whether an API key is set (not the key itself);
- for each light: its model (SKU), connection (LAN/Cloud) and placement.

It never contains your API key, device IDs, IP addresses or light names. Nothing is sent anywhere; you decide whether to paste it.

## Settings export

**Export Settings…** writes a JSON file with light names, placements, presets and preferences. It doesn't include the API key. Because it contains your light names and the device IDs presets refer to, treat it as personal and don't attach it to public issues.

## Removing everything

1. Uninstall the extension (Extensions app, or `gnome-extensions uninstall lightsbuddy@svashta.com`).
2. Remove settings: `dconf reset -f /org/gnome/shell/extensions/lightsbuddy/`
3. Remove the cache: `rm -r ~/.cache/lightsbuddy`
4. Remove the key: open **Passwords and Keys** (Seahorse), find the LightsBuddy entry in the *Login* keyring and delete it.
5. Optionally revoke the key with Govee by requesting a new one in the Govee Home app.
