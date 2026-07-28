import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

async function openMyComputer(page: Page) {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    await expect(page.locator('#work-space .window').first()).toBeVisible();
}

test('View System Information opens the funny System Properties', async ({
    page,
}) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    await win.getByText('View System Information').click();
    const sys = page.locator('#work-space .window', {
        hasText: 'System Properties',
    });
    await expect(sys.getByText('Mohamed Abdelnasser')).toBeVisible();
    await expect(sys.getByText(/raw ambition/)).toBeVisible();
    await sys.getByText('OK', { exact: true }).click();
    await expect(sys).toBeHidden();
});

test('Create Shortcut makes a working .lnk that opens its target', async ({
    page,
}) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    // right-click the Experience folder → Create Shortcut
    await win.getByText('Experience', { exact: true }).click({
        button: 'right',
    });
    await page
        .locator('.context-menu')
        .getByText('Create Shortcut', { exact: true })
        .click();
    const shortcut = win.getByText('Shortcut to Experience.lnk');
    await expect(shortcut).toBeVisible();

    // opening the shortcut opens the Experience folder
    await shortcut.dblclick();
    await page.waitForTimeout(450);
    await expect(win.getByText('Printerpix — AI Engineer.txt')).toBeVisible();
});

test('IE Mail button opens Contact Me', async ({ page }) => {
    await bootToDesktop(page);
    await page
        .locator('#work-space p', { hasText: 'Internet Explorer' })
        .dblclick();
    const ie = page.locator('#work-space .window').first();
    await expect(ie).toBeVisible();
    await ie.getByText('Mail', { exact: true }).click();
    await expect(
        page.locator('#work-space .window', { hasText: 'Contact Me' }),
    ).toBeVisible();
});
