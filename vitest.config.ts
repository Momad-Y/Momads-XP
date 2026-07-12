import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            // Phase 1 ratchet (design decision 10): every typed module is
            // instrumented; the gate is diff-cover in CI (>=80% on changed
            // lines vs origin/dev). `.svelte` components are deliberately
            // exempt from line coverage — they are owned by the Playwright
            // E2E suite. Phase 0's glob thresholds retire with this switch
            // (phase-0-guide §10).
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
        },
    },
});
