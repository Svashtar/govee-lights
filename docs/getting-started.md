# Getting started

This guide takes you from a fresh install to lights in your top bar or Quick Settings. It takes about five minutes, most of which is waiting for Govee's API key email.

If you haven't installed the extension yet, see [Installation](../README.md#installation).

## 1. Get a Govee API key

The extension uses Govee's official developer API, which needs a personal key. It's free.

1. Open the **Govee Home** app on your phone and sign in with the account your lights are registered to.
2. Go to **Profile** (the person icon) → **Settings** (the gear icon) → **Apply for API Key**.
3. Fill in your name and a reason (for example "GNOME desktop control"), accept the terms and submit.
4. The key arrives by email, usually within a few minutes.

Treat the key like a password: anyone who has it can control your lights.

## 2. First run

1. Open the extension's settings, in either of these ways:
   - the **Extensions** app → **LightsBuddy** → **Settings**
   - `gnome-extensions prefs lightsbuddy@svashta.com`
2. On the **Account** page, paste the key into the **API Key** field and press Enter (or the ✓ button).
3. The extension saves the key and fetches your lights straight away. The row under the field then shows **Saved in your keyring** and when the key last worked. The field itself stays empty from now on, so the key can't be read off the screen. Later, press **Fetch Lights** to pick up new lights or scenes added in the Govee Home app.

The key is saved in GNOME Keyring, not in GSettings. See [Privacy](privacy.md).

Only devices that Govee reports as lights are listed. Plugs, sensors, humidifiers and so on are skipped.

## 3. Enable LAN Control (recommended)

Lights with **LAN Control** turned on respond instantly, keep working when the internet is down and don't count against Govee's daily request limit. In the Govee Home app, open each light → settings (gear icon) → turn on **LAN Control**.

Back in the extension, the **Account** page shows how many lights answered on your network, for example "3 of 5 lights reachable on LAN". If some don't show up, see [LAN control](lan-control.md), especially the firewall section.

You can turn LAN control off with the **LAN** switch on the Account page. Everything then goes through the cloud.

## 4. Choose where each light appears

Open the **Devices** page. Each light has its own expandable row:

- **Name**: an alias shown in menus and tiles. Leave it empty to use the name from the Govee app.
- **Placement**:
  - **Quick Settings**: the light gets its own tile next to Wi-Fi and Night Light. Clicking the tile toggles power; the arrow opens its controls.
  - **Top bar**: the light appears as a section in the extension's light-bulb menu.
  - **Hidden**: not shown anywhere (it can still be used in presets).
- **Order**: move lights up or down to control the order of tiles and menu sections.
- The row also shows the model (SKU), how the light is reached (LAN or Cloud) and its capabilities, for information.

The top-bar icon only appears when at least one light or preset is placed there.

## 5. Using the controls

Each light shows only the controls it supports:

- **Power**: the tile itself, or the switch in a menu section header.
- **Brightness** and **colour temperature** sliders. The temperature range comes from the light.
- **Colour**: eight quick swatches and a rainbow hue slider.
- **Scenes**, **DIY scenes**, **Snapshots** and **Music modes** lists. These always go through the cloud. Picking one keeps the list open and puts a checkmark next to it, so you can try several in a row. Long lists scroll inside the menu and start with a search field: type part of a name (case and accents don't matter), press Enter to pick the first match, or press Down to move into the results.
- **Save as Preset…** to capture the light's current state. See [Presets](presets.md).

Over LAN the light follows the slider as you drag it. Over the cloud the value is sent when you let go, to stay within Govee's rate limits.

The footer of each light's menu shows whether it is currently controlled over **LAN** or **Cloud**. A tile's subtitle shows the brightness, the active scene or **Offline**.

## 6. Refreshing

- Lights on the LAN are asked for their state every time you open a menu. This is free and instant.
- Cloud state is refreshed when you open a menu and the last refresh is more than 2 minutes old.
- **Refresh** in the top-bar menu forces an update.
- If you add or rename lights in the Govee app, press **Test & fetch devices** on the Account page again.

## Next steps

- [Create multi-light presets](presets.md)
- [Fix lights that don't show up on the LAN](lan-control.md)
- [Troubleshooting](troubleshooting.md)
