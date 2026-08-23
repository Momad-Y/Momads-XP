import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';
import { stubBrowse } from './stub_browse';

/**
 * The FULL startup, with no skip. Every other spec now skips the boot wait
 * through the app's own click/keypress affordance, so without this nothing
 * would cover the sequence a real visitor actually sits through.
 */
test('boots straight to loading screen then desktop', async ({ page }) => {
    await bootToDesktop(page, { skip: false });
    // BIOS/boot-device menu was pruned in Phase 0 — asserted after boot so it
    // cannot pass vacuously pre-hydration
    await expect(page.locator('text=Start Windows Normally')).toHaveCount(0);
    await expect(
        page.locator('#work-space p', { hasText: 'My Computer' }),
    ).toBeVisible();
});

test('start menu opens', async ({ page }) => {
    await stubBrowse(page);
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    await expect(page.locator('#start-menu')).toBeVisible();
    await expect(
        page.locator('#start-menu').getByText('Internet Explorer'),
    ).toBeVisible();
});

test('My Computer window opens, drags, and closes', async ({ page }) => {
    await stubBrowse(page);
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();

    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();

    const before = await win.boundingBox();
    if (!before) throw new Error('window has no bounding box');
    await page.mouse.move(before.x + 150, before.y + 10);
    await page.mouse.down();
    await page.mouse.move(before.x + 350, before.y + 140, { steps: 12 });
    await page.mouse.up();
    const after = await win.boundingBox();
    if (!after) throw new Error('window has no bounding box after drag');
    expect(after.x).not.toBe(before.x);

    // close via the X button (last of the three title-bar buttons)
    await win.locator('button').nth(2).click();
    await expect(win).toBeHidden();
});

/**
 * The boot screen and its skip affordance. The whole e2e suite now depends on
 * that skip, so it needs a test of its own — otherwise breaking it would show
 * up as ninety mysterious timeouts rather than one clear failure.
 */
test('the boot screen renders and becomes skippable', async ({ page }) => {
    await page.goto('/');
    const boot = page.locator('#boot-screen');
    await expect(boot).toBeVisible({ timeout: 15_000 });
    await expect(boot.locator('img')).toBeVisible();

    // it ignores the gesture until the VFS seed has landed, then honours it
    await expect(
        page.locator('#boot-screen[data-boot-skippable="true"]'),
    ).toBeAttached({ timeout: 30_000 });
    await page.keyboard.press('Space');

    // The budget has to be SHORTER than the un-skipped boot, or the test
    // passes with the skip deleted: starting.svelte sleeps 3000ms minimum, so
    // a 10s allowance proved nothing and the affordance the whole 91-spec
    // suite depends on could have died silently.
    await expect(page.locator('#boot-screen')).toHaveCount(0, {
        timeout: 1500,
    });
    await expect(page.locator('#login-user-card')).toBeVisible({
        timeout: 1500,
    });
});
