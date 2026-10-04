// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// Plain-text report for bug reports. Never includes the API key, device ids,
// IP addresses or names: only models (SKUs) and how each light is reached.

// info: {extensionVersion, commit?, shellVersion, gjsVersion, os, sessionType,
//        useLan, hasApiKey, lights: [{sku, connection, placement}]}
export function formatDebugInfo(info) {
    const lines = [
        `Govee Lights: ${info.extensionVersion}${info.commit ? ` (${info.commit})` : ''}`,
        `GNOME Shell: ${info.shellVersion}`,
        `GJS: ${info.gjsVersion}`,
        `OS: ${info.os}`,
        `Session: ${info.sessionType}`,
        `LAN control: ${info.useLan ? 'on' : 'off'}`,
        `API key set: ${info.hasApiKey ? 'yes' : 'no'}`,
        `Lights: ${info.lights.length}`,
    ];
    for (const light of info.lights)
        lines.push(`  - ${light.sku}: ${light.connection}, ${light.placement}`);
    return lines.join('\n');
}

// "18801" → "1.88.1"
export function formatGjsVersion(version) {
    const v = Number(version);
    return `${Math.floor(v / 10000)}.${Math.floor(v / 100) % 100}.${v % 100}`;
}
