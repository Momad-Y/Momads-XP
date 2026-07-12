import { expect, type Page } from '@playwright/test';

/**
 * Boot → login-card click → welcome splash → interactive desktop.
 *
 * The welcome splash overlays the whole desktop (z-50) for ~2.1s: visibility
 * checks on the taskbar pass while clicks would still land on the overlay,
 * so this explicitly waits for the overlay to unmount.
 */
export async function bootToDesktop(page: Page): Promise<void> {
    await page.goto('/');
    // boot takes >=3s (aesthetic sleep) + asset preloading, then shows login
    await page.locator('#login-user-card').click({ timeout: 30_000 });
    await expect(page.locator('#start-menu-btn')).toBeVisible({
        timeout: 30_000,
    });
    await expect(page.locator('#welcome-overlay')).toHaveCount(0, {
        timeout: 10_000,
    });
}
