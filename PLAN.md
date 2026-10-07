# LightsBuddy — GNOME Shell extension

## Context
`development/lightsbuddy` (a Rails web app using the Govee Platform cloud API) serves as a **reference, not a template**. A desktop extension has different needs: sliders must respond instantly, the extension runs all day so it has to respect rate limits, and it is single-user. Where a better approach exists for those needs, the plan uses it.

The goal:
- The user enters a Govee API key.
- The extension discovers the user's controllable lights.
- Each light can be renamed and placed either in the extension's own top-bar menu or as a Quick Settings tile (next to Wi-Fi and Night Light).
- Each light offers the controls its capabilities allow: power, brightness, colour temperature, colour, Govee scenes and modes.
- The user can save their own presets.

**Target:** GNOME Shell 50 and 51 (installed here: 51.0). The extension uses ESM and `"shell-version": ["50", "51"]`.

**Location:** `/home/svashtar/projects/development/lightsbuddy-gnome`

## Key design decisions, and where they differ from lightsbuddy

| Topic | lightsbuddy | This extension, and why |
|---|---|---|
| Transport | Cloud only | **Hybrid: LAN first, cloud as fallback.** The Govee LAN API (UDP) answers in milliseconds, has no rate limit and works without internet. Lights with "LAN Control" enabled in the Govee Home app are found automatically. The cloud is still needed for the device list, capability metadata, scenes, DIY scenes, snapshots and music modes, and for lights that don't support LAN. |
| Slider behaviour | 500 ms debounce, then one cloud call | Over LAN: a ~100 ms throttle, so the light follows the slider live. Over cloud: send once the slider is released, plus a trailing 400 ms debounce. |
| State refresh | Manual, or when the view is stale (10 min) | LAN: `devStatus` every time a menu opens (it costs nothing). Cloud: only when stale (>2 min) or on manual Refresh. A per-day request counter shows a warning near the 10k/day limit. |
| Control safety | Control calls never retried | Same rule for the cloud. LAN commands get no acknowledgement, so each burst is followed by a `devStatus` read that confirms the result and corrects the UI. |
| Capability gating | `supports_*?` checks, but colour shown unconditionally | Every control is gated, colour included. Ranges come from capability `parameters`. |
| Profiles | Govee scenes only | Govee scenes, DIY scenes, snapshots and music modes, **plus user presets that can target several lights** (for example, "Movie night" dims two lamps and puts the strip on a scene). Presets are applied in parallel, using LAN where it's available. |
| Secrets | Encrypted database column | API key stored in **GNOME Keyring via libsecret** (`gi://Secret`), never in GSettings. |
| Names | Govee `deviceName` only | Alias per device. |

### LAN protocol (to verify against real devices in step 2)
- **Discovery:** send multicast `{"msg":{"cmd":"scan","data":{"account_topic":"reserve"}}}` to `239.255.255.250:4001`. Replies arrive on UDP `4002` as `{ip, device, sku, ...}`. The `device` value has the same `AA:BB:…` format as the cloud `device` id, so cloud and LAN devices can be matched.
- **Commands:** sent unicast to `ip:4003`:
  - `turn {value:0|1}`
  - `brightness {value:1-100}`
  - `colorwc {color:{r,g,b}, colorTemInKelvin}`
  - `devStatus {}` → `{onOff, brightness, color, colorTemInKelvin}`
- **Implementation:**
  - Uses `Gio.Socket` (UDP) with `join_multicast_group_ssm`/`join_multicast_group` and port reuse, so it coexists with Home Assistant and similar.
  - Discovery runs on enable, then every 5 min, and again on menu open when a device has no known IP.
  - If the socket can't bind, the extension falls back to cloud only.

### Cloud API (reference: `lightsbuddy/app/services/govee/`)
- **Connection:**
  - Base URL `https://openapi.api.govee.com/router/api/v1/`
  - Header `Govee-API-Key`
  - Client: Soup 3 `Soup.Session`, 10 s timeout
- **Endpoints:**
  - `GET user/devices`: keep devices whose `type` contains `light`.
  - `POST device/state`: flatten the response into `type.instance → value`.
  - `POST device/control`: body `{requestId, payload:{sku, device, capability:{type, instance, value}}}`. A failure is `code != 200` or `result == "error"`.
  - `POST device/scenes` and `POST device/diy-scenes`.
- **Capability table** (from `lightsbuddy/app/services/devices/control_service.rb`): `on_off/powerSwitch`, `range/brightness`, `color_setting/colorTemperatureK`, `color_setting/colorRgb`, `dynamic_scene/lightScene {id,paramId}`, `dynamic_scene/diyScene`, `dynamic_scene/snapshot`, `music_setting/musicMode`.
- **Errors:**
  - 401/403 → auth error
  - 429 → rate limited (honour `Retry-After`)
  - 5xx → retry only idempotent reads, with 1, 2, 4 s backoff
- **Later:** `segment_color_setting` (per-segment colour on strips). The capability model already supports it, so it only needs UI.

## Architecture (`lightsbuddy/`)
```
metadata.json             uuid lightsbuddy@svashta.com, shell-version ["50", "51"], settings-schema
extension.js              enable/disable; wires store → UIs
prefs.js                  Adw prefs: Account, Devices, Presets
lib/cloudClient.js        Soup 3 client, typed GoveeError, retry rules, daily request counter
lib/lanClient.js          Gio.Socket UDP: discovery, send, devStatus listener
lib/capabilities.js       pure: capability table, supports(), ranges, option parsers, colour helpers
lib/device.js             GObject per light: metadata + state + notify signals
lib/deviceManager.js      merges cloud + LAN, routes each action (LAN if possible), throttling, optimistic state, confirm-read
lib/presets.js            multi-device presets: model, apply (parallel per device)
lib/secret.js             libsecret helpers (shared by shell + prefs)
lib/config.js             GSettings JSON (de)serialisation + metadata cache file
ui/deviceControls.js      shared PopupMenu builders (power, sliders, colour, scene submenus)
ui/gradientSlider.js      Slider subclass with a hue or white-temperature gradient (Cairo)
ui/panelIndicator.js      PanelMenu.Button: presets section + per-device sections; hidden when empty
ui/quickToggles.js        SystemIndicator + QuickMenuToggle per quick-settings device
schemas/org.gnome.shell.extensions.lightsbuddy.gschema.xml
stylesheet.css
tests/*.test.js           gjs -m tests for capabilities, routing, presets
Makefile                  schemas, install (symlink), test, pack
```

**Settings:**
- **GSettings keys:**
  - `devices-config` (JSON): `{id: {sku, alias, placement: hidden|panel|quick-settings, order}}`
  - `presets` (JSON): `[{id, name, steps:[{deviceId, power?, brightness?, temperature?|color?|scene?}]}]`
  - `use-lan` (bool, default true)
  - `refresh-stale-seconds`
- **Metadata cache:** `~/.cache/lightsbuddy/devices.json` holds capabilities and scene lists, so the shell renders immediately.
- **Change propagation:** prefs bumps a `cache-stamp` key, and the shell reloads on that and on other key changes.

## UI
**Quick Settings tile (per device):** a `QuickMenuToggle`.
- Clicking the tile toggles power. The arrow opens the device's controls, with the alias as the header.
- The subtitle shows brightness %, the scene name or "Offline". A small "LAN" or "Cloud" hint appears in the menu footer.
- Added with `quickSettings.addExternalIndicator()`.

**Top-bar indicator:**
- Light-bulb icon.
- Menu, top to bottom:
  1. Presets as one-click items
  2. A collapsible section per panel-placed device, with a power switch in its header
  3. "Refresh" and "Settings…"

**Shared controls** (each shown only when the device supports it):
- power
- brightness and colour-temperature sliders (temperature uses the device's range)
- colour: 8 swatches plus the hue slider
- submenus for Scenes, DIY scenes, Snapshots and Music mode
- "Save current as preset…"

**Prefs (Adw):**
1. **Account:** a `PasswordEntryRow` for the key, a "Test & fetch devices" button, a LAN toggle and a discovery status ("3 of 5 lights reachable on LAN"). If a light has no LAN, a hint explains how to enable LAN Control in the Govee app.
2. **Devices:** an `ExpanderRow` per light, with an alias, placement (Hidden / Top bar / Quick Settings), ordering, and SKU, connection and capabilities shown read-only.
3. **Presets:** create, rename, reorder and delete. Each preset step picks a device and its values: `Gtk.ColorDialogButton` for colour, plus scene dropdowns populated from the cache.

4. **About:** modelled on ArcMenu and Dash to Panel.
   - Header: icon, name, one-line description.
   - Version (`version-name`) and git commit when built from source.
   - "What's new" subpage rendered from `CHANGELOG.md`.
   - Links: Website/README, Documentation, Report an issue, Changelog.
   - **Copy debug info:** extension version, GNOME Shell/gjs versions, distro, session type, LAN on/off, light count with their SKUs and connections. The API key and device IDs are never included. The output pastes straight into a bug report.
   - Settings export/import (JSON of aliases, placements, presets; never the API key) and "Reset all settings".
   - Legal: GPL-2.0-or-later, plus "Not affiliated with or endorsed by Govee."

**Errors:** cloud auth and rate-limit failures appear as a single `MessageTray` notification (deduplicated). Transient failures show inline in the menu.

## Public repository and documentation
The project lives in a public GitHub repo and is documented the way well-known extensions (Dash to Panel, ArcMenu) are, so users can learn and troubleshoot without reading code.

```
README.md                 hero screenshot, features, requirements, install (EGO / zip / source),
                          quick start, screenshots, FAQ, privacy, contributing, licence, disclaimer
CHANGELOG.md              Keep a Changelog format; also feeds About → What's new
CONTRIBUTING.md           dev setup, nested shell, tests, lint, code style, commit style, translations
LICENSE                   GPL-2.0-or-later (the GNOME Shell extension norm)
docs/
  getting-started.md      get an API key, first run, choose where lights appear
  lan-control.md          what LAN Control is, enabling it in Govee Home, firewall ports 4001–4003
  presets.md              multi-light presets, step by step
  troubleshooting.md      offline lights, rate limits, bad key, no LAN replies, collecting logs
  privacy.md              what leaves the machine (only Govee cloud calls), where the key is stored
  architecture.md         module map, LAN/cloud routing, state model (for contributors)
  supported-devices.md    community-maintained list of tested SKUs (LAN yes/no)
  screenshots/            PNGs referenced by README
.github/
  ISSUE_TEMPLATE/bug_report.yml       asks for "Copy debug info" output
  ISSUE_TEMPLATE/feature_request.yml
  ISSUE_TEMPLATE/device_report.yml    report a SKU as working / not working
  pull_request_template.md
  workflows/ci.yml                    eslint + `make test` + `make pack` on every push/PR
po/                       gettext template (`lightsbuddy.pot`); English only, translations welcome from contributors
```

Release flow: bump `version`/`version-name` in `metadata.json`, update `CHANGELOG.md`, tag `vN`, `make pack`, attach the zip to the GitHub release and upload it to extensions.gnome.org.

## Implementation order
1. Scaffold the extension (metadata, schema, Makefile, empty enable/disable), symlink it into `~/.local/share/gnome-shell/extensions/` and confirm it loads. Also set up the repo itself: `git init`, licence, README skeleton, CI, issue templates and the About page.
2. Spike: `lanClient.js` against the real lights. Confirm discovery and the id match, and record which SKUs answer. This is the main technical risk, so it is tested early.
3. `capabilities.js` with tests, then `cloudClient.js` and `secret.js`.
4. Prefs Account and Devices pages, end to end.
5. `deviceManager.js`: routing, throttling, optimistic state plus confirmation, refresh policy.
6. `deviceControls.js`, then `panelIndicator.js`, then `quickToggles.js`.
7. Presets: model, prefs page, menu section, "save current".
8. Polish: notifications, stylesheet, offline states, and a clean `disable()` that removes every signal, timeout and socket, as extensions.gnome.org review requires.
9. Docs pass: finish every `docs/` page and take screenshots. Done (2026-10-05): screenshots are full-screen captures cropped to one size (settings 900x1100, shell menus with a 56 px margin); English only, translations left to contributors.
10. Code review and AI-notice removal (see the backlog below).
11. Release v1 (see the backlog below).

## Release backlog

### Code review and AI-notice removal
Removing the notice means the maintainer understands every file and can answer an EGO reviewer about any line. Walk through each file with Claude ("walk me through `lib/routing.js`"), fix or simplify anything unclear, then delete the notice (lines 3–5) by hand. Before removing it, be able to say what each function is for, what the file creates (timers, signals, sockets, files) and where it is cleaned up, and what goes over the network.

- [ ] A. Pure logic (has unit tests): `routing`, `throttle`, `emitter`, `capabilities`, `presets`, `lanTracker`, `markdown`, `settingsBackup`, `debugInfo`
- [ ] B. I/O: `config`, `secret`, `cloudClient`, `lanClient`, `sync`, `device`, `deviceManager`
- [ ] C. Shell: `extension.js`, `ui/*`, `stylesheet.css` (enable/disable cleanup is the most common rejection reason)
- [ ] D. Preferences: `prefs.js`, `prefs/*`
- [ ] `make ego-check` passes; after a re-login, toggling the extension leaves no journal errors and `ss -ulpn | grep 4002` is empty while it is off.

### Release v1
- [ ] Choose `version-name` in `metadata.json` (e.g. `1.0`; EGO sets its own integer version).
- [ ] `CHANGELOG.md`: `[Unreleased]` becomes `[1.0] - <date>`, add an empty `[Unreleased]`; check About → What's New.
- [ ] Commit, `make ego-check`, install the zip locally, re-login and try it once more.
- [ ] Push `main`, tag `v1.0`, push the tag, `gh release create` with the zip and the changelog notes.
- [ ] Upload the zip at https://extensions.gnome.org/upload/ (maintainer's account).
- [ ] Answer reviewer comments, re-upload as needed.
- [ ] After approval: add `docs/screenshots/quick-settings.png` on the EGO page; replace "Coming soon" in the README with the EGO link.

## Verification
- `make test` runs the `gjs -m` unit tests: capability parsing and clamping, routing (LAN vs cloud), RGB packing, preset apply plans.
- `make install`, then:
  - `gnome-extensions enable lightsbuddy@svashta.com`
  - Test in `dbus-run-session gnome-shell --devkit --wayland` (needs `mutter-devkit`) or after re-login.
  - Watch logs with `journalctl -f -o cat /usr/bin/gnome-shell`.
- Real-device checks:
  - LAN discovery lists the lights.
  - Dragging the brightness slider changes the light live over LAN.
  - With `use-lan` off, the same slider sends one cloud call.
  - Scenes, DIY scenes, snapshots and music mode work (cloud).
  - A multi-device preset applies to all its lights.
  - An offline light, a bad key and Wi-Fi off each show the right state.
- Disable and re-enable: no journal errors, no leftover tiles, icons or bound UDP port (`ss -ulpn | grep 4002`).
- `gnome-extensions pack` produces a zip ready for extensions.gnome.org.
