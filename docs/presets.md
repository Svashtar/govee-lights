# Presets

A preset is a saved look for **one or more lights** that you apply with a single click. For example:

- **Movie night**: dim the two living-room lamps to 15 % warm white and put the TV strip on a scene.
- **Focus**: desk lamp at 100 %, 5000 K; everything else off.
- **Good night**: all lights off.

Presets appear at the top of the extension's top-bar menu. When you apply one, all its lights change in parallel, over LAN where possible.

Govee's own scenes, DIY scenes and snapshots are different: they belong to a single light and are listed in that light's submenus. A preset can *use* a Govee scene as one of its steps.

## What a preset contains

A preset has a **name** and a list of **steps**. Each step targets one light and sets any of:

| Setting | Notes |
|---|---|
| **Power** | On or off. |
| **Brightness** | 1–100 %. |
| **Colour temperature** *or* **colour** | Pick one. The temperature range comes from the light. |
| **Scene** | A Govee scene from the light's scene list (cloud only). |

Anything you leave unset is not changed. Only settings the light supports are offered.

## Creating a preset in Settings

1. Open the extension's settings and go to the **Presets** page.
2. Click **Add preset** and give it a name.
3. Add a step for each light you want to include:
   1. choose the light;
   2. set power, brightness, and either a colour temperature or a colour (using the colour picker);
   3. optionally choose a scene from the drop-down. Scene lists come from the cached device data, so press **Test & fetch devices** on the Account page if a list is empty.
4. Repeat for other lights.

Changes are saved straight away and show up in the top-bar menu.

## Saving the current state

The quickest way to make a preset is to set a light up how you like it, then choose **Save current as preset…** from that light's menu. Enter a name, and the extension creates a preset from the light's current power, brightness, colour or temperature and scene. You can add more lights to it later on the Presets page.

## Managing presets

On the **Presets** page you can:

- **Rename** a preset;
- **Reorder** presets, which changes their order in the menu;
- **Edit** or remove individual steps;
- **Delete** a preset.

Presets are included in **About → Export Settings…**, so you can move them to another computer. See [Troubleshooting](troubleshooting.md#moving-settings-to-another-computer).

## How presets are applied

- Each light's steps are sent at the same time as the other lights', so a five-light preset doesn't take five times as long.
- Power, brightness, colour and temperature go **over LAN** for lights that have [LAN Control](lan-control.md), and through the cloud otherwise.
- Scenes always go through the cloud.
- If one light fails (for example it's offline), the others are still applied and the menu shows what went wrong.

## Tips

- A preset that only turns lights **off** is handy as an "All off" button.
- Hidden lights (placement *Hidden*) can still be part of presets, so you can control a light only through presets if you like.
- Each cloud step counts towards Govee's daily request limit. Presets that use only LAN-capable lights and no scenes don't use any.
