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

    // the other three tabs are implemented too (profile-driven funny content)
    await sys.getByText('Computer Name', { exact: true }).click();
    await expect(sys.getByText('momad-xp.local')).toBeVisible();
    await sys.getByText('Hardware', { exact: true }).click();
    await expect(
        sys.getByText('Caffeine Intake Controller (USB, always-on)'),
    ).toBeVisible();
    await sys.getByText('Advanced', { exact: true }).click();
    await expect(sys.getByText('User Profiles')).toBeVisible();

    await sys.getByText('OK', { exact: true }).click();
    await expect(sys).toBeHidden();
});

test('Create Shortcut makes a working .lnk that opens its target', async ({
    page,
}) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    // navigate into C: then into Experience (unique entry files live there)
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    await win.locator('.fs-item', { hasText: 'Experience' }).first().dblclick();
    await page.waitForTimeout(450);
    const entry = win.getByText('Printerpix — AI Engineer.txt');
    await expect(entry).toBeVisible();

    // right-click the entry file → Create Shortcut (lands beside it)
    await entry.click({ button: 'right' });
    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();
    await menu.getByText('Create Shortcut', { exact: true }).click();
    const shortcut = win.getByText('Shortcut to Printerpix — AI Engineer.lnk');
    await expect(shortcut).toBeVisible({ timeout: 15000 });

    // opening the shortcut opens the target file's detail window
    await shortcut.dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(detail.getByText('AI Engineer', { exact: true })).toBeVisible({
        timeout: 15000,
    });
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
