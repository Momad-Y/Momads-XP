import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    timeout: 60_000,
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
