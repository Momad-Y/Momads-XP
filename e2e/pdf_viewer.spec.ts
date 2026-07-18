import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('My CV opens the PDF viewer and renders a page', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My CV' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();
    await expect(win.locator('canvas').first()).toBeVisible({
        timeout: 15000,
    });
    await expect(win.getByText(/page/)).toBeVisible();
});
