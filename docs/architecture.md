# Architecture

This page is for contributors. It describes how the extension is put together, how it decides between LAN and cloud, how state flows, and how it stays within Govee's rate limits. For setup and code style, see [CONTRIBUTING.md](../CONTRIBUTING.md).

The extension targets **GNOME Shell 50 and 51**, uses ES modules, and runs as two processes: the **shell** side (`extension.js`, `ui/`) inside `gnome-shell`, and the **preferences** window (`prefs.js`, `prefs/`) in a separate `gjs` process. `lib/` is shared by both, and its pure modules are unit-tested with plain `gjs -m`.


## Module map

```
src/metadata.json            uuid lightsbuddy@svashta.com, shell-version ["50", "51"], settings-schema
src/extension.js             enable/disable; wires store → UIs
src/prefs.js                 Adw preferences window; builds the pages in src/prefs/
src/prefs/                   preference pages: accountPage, devicesPage ("Lights"), presetsPage, aboutPage
src/lib/cloudClient.js       Soup 3 client, typed GoveeError, retry rules
src/lib/lanClient.js         Gio.Socket UDP: discovery, send, devStatus listener
src/lib/capabilities.js      pure: capability table, supports(), ranges, option parsers, colour helpers
src/lib/device.js            one light: metadata, user config, IP, state; emits 'changed'
src/lib/deviceManager.js     merges cloud + LAN, routes each action (LAN if possible), throttling,
                             optimistic state, confirm-read
src/lib/presets.js           multi-device presets: model, apply (parallel per device)
src/lib/secret.js            libsecret helpers (shared by shell + prefs)
src/lib/config.js            GSettings JSON helpers, cache files (devices.json, lan.json), request counter
src/lib/sync.js              fetch lights + scene lists from the cloud, write devices.json
src/lib/routing.js           pure: LAN vs cloud choice, timing constants, staleness
src/lib/lanTracker.js        pure: which lights are reachable on the LAN across scan rounds
src/lib/throttle.js          pure: Throttle (LAN drags) and Debounce (cloud drags)
src/lib/debugInfo.js         pure: "Copy Debug Info" text (no key, IDs, IPs or names)
src/lib/settingsBackup.js    pure: settings export/import format (never the API key)
src/lib/markdown.js          pure: CHANGELOG.md → Pango markup for About → What's New
src/lib/emitter.js           tiny signal emitter for non-GObject classes
src/ui/deviceControls.js     shared PopupMenu builders (power, sliders, colour, scene submenus)
src/ui/gradientSlider.js     Slider subclass drawing a hue or warm→cool white gradient (Cairo)
src/ui/savePresetDialog.js   ModalDialog asking for a preset name
src/ui/expanderItem.js       menu row that expands content below it without closing the menu
src/ui/optionList.js         scrollable, searchable scene/DIY/snapshot/music list with checkmarks
src/ui/checkItem.js          menu row that acts without closing the menu, with a right-hand checkmark
src/ui/panelIndicator.js     PanelMenu.Button: presets section + per-device sections; hidden when empty
src/ui/quickToggles.js       SystemIndicator + QuickMenuToggle per quick-settings device
src/schemas/                 org.gnome.shell.extensions.lightsbuddy.gschema.xml
src/stylesheet.css
src/icons/                   extension icons
tests/*.test.js              gjs -m tests for capabilities, routing, presets, about helpers
tools/lan-spike.js           read-only LAN probe for real devices
Makefile                     schemas, install (symlink), test, lint, pot, pack, nested
```

Rules of thumb:

- Modules in `src/lib/` must not import `St`, `Clutter`, `Meta`, `Gtk` or `Adw`, so the shell and prefs can both use them. Pure modules (marked above) import nothing from GNOME at all and are the main test targets.
- `src/ui/` is shell-only (St/Clutter); `src/prefs/` is prefs-only (Gtk/Adw).

## Process boundaries and settings

The shell and prefs processes don't talk to each other directly. They share:

| Store | Contents |
|---|---|
| **GSettings** `org.gnome.shell.extensions.lightsbuddy` | `devices-config` (JSON: `{id: {sku, alias, placement, order}}`), `presets` (JSON), `use-lan`, `refresh-stale-seconds` (default 120), `cache-stamp`, `request-counter`, `cloud-status` (when the key last worked or failed) |
| **Metadata cache** `~/.cache/lightsbuddy/devices.json` | Capabilities and scene lists, so the shell can draw menus immediately after login without a cloud call |
| **GNOME Keyring** (libsecret) | The API key. Never written to GSettings, logs, debug info or backups |

When prefs rewrites the cache (after **Fetch Lights**), it bumps `cache-stamp`. The shell listens for that and for other key changes and reloads.

## Transport routing: LAN vs cloud

The design is **LAN first, cloud as fallback**.

```
             ┌──────────────── deviceManager ────────────────┐
 UI action → │ capability supported?  ── no ──→ (not shown)   │
             │ LAN-capable action* and use-lan and known IP?  │
             │     yes → lanClient (UDP 4003)                 │
             │     no  → cloudClient (HTTPS)                  │
             └────────────────────────────────────────────────┘
 * power, brightness, colour, colour temperature
```

- **LAN** (`lanClient.js`) handles `turn`, `brightness`, `colorwc` (RGB or Kelvin) and `devStatus`.
  - Discovery: multicast `scan` to `239.255.255.250:4001`, replies on UDP `4002`, commands to `ip:4003`.
  - Runs on enable, then every 5 minutes, and on menu open when a device has no known IP.
  - The `device` value in scan replies has the same `AA:BB:…` format as the cloud device ID; that's how LAN and cloud devices are matched.
  - The socket is bound with address/port reuse so it coexists with Home Assistant and similar tools. If it can't bind, the extension runs cloud-only.
  - Only the shell opens the socket. With port reuse, Linux spreads unicast replies across every socket bound to 4002, so a second listener in the prefs process would steal replies. The shell writes scan results to `~/.cache/lightsbuddy/lan.json`; the prefs window reads that file and asks for a rescan by bumping the `lan-scan-request` key.
  - A scan round sends the multicast `scan` three times (Wi-Fi drops multicast easily, and lights in power save miss it) and asks every known light for `devStatus` directly. A light counts as reachable while it answers either; after three silent rounds in a row it falls back to the cloud (`lib/lanTracker.js`).
  - `lan.json` lists every light currently reachable, so the prefs window and the actual route always agree.
- **Cloud** (`cloudClient.js`) uses Soup 3 against `https://openapi.api.govee.com/router/api/v1/` with the `Govee-API-Key` header and a 10 s timeout:
  - `GET user/devices` keeps devices whose `type` contains `light`;
  - `POST device/state` is flattened to `type.instance → value`;
  - `POST device/control` sends `{requestId, payload: {sku, device, capability: {type, instance, value}}}`;
  - `POST device/scenes` and `POST device/diy-scenes` list scenes.
- Scenes, DIY scenes, snapshots, music modes, the device list and capability metadata are **cloud only**.

### Capabilities

Every control is gated by the light's capabilities (`capabilities.js`), colour included. Ranges (for example the colour-temperature range) come from the capability `parameters`.

| Control | Capability `type/instance` |
|---|---|
| Power | `devices.capabilities.on_off/powerSwitch` |
| Brightness | `…range/brightness` |
| Colour temperature | `…color_setting/colorTemperatureK` |
| Colour | `…color_setting/colorRgb` |
| Scene | `…dynamic_scene/lightScene` (`{id, paramId}`) |
| DIY scene | `…dynamic_scene/diyScene` |
| Snapshot | `…dynamic_scene/snapshot` |
| Music mode | `…music_setting/musicMode` |

Per-segment colour (`segment_color_setting`) is modelled but has no UI yet.

## State model

- Each light is a `Device` GObject (`device.js`) holding its metadata (SKU, alias, capabilities, placement, LAN IP if known) and current state (power, brightness, colour/temperature, scene, online). UIs bind to its `notify::` signals; they never call the clients directly.
- **Optimistic updates.** When you move a control, `deviceManager` updates the `Device` immediately so the UI feels instant, then sends the command.
- **Confirm-read.** LAN commands have no acknowledgement, so after each burst the manager sends `devStatus` and corrects the `Device` from the reply. Over the cloud, a failed control call shows an inline error in the menu and the state is corrected from the next read.
- **Refresh policy:**
  - LAN: `devStatus` every time a menu opens (free).
  - Cloud: only when the cached state is older than `refresh-stale-seconds` (default 2 minutes) or on manual **Refresh**.
- **Startup.** The shell builds devices from `devices-config` plus the metadata cache, so tiles and menus appear before any network call finishes.

## Slider behaviour

| Transport | Behaviour |
|---|---|
| LAN | ~100 ms throttle while dragging, so the light follows the slider live |
| Cloud | Send on release, plus a trailing 400 ms debounce |

## Rate-limit and retry policy

Govee allows 10,000 cloud requests per account per day.

- A per-day **request counter** (`request-counter` key) counts every cloud call; the UI warns as it gets close to the limit.
- **Control calls are never retried**, over either transport, so a light never receives a stale command later. LAN relies on the confirm-read instead.
- **Idempotent reads** (device list, state, scenes) are retried on HTTP 5xx with 1, 2 and 4 s backoff.
- **HTTP 429** → rate-limited error carrying `Retry-After`. Idempotent reads are retried after that delay only when it is short (≤ 2 s); otherwise the error is surfaced.
- **HTTP 401/403** → authentication error.
- A control failure is `code != 200` or `result == "error"` in the response body.
- Authentication and rate-limit errors are shown as a single, deduplicated `MessageTray` notification. Transient failures are shown inline in the menu.

## Presets

A preset is `{id, name, steps: [{deviceId, power?, brightness?, temperature? | color? | scene?}]}`. `presets.js` turns it into a plan per device and applies the devices in parallel, each step routed through `deviceManager` like a normal action, so LAN is used where available. One device failing doesn't stop the others.

## UI

- **Quick Settings:** one `QuickMenuToggle` per device placed there, added through a `SystemIndicator` with `quickSettings.addExternalIndicator()`. Clicking toggles power; the menu holds the shared controls and a LAN/Cloud hint in the footer.
- **Top bar:** a `PanelMenu.Button` with presets, a collapsible section per panel-placed device, then Refresh and Settings. Hidden when nothing is placed there.
- Both use the same builders from `deviceControls.js`.

## Lifecycle

Following the extensions.gnome.org review guidelines:

- Nothing happens at import time or in the `Extension` constructor. All objects, sockets, signal connections and timers are created in `enable()`.
- `disable()` destroys every actor, disconnects every signal, removes every `GLib` source, closes the UDP socket and drops references. After repeated disable/enable there must be no leftover tiles, icons or bound port (`ss -ulpn | grep 4002`) and no journal errors.
