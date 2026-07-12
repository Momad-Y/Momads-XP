import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('boots straight to loading screen then desktop', async ({ page }) => {
    await bootToDesktop(page);
    // BIOS/boot-device menu was pruned in Phase 0 — asserted after boot so it
    // cannot pass vacuously pre-hydration
    await expect(page.locator('text=Start Windows Normally')).toHaveCount(0);
    await expect(
        page.locator('#work-space p', { hasText: 'My Computer' }),
    ).toBeVisible();
});

test('start menu opens', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    await expect(page.locator('#start-menu')).toBeVisible();
    await expect(
        page.locator('#start-menu').getByText('Internet Explorer'),
    ).toBeVisible();
});

test('My Computer window opens, drags, and closes', async ({ page }) => {
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
