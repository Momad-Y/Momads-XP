import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    timeout: 60_000,
    /**
     * Local only — CI keeps Playwright's default (2 workers on a 2-core
     * runner) and has never flaked.
     *
     * This cap is a SPEED choice, not a flake fix. Measured on a 16-core box:
     * 4 workers was the fastest configuration (2.6–4.0 min vs 3.6 at the
     * default 8), and 8 was the only setting that failed several specs at
     * once. But capping does NOT make the suite deterministic — 2 workers,
     * the exact CI configuration, still flaked one run in three here. The
     * failures follow overall machine load (`page.goto` itself timing out
     * against the single `vite preview` process), not worker count, and every
     * one of them passes in isolation. Do not read a green local run as proof
     * the cap fixed anything.
     */
    workers: process.env.CI ? undefined : 4,
    use: { viewport: { width: 1280, height: 800 } },
    webServer: {
        // CI builds earlier in the pipeline — reuse that build instead of duplicating it
        command: process.env.CI
            ? 'npm run preview'
            : 'npm run build && npm run preview',
        port: 4173, // vite preview default; vite.config's server.port 3000 is dev-only
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
    },
});
