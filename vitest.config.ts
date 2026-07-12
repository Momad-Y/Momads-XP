import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            // Phase 0 coverage scope: new modules only (grows per phase — see
            // SPECIFICATION.md §5; diff-based patch coverage starts Phase 1)
            include: ['src/lib/seed.ts'],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
});
