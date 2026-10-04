// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli

// ESLint flat config for a GJS / GNOME Shell extension.
// Self-contained (no plugins or shared configs), so `npx --yes eslint@9 .`
// works without a package.json or node_modules.

const gjsGlobals = {
    // GJS
    ARGV: 'readonly',
    imports: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    console: 'readonly',
    TextEncoder: 'readonly',
    TextDecoder: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    // GNOME Shell
    global: 'readonly',
};

function restrict(namespaces) {
    return namespaces.map(ns => ({group: [`gi://${ns}`, `gi://${ns}?*`], message: `${ns} is not allowed in this process.`}));
}

export default [
    {
        ignores: ['build/', 'dist/', 'node_modules/'],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: gjsGlobals,
        },
        linterOptions: {
            reportUnusedDisableDirectives: true,
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', {
                args: 'none',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',
            }],
            'prefer-const': 'error',
            'eqeqeq': ['error', 'smart'],
            'no-var': 'error',
            'no-unreachable': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-imports': 'error',
            'no-empty': ['error', {allowEmptyCatch: true}],
            'no-useless-catch': 'error',
            'max-len': ['error', {code: 200}],
            // Indentation as in GNOME Shell's own ESLint config.
            'indent': ['error', 4, {
                ignoredNodes: [
                    'CallExpression[callee.object.name=GObject][callee.property.name=registerClass] > ClassExpression:first-child',
                    'TemplateLiteral *',
                ],
                CallExpression: {arguments: 'first'},
                ArrayExpression: 'first',
                ObjectExpression: 'first',
                MemberExpression: 'off',
            }],
        },
    },
    // Process separation (EGO review rule): shared modules work in both
    // processes, shell code never loads GTK, prefs never loads shell libraries.
    {
        files: ['src/lib/**/*.js'],
        rules: {
            'no-restricted-imports': ['error', {patterns: restrict(['Gtk', 'Gdk', 'Adw', 'St', 'Clutter', 'Meta', 'Shell'])}],
        },
    },
    {
        files: ['src/extension.js', 'src/ui/**/*.js'],
        rules: {
            'no-restricted-imports': ['error', {patterns: restrict(['Gtk', 'Gdk', 'Adw'])}],
        },
    },
    {
        files: ['src/prefs.js', 'src/prefs/**/*.js'],
        rules: {
            'no-restricted-imports': ['error', {patterns: restrict(['St', 'Clutter', 'Meta', 'Shell'])}],
        },
    },
];
