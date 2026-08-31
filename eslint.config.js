import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import svelteConfig from './svelte.config.js';

export default ts.config(
    {
        ignores: [
            'build/',
            '.svelte-kit/',
            '.netlify/',
            '.claude/',
            'static/',
            'coverage/',
            'node_modules/',
            'test-results/',
            'playwright-report/',
        ],
    },
    js.configs.recommended,
    // typed, strict rules for all src code — TS modules AND svelte components
    // (the whole tree is strict TS since Task 13). NOTE: this block sits
    // before the svelte configs so that svelte-eslint-parser (registered
    // there) wins as the file-level parser for *.svelte; ts.parser only
    // parses <script> blocks via parserOptions.parser below.
    {
        files: ['src/**/*.ts', 'src/**/*.svelte'],
        extends: [...ts.configs.strictTypeChecked],
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unsafe-type-assertion': 'error',
        },
    },
    ...svelte.configs.recommended,
    prettier,
    ...svelte.configs.prettier,
    {
        files: ['src/**/*.ts', 'src/**/*.svelte'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                extraFileExtensions: ['.svelte'],
                svelteConfig,
            },
        },
    },
    {
        files: ['src/**/*.svelte'],
        languageOptions: { parserOptions: { parser: ts.parser } },
        rules: {
            // Script blocks are parsed by the TS parser; undefined references
            // are caught by svelte-check, and browser globals are expected.
            'no-undef': 'off',
        },
    },
    // web-worker source (my_computer's sort worker runs off the main thread)
    {
        files: ['src/**/sort.js'],
        languageOptions: {
            globals: {
                onmessage: 'writable',
                postMessage: 'readonly',
                console: 'readonly',
            },
        },
    },
    // untyped zone: root configs, e2e specs, gen scripts (node context)
    {
        files: ['*.js', '*.cjs', '*.ts', 'e2e/**', 'gen/**', 'scripts/**'],
        extends: [ts.configs.disableTypeChecked],
        languageOptions: {
            globals: { console: 'readonly', process: 'readonly' },
        },
    },
    // The jspaint sessions stub is BROWSER source that prune-jspaint.mjs copies
    // into the vendored tree. It lives under scripts/ because that is the only
    // thing that reads it, but it never runs in node.
    {
        files: ['scripts/jspaint-sessions-stub.js'],
        languageOptions: { globals: { window: 'writable' } },
    },
);
