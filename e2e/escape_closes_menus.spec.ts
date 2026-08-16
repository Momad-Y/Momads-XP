import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('esc: start menu', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    await expect(page.locator('#start-menu')).not.toHaveClass(/hidden/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#start-menu')).toHaveClass(/hidden/);
});

test('esc: context menu', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space').click({ button: 'right' });
    const ctx = page.locator('.context-menu');
    await expect(ctx).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ctx).toBeHidden();
});

test('esc: menu bar dropdown', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win.locator('.toolbar-menu').getByText('File').click();
    const row = win.locator('p', { hasText: /^Close$/ }).first();
    await expect(row).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(row).toBeHidden();
});

test('esc: Views toolbar dropdown', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    // Enter a real folder first: the Views button is greyed at the My Computer
    // root, where the fixed layout ignores view modes.
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    await win.locator('[tooltip="Views"]').first().click();
    // the toolbar dropdown, not the View menu-bar entry of the same name
    const opt = win.locator('.z-30').getByText('Thumbnails', { exact: true });
    await expect(opt).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opt).toBeHidden();
});
