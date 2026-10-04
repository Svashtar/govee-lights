# Supported devices

LightsBuddy works with any device that Govee's developer API reports as a **light**. Which controls appear depends on what each light reports, so in principle every light is supported over the cloud. LAN control depends on the model and firmware.

This is a **community-maintained** list of models that people have actually tested. If yours isn't here, or something is wrong, please tell us (see below).

**Legend:** ✅ works · ⚠️ partly works (see notes) · ❌ doesn't work · ❔ not tested

| SKU | Product name | LAN | Power / brightness | Colour / temperature | Scenes | DIY scenes | Snapshots | Music mode | Extension version | Notes |
|---|---|---|---|---|---|---|---|---|---|---|

*No reports yet.*

## How to find your SKU

The SKU is the model number, such as `H6008` or `H619A`. You can find it:

- on the **Devices** page of the extension's settings;
- in **Settings → About → Copy Debug Info**;
- in the Govee Home app, under the light's settings → *Device info*.

## How to report a device

Open a [device report](https://github.com/Svashtar/lightsbuddy-gnome/issues/new?template=device_report.yml) and fill in:

- the SKU and product name;
- whether it answers over LAN (the **Devices** page shows *LAN* or *Cloud*; make sure LAN Control is on in the Govee Home app first);
- which features you tested and whether they worked;
- the extension version, and your debug info.

You're also welcome to open a pull request that adds a row to the table above. Please keep rows sorted by SKU.
