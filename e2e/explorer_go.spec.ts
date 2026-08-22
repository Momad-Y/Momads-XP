import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * Explorer's address-bar Go arrow was a bare <div> with no click handler and
 * no keyboard path — only Enter navigated. A visibly live control that does
 * nothing is exactly the class of defect the View-menu work existed to remove,
 * and the toolbar audit walked past it because it LOOKS like a button.
 */

test('the address bar Go arrow navigates, like Enter does', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    const addr = win.locator('input').first();

    await addr.click();
    await addr.fill('C:\\Experience');
    await win.getByRole('button', { name: 'Go' }).click();

    // the one-time transfer guide appears on first folder entry
    const guide = win.locator('.dialog').getByText('OK');
    await expect(guide).toBeVisible({ timeout: 15000 });
    await guide.click();

    await expect(win.getByText('Printerpix — AI Engineer.txt')).toBeVisible({
        timeout: 15000,
    });
});

test('Go is reachable by keyboard, not just the mouse', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    const addr = win.locator('input').first();

    await addr.click();
    await addr.fill('C:\\Projects');
    // a <div> could never take focus; a real <button> can
    const go = win.getByRole('button', { name: 'Go' });
    await go.focus();
    await expect(go).toBeFocused();
    await page.keyboard.press('Enter');

    const guide = win.locator('.dialog').getByText('OK');
    await expect(guide).toBeVisible({ timeout: 15000 });
    await guide.click();
    await expect(win.getByText(/\.txt$/).first()).toBeVisible({
        timeout: 15000,
    });
});

test('Go on an unresolvable path does nothing, exactly like Enter', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    const addr = win.locator('input').first();

    await addr.click();
    await addr.fill('C:\\NoSuchFolder');
    await win.getByRole('button', { name: 'Go' }).click();

    // still at the root — no navigation, no crash
    await expect(win.getByText('Files Stored on This Computer')).toBeVisible();
});
