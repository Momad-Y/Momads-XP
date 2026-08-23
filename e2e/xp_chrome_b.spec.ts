import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';
import { stubBrowse } from './stub_browse';

/** The Back RButton's expand-arrow: the 10px wrapper inside its .p-2 root. */
function backArrow(win: ReturnType<Page['locator']>, page: Page) {
    return win
        .locator('div.p-2', { has: page.getByText('Back', { exact: true }) })
        .locator('div.w-\\[10px\\]');
}

test('Explorer Back dropdown lists history and jumps to a page', async ({
    page,
}) => {
    await stubBrowse(page);
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();

    // build history: My Computer → C: → Experience
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    await win.locator('.fs-item', { hasText: 'Experience' }).first().dblclick();
    await page.waitForTimeout(450);
    await expect(win.getByText('Printerpix — AI Engineer.txt')).toBeVisible();

    // open the Back dropdown (Back button = the RButton wrapping "Back")
    await backArrow(win, page).click();

    // dropdown shows the two prior entries, most-recent first
    const menu = win.locator('div.absolute.z-30').first();
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Local Disk (C:)')).toBeVisible();
    await expect(menu.getByText('My Computer')).toBeVisible();

    // jump straight back to My Computer root
    await menu.getByText('My Computer').click();
    // the drive in the viewer — View > Go To now lists the same label too
    await expect(
        win.locator('.fs-item', { hasText: 'Local Disk (C:)' }),
    ).toBeVisible();
    // the portfolio entry from Experience is no longer shown
    await expect(win.getByText('Printerpix — AI Engineer.txt')).toBeHidden();
});

test('IE Back dropdown lists visited pages', async ({ page }) => {
    await stubBrowse(page);
    await bootToDesktop(page);
    await page
        .locator('#work-space p', { hasText: 'Internet Explorer' })
        .dblclick();
    const ie = page.locator('#work-space .window').first();
    await expect(ie).toBeVisible();

    // visit the help page to build history beyond the homepage
    await ie.getByText('Help', { exact: true }).click();
    await ie.getByText('Help and Support Center').click();
    await page.waitForTimeout(1500);

    await backArrow(ie, page).click();
    const menu = ie.locator('div.absolute.z-30').first();
    await expect(menu).toBeVisible();
    // the homepage (wiby) is the prior entry
    await expect(menu.getByText(/wiby/)).toBeVisible();
});
