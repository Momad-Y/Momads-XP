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
    // the address bar must show where we ASKED to go — asserting "some .txt
    // is visible" passed for a handler that ignored the typed path entirely
    await expect(addr).toHaveValue(/Projects$/, { timeout: 15000 });
});

test('Go on an unresolvable path leaves you where you were', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    const addr = win.locator('input').first();

    // navigate somewhere real FIRST, so "nothing happened" has something to
    // be measured against. Asserting the root's own text proved nothing: it
    // was already on screen before the click, and did not even wait.
    await addr.click();
    await addr.fill('C:\\Experience');
    await win.getByRole('button', { name: 'Go' }).click();
    const guide = win.locator('.dialog').getByText('OK');
    await expect(guide).toBeVisible({ timeout: 15000 });
    await guide.click();
    await expect(win.getByText('Printerpix — AI Engineer.txt')).toBeVisible({
        timeout: 15000,
    });

    await addr.click();
    await addr.fill('C:\\NoSuchFolder');
    await win.getByRole('button', { name: 'Go' }).click();

    // still in Experience — no navigation, no crash, no jump to the root
    await expect(win.getByText('Printerpix — AI Engineer.txt')).toBeVisible();
    await expect(win.getByText('Files Stored on This Computer')).toBeHidden();
});
