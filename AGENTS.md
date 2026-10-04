# AGENTS.md

GNOME Shell 50 extension (`govee-lights@svashta.com`) that controls Govee lights from the
top bar and Quick Settings: Govee LAN API (UDP) first, Govee cloud API as fallback.
Plain ESM GJS, no build step, no npm dependencies. Public repo: `Svashtar/govee-lights`.

- Design and roadmap: [PLAN.md](PLAN.md)
- Module map, routing, state model: [docs/architecture.md](docs/architecture.md)
- User docs: [README.md](README.md), [docs/](docs/)

## Layout
```
src/            the extension itself (this folder is what gets installed and packed)
  extension.js  shell entry: wires DeviceManager → PanelIndicator + QuickToggles
  prefs.js      preferences entry: Account, Lights, Presets, About pages (src/prefs/)
  lib/          shared by shell and prefs; NO St/Clutter/Gtk/Adw imports
  ui/           shell-only widgets (St/Clutter/PopupMenu)
  prefs/        prefs-only pages (Gtk/Adw)
tests/          `gjs -m` unit tests for the pure lib/ modules (tests/harness.js)
tools/          dev scripts: lan-spike, cloud-check, secret-check, manager-smoke, prefs-preview
docs/  po/  .github/
```

## Commands
```sh
make test        # unit tests (gjs -m tests/*.test.js)
make lint        # npx eslint@9 . — must stay at 0 errors/warnings
make install     # symlink src/ into ~/.local/share/gnome-shell/extensions/
make pack        # dist/govee-lights@svashta.com.shell-extension.zip (EGO / releases)
make pot         # regenerate po/govee-lights.pot after changing UI strings
make ego-check   # test + lint + pack, then fail while any AI notice remains
GSETTINGS_BACKEND=memory GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 \
  LD_LIBRARY_PATH=/usr/lib/gnome-shell gjs -m tools/prefs-preview.js <page> out.png
                 # render a prefs page (account|devices|presets|about) without the shell
journalctl -b _COMM=gnome-shell -o cat --since -10min   # shell log
```

## Testing realities
- **Wayland: changed JS only loads after the user logs out and in.** `gnome-extensions
  disable/enable` reuses cached modules. `make nested` needs `mutter-devkit` (not installed).
  So: test pure logic with unit tests, prefs with `tools/prefs-preview.js`, the manager with
  `tools/manager-smoke.js`, and ask the user to check shell UI after a re-login.
- Check the shell's own sources before using an API:
  `gresource extract /usr/lib/gnome-shell/libshell-*.so /org/gnome/shell/ui/<file>.js`.
- The user runs a custom shell theme (Catppuccin, via user-theme) that uses `!important`.
  Check both the stock theme and the user's theme CSS before styling; scope overrides to
  `govee-*` classes and never restyle the shell's own menus.
- St CSS is not browser CSS: no `color-mix()`, no `opacity`. Use `st-transparentize()` with
  a real colour, or set `actor.opacity` in code.
- GNOME menus allow one open submenu at a time: never nest a `PopupSubMenu` inside another
  (expandable rows use `ui/expanderItem.js`).
- Network tools (LAN scan, cloud) need the sandbox disabled. The LAN needs UDP 4002 open
  in `ufw`.
- **Never send commands to the user's lights** (power, colour, scenes…) unless the user asks.
  Read-only checks (`scan`, `devStatus`, `device/state`, `user/devices`) are fine, but
  remember that cloud reads count against Govee's 10,000 requests/day.

## extensions.gnome.org rules
Follow both https://gjs.guide/extensions/review-guidelines/review-guidelines.html and
https://gjs.guide/extensions/review-guidelines/best-practices.html. The ones that bite here:
- **AI notice:** every file in `src/` carries the three-line "Generated with AI for personal
  use…" notice from the best-practices page; new files get it too. **Never remove it.** The
  maintainer removes it by hand after reviewing the code, then runs `make ego-check`.
- Create nothing at import time or in constructors that run before `enable()` (no GObjects,
  signals or sources at module level; `Gio._promisify` is fine).
- `disable()`/`destroy()` remove every GLib source, disconnect every signal, destroy every
  object, in that order, with `super.destroy()` last. Each class cleans up what it created,
  and timeout removal sits next to its creation.
- No `_destroyed`/`_enabled` flags: cancel a `Gio.Cancellable` instead.
- No `?.` or `typeof … === 'function'` checks on things that always exist; no try/catch around
  calls that can't throw. `?.` is fine for Govee JSON and optional widgets.
- Comments explain why, never restate the code; no decorative dividers.
- No private shell internals (methods starting with `_` on shell objects); build our own
  widget instead (see `ui/expanderItem.js`, `ui/optionList.js`).
- `metadata.json`: no `version` key (EGO sets it); the description declares network and
  clipboard use.
- No code that only tests use in `src/` (test helpers live in `tests/`).
- ESLint enforces the process separation (`src/lib` no UI toolkits, `src/ui` no Gtk/Adw,
  `src/prefs` no St/Clutter/Meta/Shell) and lines ≤ 200 characters.

## Code rules
- `src/lib/` must work in both processes: no St, Clutter, Meta, Gtk or Adw. Pure modules
  (capabilities, presets, routing, throttle, markdown, settingsBackup, debugInfo) import
  nothing from GNOME, and every change to them gets a unit test.
- Every user-facing string goes through `_()` / `ngettext()`; run `make pot` afterwards.
  UI copy uses British "colour". Keep strings short.
- Only the shell opens UDP 4002. Prefs reads `~/.cache/govee-lights/lan.json` and asks for
  a scan via the `lan-scan-request` key (port reuse would split replies between processes).
- `device/control` is never retried; only idempotent reads are.
- The API key lives in the keyring (`lib/secret.js`) only: never in GSettings, logs, debug
  info or settings backups. Debug info never contains device IDs, IPs or names.
- Match the surrounding style: 4-space indent, ESM, SPDX header on new files, short
  comments that explain why.

## Finishing a change
- Run `make test` and `make lint`.
- User-visible change → update the owning `docs/` page and add a line under
  `## [Unreleased]` in `CHANGELOG.md` (it feeds About → What's New).
- Commit locally with a clear message. **Do not push**: push to GitHub only when the
  user asks.
- Say plainly what was verified and what still needs a re-login to check.
