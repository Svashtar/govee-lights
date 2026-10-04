// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// Just enough Markdown → Pango markup to show CHANGELOG.md in a Gtk.Label.
// Pure (no gi imports) so it can be unit tested.

export function escapeMarkup(text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function inline(text) {
    return escapeMarkup(text)
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<tt>$1</tt>');
}

// Skips everything before the first release heading (the file's own title and
// intro) and link reference definitions at the bottom.
export function changelogToMarkup(markdown) {
    const out = [];
    let started = false;

    for (const raw of markdown.split('\n')) {
        const line = raw.trimEnd();
        if (/^## /.test(line))
            started = true;
        if (!started || /^\[[^\]]+\]:\s/.test(line))
            continue;

        let m;
        if ((m = line.match(/^## \[?([^\]]+?)\]?(?: - (.*))?$/))) {
            if (out.length)
                out.push('');
            out.push(`<span size="large"><b>${inline(m[1])}</b></span>${m[2] ? `  <span alpha="60%">${inline(m[2])}</span>` : ''}`);
        } else if ((m = line.match(/^### (.*)$/))) {
            out.push(`<b>${inline(m[1])}</b>`);
        } else if ((m = line.match(/^(\s*)[-*] (.*)$/))) {
            out.push(`${m[1] ? '    ◦' : '•'} ${inline(m[2])}`);
        } else if (line !== '' || out.at(-1) !== '') {
            out.push(inline(line));
        }
    }

    while (out.at(-1) === '')
        out.pop();
    return out.join('\n');
}
