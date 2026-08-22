import type { Page } from '@playwright/test';

/**
 * Keep the e2e suite off the live internet.
 *
 * IE's homepage is wiby.me and it loads through the REAL `/api/browse`, so
 * every spec that opens IE made an outbound request. That was already a
 * dependency worth removing; it became a flake source once the proxy started
 * resolving DNS itself and opening a pinned TLS connection per request, which
 * is slower and more failure-prone than a pooled fetch.
 *
 * Specs that are ABOUT the proxy (redirect handling, meta refresh) install
 * their own richer stubs — this is the blanket one for specs that merely
 * happen to open a browser window.
 */
export async function stubBrowse(page: Page): Promise<void> {
    await page.route('**/api/browse**', async (route) => {
        const asked =
            new URL(route.request().url()).searchParams.get('url') ?? '';
        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: `<html><head><title>Stub</title></head><body>STUB ${asked}</body></html>`,
        });
    });
}
