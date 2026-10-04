# LAN control

Govee Lights prefers to talk to your lights directly over your local network and uses the Govee cloud only when it has to. This page explains how that works, how to turn it on and what to do when lights don't answer.

## What is LAN Control?

Many recent Govee lights support Govee's **LAN API**: they listen for simple UDP messages from computers on the same network. Compared with the cloud API, it:

- **responds in milliseconds**, so sliders change the light live while you drag them;
- **has no rate limit**, so state can be read every time you open a menu;
- **works without internet**, as long as your computer and the light share a network.

The LAN API covers **power, brightness, colour and colour temperature**. Scenes, DIY scenes, snapshots and music modes are only available through the cloud, so they still need internet and an API key.

The device list and capability information also come from the cloud, so you need an API key even if all your lights support LAN.

## Enabling it

LAN Control is off by default on Govee lights. For each light:

1. Open the **Govee Home** app.
2. Tap the light, then the **settings** (gear) icon.
3. Turn on **LAN Control**. If the option is missing, the model doesn't support the LAN API, or it needs a firmware update.

Then, in the extension:

1. Make sure the **LAN** switch on the **Account** page is on (it is by default).
2. Within a few seconds the Account page shows how many lights answered, for example "3 of 5 lights reachable on LAN".
3. On the **Devices** page, each light shows **LAN** or **Cloud** as its connection.

The computer and the lights must be on the same network (the same subnet). Guest networks and "AP isolation" / "client isolation" settings on Wi-Fi routers block LAN control.

## How the extension uses it

- **Discovery** runs when the extension is enabled, then every 5 minutes, and again when you open a menu while a light's address is unknown. Lights are matched to your cloud devices by their device ID, so you don't have to configure IP addresses.
- **Commands** for power, brightness, colour and temperature go over LAN whenever the light is reachable there. Brightness and colour slider changes are throttled to about one every 100 ms.
- **Confirmation.** LAN commands aren't acknowledged by the light, so after each change the extension asks the light for its status and corrects the menu if something didn't apply.
- **Fallback.** If a light stops answering on LAN, or if the LAN switch is off, the same controls go through the cloud.
- If the extension can't open its listening port at all, it carries on in cloud-only mode.

## Ports and firewall

The LAN API uses three UDP ports:

| Port | Direction | Purpose |
|---|---|---|
| **4001** | computer → lights (multicast to `239.255.255.250`) | Discovery scan |
| **4002** | lights → computer | Replies: scan results and status |
| **4003** | computer → light (unicast) | Commands and status requests |

Outgoing traffic on 4001 and 4003 is normally allowed. The problem is usually **incoming replies on UDP 4002**: if your firewall drops them, discovery finds nothing and every light falls back to the cloud.

Allow incoming UDP on port 4002 from your local network. The examples below allow the common private ranges; narrow them to your own subnet (for example `192.168.1.0/24`) if you prefer.

### ufw (Ubuntu, Linux Mint, and others)

```sh
sudo ufw allow from 192.168.0.0/16 to any port 4002 proto udp
```

If your network uses `10.x.x.x` or `172.16–31.x.x` addresses, add a rule for that range too, for example:

```sh
sudo ufw allow from 10.0.0.0/8 to any port 4002 proto udp
```

### firewalld (Fedora, openSUSE, RHEL, and others)

Find your active zone first:

```sh
firewall-cmd --get-active-zones
```

Then allow the port in that zone (replace `FedoraWorkstation` with your zone):

```sh
sudo firewall-cmd --zone=FedoraWorkstation --add-port=4002/udp --permanent
sudo firewall-cmd --reload
```

To allow it only from your local network instead, use a rich rule:

```sh
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.0.0/16" port port="4002" protocol="udp" accept'
sudo firewall-cmd --reload
```

### Checking it

With the extension enabled, this should list a UDP socket bound to port 4002:

```sh
ss -ulpn | grep 4002
```

## Coexisting with Home Assistant

Home Assistant's **Govee LAN** integration (and similar tools such as Homebridge plugins) use the same ports. Govee Lights opens its listening socket with address and port reuse, so it shares port 4002 with them instead of taking it over. Both can control the same lights at the same time.

Notes:

- If both run **on the same computer**, both receive scan replies. Status replies to one program's request may also be seen by the other; this is harmless.
- If Home Assistant runs **on another machine**, nothing special is needed.
- If another program bound port 4002 *without* port reuse, Govee Lights can't listen and falls back to cloud-only mode. The troubleshooting page explains how to [find which program holds the port](troubleshooting.md#no-lights-answer-on-lan).

## Turning it off

Switch off **LAN** on the **Account** page. The extension closes its socket and sends everything through the cloud. Sliders then send a value when you let go, rather than live, to stay within Govee's rate limits.
