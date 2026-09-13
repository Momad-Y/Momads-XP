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
    /**
     * Both projects are declared so each can be selected by name.
     *
     * A BARE `npx playwright test` RUNS BOTH. That is Playwright's behaviour
     * for any multi-project config, and the comment that stood here claimed
     * the opposite — so CI ran the seven `@online` specs on every PR,
     * downloading ~5 MB from jsDelivr per spec on a 2-core runner, for months.
     *
     * The hermetic guarantee is a property of `default`'s `grepInvert`, NOT of
     * how the runner is invoked. Select explicitly:
     *     npx playwright test --project=default   # hermetic
     *     npx playwright test --project=online    # real Pyodide, needs the net
     */
    projects: [
        /*
         * `default` must exclude BOTH tags. Excluding only `@online` would run
         * the heavy specs twice — once here, in parallel, which is the
         * contention the `heavy` project exists to avoid, and once there.
         */
        { name: 'default', grepInvert: /@online|@heavy/ },
        { name: 'online', grep: /@online/ },
        /*
         * HERMETIC, like `default`. The tag means EXPENSIVE, not networked:
         * DOOM boots a DOSBox WASM image and Chess instantiates Stockfish, and
         * both are self-hosted.
         *
         * It exists because of the note above: `default` flakes about one run
         * in three under machine load, the cause is overall CPU contention
         * rather than worker count, and every failure passes in isolation.
         * Dropping two WASM boots into that pool would make it worse, so they
         * get a pool of one. Run as its OWN CI step, after `default`, so the
         * two never overlap.
         *
         * Do NOT tag these `@online` instead: that project runs only on
         * cutovers, so a DOOM regression would surface at the riskiest moment,
         * and the tag would be a lie.
         */
        { name: 'heavy', grep: /@heavy/, workers: 1 },
    ],
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
