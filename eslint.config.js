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
        },
    },
];
