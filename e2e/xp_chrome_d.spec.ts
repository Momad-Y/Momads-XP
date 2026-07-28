import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('Explorer view modes switch the layout', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    // enter C: for a folder with files
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);

    async function pickView(mode: string) {
        await win
            .locator('.toolbar-menu')
            .getByText('View', { exact: true })
            .click();
        await win.getByText(mode, { exact: true }).click();
    }

    // Details: header columns appear
    await pickView('Details');
    await expect(win.getByText('Type', { exact: true })).toBeVisible();
    await expect(win.getByText('Size', { exact: true })).toBeVisible();
    await expect(win.getByText('PDF File')).toBeVisible();

    // Icons: the Details header is gone
    await pickView('Icons');
    await expect(win.getByText('Type', { exact: true })).toBeHidden();

    // Thumbnails: still shows the items (larger)
    await pickView('Thumbnails');
    await expect(win.getByText('Mohamed_Abdelnasser_Resume.pdf')).toBeVisible();
});
