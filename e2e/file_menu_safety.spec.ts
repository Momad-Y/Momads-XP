import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * Regression cover for the red-team findings on Explorer's File menu. Each test
 * here maps to a defect that was reproduced against the previous build.
 */

async function openExplorerAt(page: Page, folder: string) {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    await win.locator('.fs-item', { hasText: folder }).first().dblclick();
    await page.waitForTimeout(450);
    return win;
}

const menuRow = (win: ReturnType<Page['locator']>, name: string) =>
    win
        .locator('p', { hasText: new RegExp(`^${name}$`) })
        .first()
        .locator('..');

test('CRITICAL: a desktop selection cannot be acted on from an Explorer window', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();

    // select an item on the DESKTOP, which this window is not showing
    await page.locator('#work-space p', { hasText: 'About Me' }).click();
    await page.waitForTimeout(250);

    await win.locator('.toolbar-menu').getByText('File').click();
    await expect(menuRow(win, 'Open')).toBeVisible();
    // every destructive verb must stay inert — previously they all went live
    // and Delete really did destroy the desktop icon
    for (const name of ['Open', 'Create Shortcut', 'Delete', 'Rename']) {
        await expect(menuRow(win, name)).toHaveClass(/text-slate-400/);
    }
    // the desktop item is still there
    await expect(
        page.locator('#work-space p', { hasText: 'About Me' }),
    ).toHaveCount(1);
});

test('File > Open launches the file instead of navigating into it', async ({
    page,
}) => {
    const win = await openExplorerAt(page, 'Experience');
    await win
        .locator('.fs-item', { hasText: 'Printerpix — AI Engineer.txt' })
        .first()
        .click();
    await win.locator('.toolbar-menu').getByText('File').click();
    await win.getByText('Open', { exact: true }).click();

    // a second window opens with the entry's content …
    const detail = page.locator('#work-space .window').nth(1);
    await expect(detail.getByText('AI Engineer', { exact: true })).toBeVisible({
        timeout: 15000,
    });
    // … and Explorer did NOT navigate inside the file
    await expect(win.locator('input[value*=".txt"]')).toHaveCount(0);
});

test('Escape cancels an inline rename instead of committing it', async ({
    page,
}) => {
    const win = await openExplorerAt(page, 'Experience');
    // work on a file we created, so rename is permitted
    await win.locator('.toolbar-menu').getByText('File').click();
    await win.locator('p', { hasText: /^New$/ }).first().hover();
    await win.getByText('Text Document').click();
    const created = win.getByText('New Text Document.txt');
    await expect(created).toBeVisible({ timeout: 15000 });

    await created.click({ button: 'right' });
    await page.locator('.context-menu').getByText('Rename').click();
    const box = win.locator('textarea');
    await expect(box).toBeVisible();
    await box.fill('ESCAPED_NAME');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // click elsewhere: the abandoned edit must NOT be committed on blur
    await win.locator('.fs-item').first().click();
    await page.waitForTimeout(300);

    await expect(win.getByText('ESCAPED_NAME')).toHaveCount(0);
    await expect(win.getByText('New Text Document.txt')).toBeVisible();
});

test('property sheets are single-instance and Escape closes them', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();

    const openFolderOptions = async () => {
        await win.locator('.toolbar-menu').getByText('Tools').click();
        await win.getByText('Folder Options...', { exact: true }).click();
        await page.waitForTimeout(600);
    };
    // "Restore Defaults" only exists inside the sheet, so this counts sheets
    // (the Explorer window also contains the words "Folder Options" in its
    // Tools menu, which makes a title-based locator useless here).
    const sheets = page
        .locator('#work-space .window')
        .filter({ hasText: 'Restore Defaults' });

    await openFolderOptions();
    await expect(sheets).toHaveCount(1);
    await openFolderOptions();
    await openFolderOptions();
    // XP raises the open sheet rather than stacking copies
    await expect(sheets).toHaveCount(1);

    // and Escape cancels it, like any XP property sheet
    await page.keyboard.press('Escape');
    await expect(sheets).toHaveCount(0);
});
