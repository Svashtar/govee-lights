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

// Parses a Keep a Changelog file into releases for About → What's New:
//   [{version, date, sections: [{title, items: [{markup, level}]}]}]
// Item text is Pango markup (links reduced to their text). Everything before
// the first "## " heading and link reference lines are skipped.
export function parseChangelog(markdown) {
    const releases = [];
    let release = null;
    let section = null;

    for (const raw of markdown.split('\n')) {
        const line = raw.trimEnd();
        if (/^\[[^\]]+\]:\s/.test(line))
            continue;

        let m;
        if ((m = line.match(/^## \[?([^\]]+?)\]?(?: - (.*))?$/))) {
            release = {version: m[1], date: m[2] ?? null, sections: []};
            section = null;
            releases.push(release);
        } else if (!release) {
            continue;
        } else if ((m = line.match(/^### (.*)$/))) {
            section = {title: m[1], items: []};
            release.sections.push(section);
        } else if ((m = line.match(/^(\s*)[-*] (.*)$/))) {
            if (!section) {
                section = {title: '', items: []};
                release.sections.push(section);
            }
            section.items.push({markup: inline(m[2]), level: m[1].length >= 2 ? 1 : 0});
        } else if (line.trim() && section?.items.length) {
            // A wrapped continuation of the previous item.
            section.items.at(-1).markup += ` ${inline(line.trim())}`;
        }
    }
    return releases;
}
