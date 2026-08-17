import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('Explorer Favorites menu is seeded from profile and opens IE', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();

    await win.locator('[data-menu="Favorites"]').click();
    // seeded from profile.social. Scoped to the menu: the (hidden) Links
    // toolbar lists the same favourites.
    const menu = win.locator('.toolbar-menu');
    await expect(menu.getByText('GitHub', { exact: true })).toBeVisible();
    await expect(menu.getByText('LinkedIn', { exact: true })).toBeVisible();
    await expect(menu.getByText('Instagram', { exact: true })).toBeVisible();

    // clicking one launches Internet Explorer
    await menu.getByText('GitHub', { exact: true }).click();
    await expect(page.locator('#work-space iframe')).toHaveCount(1, {
        timeout: 10000,
    });
});

test('IE Favorites sidebar is seeded and shares the store', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page
        .locator('#work-space p', { hasText: 'Internet Explorer' })
        .dblclick();
    const ie = page.locator('#work-space .window').first();
    await expect(ie).toBeVisible();

    // open the Favorites sidebar via its toolbar button (menu bar also has
    // a Favorites item; the toolbar RButton label is the last match)
    await ie.getByText('Favorites', { exact: true }).last().click();
    // the seeded favorites appear in the sidebar (same store as Explorer).
    // .last(): the Favorites *menu* also lists them (hidden in a closed
    // dropdown) — the sidebar copy renders later in the DOM.
    await expect(ie.getByText('GitHub').last()).toBeVisible();
    await expect(ie.getByText('LinkedIn').last()).toBeVisible();
});
