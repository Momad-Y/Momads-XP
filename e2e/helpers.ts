import { expect, type Page } from '@playwright/test';

/**
 * Boot → login-card click → welcome splash → interactive desktop.
 *
 * The welcome splash overlays the whole desktop (z-50) for ~2.1s: visibility
 * checks on the taskbar pass while clicks would still land on the overlay,
 * so this explicitly waits for the overlay to unmount.
 *
 * By default the boot WAIT is skipped through the app's own affordance — the
 * boot screen skips on any click or keypress once the VFS seed has landed
 * (`starting.svelte`). That is a real user gesture, not a test-only hook.
 *
 * Why: boot sleeps 3s and then loops up to 7 more waiting on assets, so every
 * test paid 3–10s before doing anything. That cost is serialised on CI, which
 * runs only 2 workers, so this is where the saving lands.
 *
 * It is NOT a flake fix. Skipping made local parallel runs slightly WORSE —
 * the sleep had been acting as accidental backpressure — and the suite still
 * flakes about one spec per two or three local runs at any worker count,
 * always passing in isolation. That tracks machine load, not this helper.
 *
 * Pass `{ skip: false }` in specs that exist to TEST the boot sequence itself.
 * Without that, nothing would cover the full startup a real visitor sees.
 */
export async function bootToDesktop(
    page: Page,
    { skip = true }: { skip?: boolean } = {},
): Promise<void> {
    await page.goto('/');

    if (skip) {
        // wait for the point at which skipping is honoured, then skip. The
        // boot screen ignores the gesture until the seed has landed, so a
        // blind keypress would be a race.
        await expect(
            page.locator('#boot-screen[data-boot-skippable="true"]'),
        ).toBeAttached({ timeout: 30_000 });
        await page.keyboard.press('Space');
    }

    // boot takes >=3s (aesthetic sleep) + asset preloading, then shows login
    await page.locator('#login-user-card').click({ timeout: 30_000 });
    await expect(page.locator('#start-menu-btn')).toBeVisible({
        timeout: 30_000,
    });
    await expect(page.locator('#welcome-overlay')).toHaveCount(0, {
        timeout: 10_000,
    });
}
