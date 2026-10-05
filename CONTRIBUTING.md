# Contributing to LightsBuddy

Thanks for helping out! This guide covers setting up a development environment, the checks that run in CI, code style and how to send changes.

If you just want to report a problem, open an [issue](https://github.com/Svashtar/lightsbuddy-gnome/issues/new/choose) and paste the output of **Settings → About → Copy Debug Info**.

## Development setup

You need GNOME Shell 50, `gjs`, `make`, `glib-compile-schemas`, `gettext` (for `make pot`) and Node.js (for `make lint`).

```sh
git clone https://github.com/Svashtar/lightsbuddy-gnome.git
cd lightsbuddy-gnome
make install
gnome-extensions enable lightsbuddy@svashta.com
```

`make install` compiles the GSettings schema and symlinks `src/` into `~/.local/share/gnome-shell/extensions/lightsbuddy@svashta.com`, so your edits are live after a reload:

- **Extension code** (`extension.js`, `lib/`, `ui/`): GNOME Shell only loads it at startup. On Wayland, log out and back in.
- **Preferences** (`prefs.js`, `prefs/`): just close and reopen the preferences window.

### Nested GNOME Shell

To test without logging out, run a nested shell in a window. This needs the `mutter-devkit` package.

```sh
make nested
```

This runs `dbus-run-session gnome-shell --devkit --wayland`. Enable the extension inside the nested session if it isn't already. The nested shell has its own session bus, so it won't see your real keyring; enter the API key again there.

## Make targets

| Command | What it does |
|---|---|
| `make install` | Compile schemas and symlink `src/` into your extensions folder |
| `make uninstall` | Remove the symlink |
| `make test` | Run the unit tests in `tests/*.test.js` with `gjs -m` |
| `make lint` | Run ESLint 9 (`npx --yes eslint@9 .`) with `eslint.config.js` |
| `make pack` | Build `dist/lightsbuddy@svashta.com.shell-extension.zip`, the file uploaded to extensions.gnome.org and attached to releases |
| `make pot` | Regenerate `po/lightsbuddy.pot` from the sources |
| `make ego-check` | Test, lint and pack, then check the zip is ready for extensions.gnome.org (fails while any source file still carries the AI notice) |
| `make nested` | Install and start a nested GNOME Shell |
| `make clean` | Remove `build/`, `dist/` and the compiled schema |

CI runs `make lint`'s ESLint command, `make test` and `make pack` on every push and pull request. Please run at least `make test` and `make lint` before opening a PR.

### Tests

Tests are plain `gjs -m` scripts using the small harness in `tests/harness.js`. Keep logic that can be tested (capability parsing, routing, colour helpers, preset plans, backups) in pure modules under `src/lib/` that don't import GNOME Shell, so they run outside the shell.

There is also a read-only LAN probe for checking real devices:

```sh
gjs -m tools/lan-spike.js
```

It scans your network, prints every light that answers and its status. It only sends `scan` and `devStatus`, so it never changes a light.

## Logs

Shell side (extension code, panel menu, Quick Settings):

```sh
journalctl -f -o cat /usr/bin/gnome-shell
```

Preferences window: the prefs run in a separate process, so its messages go elsewhere:

```sh
journalctl -f -o cat /usr/bin/gjs
```

Messages from this extension are prefixed with `lightsbuddy:`. For a nested shell, the logs print to the terminal you started it from.

## Code style

- **4-space indentation**, LF line endings, final newline. `.editorconfig` has the details; YAML, JSON and Markdown use 2 spaces.
- **ES modules** only (`import Gio from 'gi://Gio'`), as GNOME Shell 45+ requires. No `imports.*`.
- **Start each source file with the SPDX header:**

  ```js
  // SPDX-License-Identifier: GPL-2.0-or-later
  // SPDX-FileCopyrightText: 2026 Your Name
  ```

- **Follow the [GNOME Shell extension review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html) and [best practices](https://gjs.guide/extensions/review-guidelines/best-practices.html).** Reviewers on extensions.gnome.org check these, so in particular:
  - **Do no work in the constructor.** Create objects, connect signals and start timers or sockets in `enable()`, not in the module scope or the `Extension` constructor.
  - **`disable()` must undo everything.** Disconnect every signal, remove every `GLib` timeout and source, close the UDP socket, destroy every actor and drop references (set them to `null`). After disable/enable cycles there must be no journal errors and no leftover tiles, icons or bound port (`ss -ulpn | grep 4002`).
  - Don't import GTK/Adwaita in shell code, and don't import `Clutter`, `St` or `Meta` in prefs code. ESLint enforces this, and that `src/lib/` imports neither.
  - Don't override private shell methods (names starting with `_`); build a small widget instead.
  - Comments explain why, not what the code already says.
  - No synchronous network or file I/O on the shell's main thread for anything slow; use async Soup and Gio calls.
  - Never log secrets. The API key must not appear in logs, errors, debug info or backups.
- **Wrap user-visible strings in `_()`** so they can be translated.
- **AI notice.** Parts of this code were written with AI help. As the [best practices](https://gjs.guide/extensions/review-guidelines/best-practices.html) ask, files in `src/` carry a three-line "Generated with AI for personal use…" notice. The maintainer removes it after reviewing the code; `make ego-check` refuses to pass while it is present.
- Prefer small, focused modules. The module map is in [docs/architecture.md](docs/architecture.md).

## Commit style

- Short summary line in the imperative mood, about 50–72 characters: `Add hue slider to colour controls`, `Fix LAN socket left open after disable`.
- Optional scope prefix when it helps: `lan: retry discovery on menu open`.
- Leave a blank line, then explain *why* in the body if it isn't obvious.
- One logical change per commit. Reference issues with `Fixes #123`.
- If the change is user-visible, add a line under `## [Unreleased]` in `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format). This also feeds **About → What's New**.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change, with tests where it makes sense.
3. Run `make test` and `make lint`.
4. Test it in a real or nested session, including disabling and re-enabling the extension.
5. Open the PR and fill in the template.

## Translations

Translations use gettext and live in `po/`:

1. Regenerate the template if strings have changed: `make pot` (writes `po/lightsbuddy.pot`).
2. Create your language file from it, for example for German:

   ```sh
   msginit --input=po/lightsbuddy.pot --locale=de --output=po/de.po
   ```

   To update an existing translation instead: `msgmerge --update po/de.po po/lightsbuddy.pot`.
3. Translate with any PO editor (Poedit, GNOME Translation Editor, Lokalize) or a text editor.
4. Check it: `msgfmt --check --output-file=/dev/null po/de.po`.
5. `make pack` compiles every `.po` file into the zip. Open a PR with just your `.po` file.

The interface uses British English spelling ("colour").

## Reporting devices

Govee sells many models and we can only test a few. If you have a light that isn't in [docs/supported-devices.md](docs/supported-devices.md), please file a [device report](https://github.com/Svashtar/lightsbuddy-gnome/issues/new?template=device_report.yml) with its SKU (for example `H6008`, shown on the **Lights** page and in the debug info), whether it answers over LAN and which cloud features worked.

## Code of conduct

Be kind and patient. Everyone here is a volunteer.
