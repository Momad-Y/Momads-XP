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
            'static/',
            'coverage/',
            'node_modules/',
            'test-results/',
            'playwright-report/',
        ],
    },
    js.configs.recommended,
    ...svelte.configs.recommended,
    prettier,
    ...svelte.configs.prettier,
    // typed, strict rules — src TS modules only (the generated project covers
    // src/** and tests/**). NOTE: .svelte files join this block in the Task 13
    // conversion; extending strictTypeChecked over *.svelte replaces
    // svelte-eslint-parser with the TS parser (parse errors on every
    // component), and typed rules on still-JS svelte scripts flood
    // no-unsafe-* errors, blocking every svelte-touching commit.
    {
        files: ['src/**/*.ts'],
        extends: [...ts.configs.strictTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: true,
                extraFileExtensions: ['.svelte'],
                svelteConfig,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unsafe-type-assertion': 'error',
        },
    },
    {
        files: ['src/**/*.svelte'],
        languageOptions: { parserOptions: { parser: ts.parser } },
        rules: {
            // Script blocks are parsed by the TS parser; undefined references
            // are caught by svelte-check, and browser globals are expected.
            'no-undef': 'off',
            // Inherited win32.run base components pre-date linting. These are
            // real findings, kept visible as warnings; the Task 13 TypeScript
            // conversion of the .svelte tree fixes them and DELETES this
            // downgrade block (restoring them to errors).
            'no-unused-vars': 'warn',
            'no-empty': 'warn',
            'no-useless-assignment': 'warn',
            'no-async-promise-executor': 'warn',
            'svelte/require-each-key': 'warn',
            'svelte/no-useless-mustaches': 'warn',
            'svelte/no-unused-svelte-ignore': 'warn',
            'svelte/no-reactive-reassign': 'warn',
            'svelte/no-dom-manipulating': 'warn',
        },
    },
    // untyped zone: root configs, e2e specs, gen scripts (node context)
    {
        files: ['*.js', '*.cjs', '*.ts', 'e2e/**', 'gen/**'],
        extends: [ts.configs.disableTypeChecked],
        languageOptions: {
            globals: { console: 'readonly', process: 'readonly' },
        },
    },
);
