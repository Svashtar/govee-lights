// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// Govee LAN API over UDP. Lights with "LAN Control" enabled in the Govee Home
// app listen for multicast scans on 239.255.255.250:4001, reply to the sender
// on port 4002 and accept commands on port 4003. Commands are not
// acknowledged; callers confirm with requestStatus().

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Emitter} from './emitter.js';

export const MULTICAST_GROUP = '239.255.255.250';
export const SCAN_PORT = 4001;
export const LISTEN_PORT = 4002;
export const COMMAND_PORT = 4003;

export function encode(cmd, data = {}) {
    return JSON.stringify({msg: {cmd, data}});
}

// Returns {cmd, data} or null for anything that isn't a Govee LAN message.
export function decode(text) {
    try {
        const msg = JSON.parse(text)?.msg;
        if (typeof msg?.cmd === 'string' && msg.data && typeof msg.data === 'object')
            return {cmd: msg.cmd, data: msg.data};
    } catch {}
    return null;
}

// Signals:
//   'device-found' (device: {id, ip, sku, firmware})  every scan reply
//   'status'       (ip, {onOff, brightness, color: {r,g,b}, colorTemInKelvin})
export class LanClient extends Emitter {
    #socket = null;
    #source = null;

    get running() {
        return this.#socket !== null;
    }

    // Throws GLib.Error when port 4002 can't be bound; callers fall back to cloud.
    start() {
        if (this.#socket)
            return;
        const socket = Gio.Socket.new(Gio.SocketFamily.IPV4, Gio.SocketType.DATAGRAM, Gio.SocketProtocol.UDP);
        try {
            // allow_reuse sets SO_REUSEADDR/SO_REUSEPORT, so Home Assistant
            // and other Govee integrations can listen on 4002 too.
            socket.bind(Gio.InetSocketAddress.new_from_string('0.0.0.0', LISTEN_PORT), true);
            socket.set_blocking(false);
            socket.multicast_ttl = 2;
        } catch (e) {
            socket.close();
            throw e;
        }

        this.#socket = socket;
        this.#source = socket.create_source(GLib.IOCondition.IN, null);
        this.#source.set_callback(() => this.#onReadable());
        this.#source.attach(null);
    }

    stop() {
        this.#source?.destroy();
        this.#source = null;
        this.#socket?.close();
        this.#socket = null;
    }

    destroy() {
        this.stop();
        this.disconnectAll();
    }

    scan() {
        this.#send(MULTICAST_GROUP, SCAN_PORT, encode('scan', {account_topic: 'reserve'}));
    }

    requestStatus(ip) {
        this.#send(ip, COMMAND_PORT, encode('devStatus'));
    }

    // cmd/data as built by capabilities.lanCommand()
    command(ip, cmd, data) {
        this.#send(ip, COMMAND_PORT, encode(cmd, data));
    }

    #send(host, port, text) {
        if (!this.#socket)
            throw new Error('LAN client is not running');
        const address = Gio.InetSocketAddress.new_from_string(host, port);
        this.#socket.send_to(address, new TextEncoder().encode(text), null);
    }

    #onReadable() {
        for (;;) {
            let bytes, address;
            try {
                [bytes, address] = this.#socket.receive_bytes_from(65536, 0, null);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.WOULD_BLOCK))
                    logError(e, 'govee-lights: LAN receive');
                break;
            }
            const ip = address.get_address().to_string();
            const msg = decode(new TextDecoder().decode(bytes.toArray()));
            if (msg)
                this.#handle(ip, msg);
        }
        return GLib.SOURCE_CONTINUE;
    }

    #handle(sourceIp, {cmd, data}) {
        if (cmd === 'scan' && data.device) {
            this.emit('device-found', {
                id: String(data.device).toUpperCase(),
                ip: data.ip ?? sourceIp,
                sku: data.sku ?? null,
                firmware: data.wifiVersionSoft ?? null,
            });
        } else if (cmd === 'devStatus') {
            this.emit('status', sourceIp, data);
        }
    }
}
