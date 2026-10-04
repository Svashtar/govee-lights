// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

import {LAN_ACTIONS} from './capabilities.js';

// LAN throttle while dragging: the light follows the slider live.
export const LAN_THROTTLE_MS = 100;
// Cloud: wait for the drag to settle, or send at once on release.
export const CLOUD_DEBOUNCE_MS = 400;
// LAN commands are not acknowledged; read the state back after a burst.
export const LAN_CONFIRM_MS = 700;

// 'lan' | 'cloud' | null (cannot be sent: no route available)
export function chooseRoute({ip, hasCloud}, action, useLan) {
    if (useLan && ip && LAN_ACTIONS.has(action))
        return 'lan';
    return hasCloud ? 'cloud' : null;
}

// Whether the cloud state is old enough to fetch again when a menu opens.
export function isStale(updatedMs, nowMs, staleSeconds) {
    return nowMs - updatedMs > staleSeconds * 1000;
}
