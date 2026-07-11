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
    // typed, strict rules — src only (the generated project covers src/** and tests/**)
    {
        files: ['src/**/*.ts', 'src/**/*.svelte'],
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
