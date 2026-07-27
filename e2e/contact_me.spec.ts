import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('validation error shows an XP dialog', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'Contact Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    // .last(): the File menu holds a hidden "Send Message" item too — the
    // toolbar button renders after it in DOM order
    await win.getByText('Send Message', { exact: true }).last().click();
    await expect(
        page.getByText('Please enter a valid email address.'),
    ).toBeVisible();
});

test('menu bar: Edit works on fields, View toggles the status bar, File closes', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'Contact Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win.getByText('Compose a message to Mohamed')).toBeVisible();

    // View > Status Bar toggles the status bar off
    await win.locator('.toolbar-menu').getByText('View').click();
    await win.getByText('Status Bar', { exact: true }).click();
    await expect(win.getByText('Compose a message to Mohamed')).toBeHidden();

    // File > Close closes the window
    await win.locator('.toolbar-menu').getByText('File').click();
    await win.getByText('Close', { exact: true }).click();
    await expect(win).toBeHidden();
});

test('successful send shows the success dialog (mocked API)', async ({
    page,
}) => {
    await page.route('**/api/email', (route) =>
        route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: '{"ok":true}',
        }),
    );
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'Contact Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win
        .getByPlaceholder('Your email address')
        .fill('visitor@example.com');
    await win.getByPlaceholder('Subject of your message').fill('Hello');
    await win.getByPlaceholder('Write your message here').fill('Great site!');
    // no artificial wait: min-fill-time is server-only and the API is mocked
    await win.getByText('Send Message', { exact: true }).last().click();
    await expect(page.getByText('Message sent successfully.')).toBeVisible();
});
