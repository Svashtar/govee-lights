# Troubleshooting

Start here when something doesn't work. If none of this helps, please [open a bug report](https://github.com/Svashtar/lightsbuddy-gnome/issues/new/choose) and include the output of **Settings → About → Copy Debug Info** and any relevant [logs](#collecting-logs).

## The extension doesn't appear

- Check that it's enabled: `gnome-extensions info lightsbuddy@svashta.com` should show `State: ACTIVE` (or `ENABLED`).
- After installing from a zip or from source, **log out and back in**. On Wayland, GNOME Shell only loads new extensions at login.
- Check your GNOME version with `gnome-shell --version`. GNOME Shell 50 and 51 are supported.
- If the state is `ERROR`, look at the [shell log](#collecting-logs) for the reason.
- The top-bar icon is hidden while no light or preset is placed in the top bar. Lights placed in **Quick Settings** appear as tiles instead. See [Getting started → Choose where each light appears](getting-started.md#4-choose-where-each-light-appears).

## "Govee rejected this key" or authentication errors

The row under the key field on the **Account** page shows the key's state: **Saved in your keyring** with when it last worked, or what went wrong (rejected key, daily limit reached, no connection to Govee) and when. The key field itself stays empty once a key is saved, so the key can't be read off the screen; typing there replaces it.

- Copy the key again from Govee's email, without spaces or line breaks, paste it into **Replace API Key** and press Enter.
- A key belongs to the Govee account that requested it. Make sure your lights are on that same account.
- If you requested a new key, the old one stops working. Paste the new one.
- The key is stored in GNOME Keyring. If your keyring is locked or missing (for example on a minimal install or with auto-login), the extension can't read it. Install `gnome-keyring` and make sure the *Login* keyring is unlocked; the **Passwords and Keys** app (Seahorse) shows its state.

Authentication errors are shown once as a notification rather than repeating for every action.

## A light is missing from the list

- Only devices that Govee reports as **lights** are listed. Plugs, sensors and appliances are skipped.
- Lights added to the Govee app after setup appear after you press **Refresh** in the top-bar menu or **Fetch Lights** on the Account page.
- Some older models aren't available through Govee's developer API at all. If the light doesn't show up after fetching, please file a [device report](https://github.com/Svashtar/lightsbuddy-gnome/issues/new?template=device_report.yml).

## A light shows "Offline"

- Check that the light has power and is online in the Govee Home app.
- If the Govee app also shows it as offline, the light has lost its Wi-Fi connection. Power-cycling it usually helps.
- If it's online in the app but offline in the extension, press **Refresh** in the top-bar menu. Otherwise cloud state is only refreshed when it's more than 2 minutes old (see **Refresh Light State After** on the Account page).
- Lights reached over LAN can still be shown as offline if your computer and the light are on different networks (for example after switching Wi-Fi networks or connecting to a VPN).

## No lights answer on LAN

The **Reachable on LAN** row on the Account page says "0 of N lights", or every light shows **Cloud**. Press **Scan Now** once; a single scan can be missed on Wi-Fi. If it stays at 0:

1. **Is LAN Control on?** It's off by default for each light. Turn it on in the Govee Home app (light → settings → LAN Control). See [LAN control](lan-control.md#enabling-it).
2. **Is Control Lights over LAN on** on the extension's Account page?
3. **Is your firewall dropping replies?** Lights reply on **UDP port 4002**. Allow it as described in [LAN control → Ports and firewall](lan-control.md#ports-and-firewall).
4. **Same network?** The computer and lights must be on the same subnet. Guest Wi-Fi, "AP/client isolation", VPNs that capture all traffic and some mesh or multi-router setups block multicast discovery.
5. **Is something else holding the port without sharing it?** Run:

   ```sh
   ss -ulpn | grep 4002
   ```

   You should see `gnome-shell` listed. If another program is listed instead and LightsBuddy isn't, that program bound the port exclusively; the shell log will contain a `lightsbuddy:` message saying it fell back to cloud only. Stop that program or configure it to share the port, then disable and enable the extension.
6. **Does the light support LAN at all?** Check [Supported devices](supported-devices.md). You can also probe the network from a source checkout with `gjs -m tools/lan-spike.js`, which lists every light that answers.

Lights that only work over the cloud are fully supported, just slower and subject to rate limits.

## "Rate limited" or controls stop responding over the cloud

Govee limits the cloud API to **10,000 requests per day** per account, plus short-term limits on bursts of requests.

- The extension counts its cloud requests per day and warns you before the daily limit is reached. When Govee answers "rate limited" with a short wait, reads are retried after that wait; longer limits are reported to you instead of retried.
- Rate-limit errors are shown once as a notification.
- To use fewer requests:
  - enable [LAN Control](lan-control.md): LAN requests don't count;
  - avoid pressing **Refresh** repeatedly;
  - other apps or integrations using the **same API key** share the same limit.
- The daily counter resets the next day.

## Scenes, DIY scenes, snapshots or music modes are missing

- These only exist for lights that support them, and they always come from the cloud.
- DIY scenes and snapshots are created in the Govee Home app. After adding new ones, press **Refresh** in the top-bar menu or **Fetch Lights** on the Account page to update the cached lists.
- They need internet access even for LAN-capable lights.

## A control changed but the light didn't

- Over LAN, the extension reads the light's state after every change and corrects the menu if the command was lost. If the menu snaps back, the light didn't accept the change: check that the light is within Wi-Fi range.
- Over the cloud, failed changes are shown in the menu and are **not** retried automatically, so a light never gets a stale command later. Try again.

## Moving settings to another computer

**Settings → About → Export Settings…** saves light names, placements and presets as a JSON file. **Import Settings…** restores them on the other computer. The API key is never included; enter it again on the Account page.

**Reset All Settings…** removes names, placements and presets but keeps your API key.

## Collecting logs

Debug info first: **Settings → About → Copy Debug Info** copies versions, your OS and session type, whether LAN is on, and the models (SKUs) and connection type of your lights. It never includes your API key, device IDs, IP addresses or light names.

**Shell log** (top-bar menu, Quick Settings tiles, LAN discovery, cloud calls):

```sh
journalctl -f -o cat _COMM=gnome-shell
```

Leave it running, reproduce the problem, then copy the lines around it. Messages from the extension start with `lightsbuddy:`.

To get the log from the current session after the fact:

```sh
journalctl -b -o cat _COMM=gnome-shell | grep -A5 lightsbuddy
```

**Preferences log** (the settings window runs as a separate process):

```sh
journalctl -f -o cat _COMM=gjs
```

Before pasting logs into a public issue, check them for anything private. The extension never logs your API key, but other extensions' messages may appear in the same log.
