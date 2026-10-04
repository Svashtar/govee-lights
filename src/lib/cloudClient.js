// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// Govee Platform cloud API (openapi.api.govee.com) over Soup 3.
// Reads are retried on 5xx/network errors; device/control is never retried,
// because a repeated command could flip a light twice.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

import {CAP, parseCapabilities, parseSceneList} from './capabilities.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');

export const BASE_URL = 'https://openapi.api.govee.com/router/api/v1/';
export const DAILY_LIMIT = 10000;
const TIMEOUT_SECONDS = 10;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const MAX_RETRY_AFTER_S = 2;

// kind: 'auth' | 'rate-limit' | 'network' | 'device' | 'api' | 'cancelled'
export class GoveeError extends Error {
    constructor(kind, message, {status = null, retryAfter = null} = {}) {
        super(message);
        this.name = 'GoveeError';
        this.kind = kind;
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

// Maps an HTTP response to the parsed body, or throws GoveeError.
// Govee also reports failures inside a 200 response (`code`, `payload.result`).
export function checkResponse(status, body, retryAfterHeader = null) {
    const message = body?.message || body?.msg || `HTTP ${status}`;
    if (status === 401 || status === 403)
        throw new GoveeError('auth', 'The Govee API key was rejected.', {status});
    if (status === 429) {
        const retryAfter = Number.parseInt(retryAfterHeader, 10);
        throw new GoveeError('rate-limit', 'Govee rate limit reached.', {
            status, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
        });
    }
    if (status === 404)
        throw new GoveeError('device', message, {status});
    if (status < 200 || status >= 300)
        throw new GoveeError('api', message, {status});
    if (body === null || typeof body !== 'object')
        throw new GoveeError('api', 'Unexpected response from Govee.', {status});
    if (body.code !== undefined && Number(body.code) !== 200)
        throw new GoveeError(Number(body.code) === 401 ? 'auth' : 'api', message, {status: Number(body.code)});
    if (body.payload?.result === 'error')
        throw new GoveeError('device', body.payload.message || message, {status});
    return body;
}

// Milliseconds to wait before retrying, or null to give up.
export function retryDelay(error, attempt, idempotent) {
    if (!idempotent || attempt >= RETRY_DELAYS_MS.length)
        return null;
    if (error.kind === 'network' || (error.kind === 'api' && (error.status ?? 500) >= 500))
        return RETRY_DELAYS_MS[attempt];
    if (error.kind === 'rate-limit' && error.retryAfter !== null && error.retryAfter <= MAX_RETRY_AFTER_S)
        return error.retryAfter * 1000;
    return null;
}

function uuid() {
    return GLib.uuid_string_random();
}

function wait(ms, cancellable) {
    return new Promise((resolve, reject) => {
        let cancelId = 0;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            if (cancelId)
                cancellable.disconnect(cancelId);
            resolve();
            return GLib.SOURCE_REMOVE;
        });
        cancelId = cancellable?.connect(() => {
            GLib.source_remove(id);
            reject(new GoveeError('cancelled', 'Cancelled'));
        }) ?? 0;
    });
}

export class CloudClient {
    // onRequest: called once per HTTP request, for the daily counter
    constructor({apiKey, onRequest = () => {}}) {
        this._apiKey = apiKey;
        this._onRequest = onRequest;
        this._session = new Soup.Session({timeout: TIMEOUT_SECONDS, user_agent: 'govee-lights-gnome-extension'});
        this._cancellable = new Gio.Cancellable();
    }

    destroy() {
        this._cancellable.cancel();
        this._session.abort();
    }

    async _request(method, path, body = null, {idempotent = method === 'GET'} = {}) {
        for (let attempt = 0; ; attempt++) {
            try {
                return await this._send(method, path, body);
            } catch (e) {
                if (!(e instanceof GoveeError))
                    throw e;
                const delay = retryDelay(e, attempt, idempotent);
                if (delay === null)
                    throw e;
                console.debug(`govee-lights: retrying ${method} ${path} in ${delay} ms (${e.message})`);
                await wait(delay, this._cancellable);
            }
        }
    }

    async _send(method, path, body) {
        const message = Soup.Message.new(method, `${BASE_URL}${path}`);
        const headers = message.get_request_headers();
        headers.append('Govee-API-Key', this._apiKey);
        headers.append('Accept', 'application/json');
        if (body !== null) {
            message.set_request_body_from_bytes('application/json',
                new GLib.Bytes(new TextEncoder().encode(JSON.stringify(body))));
        }

        this._onRequest();
        let bytes;
        try {
            bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, this._cancellable);
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                throw new GoveeError('cancelled', 'Cancelled');
            throw new GoveeError('network', e.message);
        }

        const status = message.get_status();
        let parsed = null;
        try {
            const data = bytes.get_data();
            parsed = data?.length ? JSON.parse(new TextDecoder().decode(data)) : null;
        } catch {}
        return checkResponse(status, parsed, message.get_response_headers().get_one('Retry-After'));
    }

    // → [{id, sku, name, capabilities (parsed), raw}] for lights only
    async getDevices() {
        const body = await this._request('GET', 'user/devices');
        const devices = Array.isArray(body.data) ? body.data : [];
        return devices
            .filter(d => d?.device && d.sku && String(d.type ?? '').toLowerCase().includes('light'))
            .map(d => ({
                id: String(d.device).toUpperCase(),
                sku: d.sku,
                name: d.deviceName || d.sku,
                capabilities: parseCapabilities(d.capabilities),
            }));
    }

    _query(device) {
        return {requestId: uuid(), payload: {sku: device.sku, device: device.id}};
    }

    // → device/state response body (see capabilities.flattenState)
    getState(device) {
        return this._request('POST', 'device/state', this._query(device), {idempotent: true});
    }

    async getScenes(device) {
        const body = await this._request('POST', 'device/scenes', this._query(device), {idempotent: true});
        return parseSceneList(body, CAP.scene);
    }

    async getDiyScenes(device) {
        const body = await this._request('POST', 'device/diy-scenes', this._query(device), {idempotent: true});
        return parseSceneList(body, CAP.diyScene);
    }

    // capability: {type, instance, value} from capabilities.cloudCommand()
    control(device, capability) {
        const query = this._query(device);
        query.payload.capability = capability;
        return this._request('POST', 'device/control', query, {idempotent: false});
    }
}
