import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

async function openIE(page: Page) {
    await bootToDesktop(page);
    await page
        .locator('#work-space p', { hasText: 'Internet Explorer' })
        .dblclick();
    const ie = page.locator('#work-space .window').first();
    await expect(ie).toBeVisible();
    // Wait for the address bar to carry its bound value. The <input> is in the
    // DOM before Svelte attaches its keydown handler, and under CI load typing
    // into that gap silently swallowed the Enter — the test then saw the
    // homepage URL and failed. This is a real readiness signal, not a sleep.
    await expect(ie.locator('input').first()).toHaveValue(/\S/);
    return ie;
}

test('an app page is readable, so the window title follows it', async ({
    page,
}) => {
    const ie = await openIE(page);
    await ie.getByText('Help', { exact: true }).click();
    await ie.getByText('Help and Support Center').click();

    // the title used to be stuck on the generic one because the sandbox made
    // even our OWN page opaque
    await expect(
        ie.getByText(/Help and Support Center — Momad's XP/),
    ).toBeVisible({ timeout: 15000 });
});

test('SECURITY: only app-owned pages get allow-same-origin', async ({
    page,
}) => {
    const ie = await openIE(page);
    const addr = ie.locator('input').first();
    const frame = ie.locator('iframe');

    // an external site must never be able to script our origin.
    // click before typing: fill() focuses without dispatching a click
    await addr.click();
    await addr.fill('https://example.com/');
    await addr.press('Enter');
    await page.waitForTimeout(1200);
    await expect(frame).not.toHaveAttribute('sandbox', /allow-same-origin/, {});

    // …while our own page may be read (that is what restores title/URL sync)
    await addr.click();
    await addr.fill('/help.html');
    await addr.press('Enter');
    await page.waitForTimeout(1200);
    await expect(frame).toHaveAttribute('sandbox', /allow-same-origin/);
});

test('View > Source opens the page markup in a Notepad window', async ({
    page,
}) => {
    const ie = await openIE(page);
    const addr = ie.locator('input').first();
    await addr.click();
    await addr.fill('/help.html');
    await addr.press('Enter');
    await page.waitForTimeout(1500);

    await ie.getByText('View', { exact: true }).click();
    await ie.getByText('Source', { exact: true }).click();

    // a Notepad-style window carrying the raw markup
    const notepad = page.locator('#work-space .window').last();
    await expect(notepad.getByText('Word Wrap')).toBeHidden(); // menu closed
    await expect(notepad).toContainText('<!doctype html', { timeout: 15000 });
    // …and none of the proxy's injected machinery
    await expect(notepad).not.toContainText('__momadxp');
});

test('the address bar and Create Shortcut follow chrome navigation', async ({
    page,
}) => {
    const ie = await openIE(page);
    const addr = ie.locator('input').first();
    await addr.click();
    await addr.fill('/help.html');
    await addr.press('Enter');
    await page.waitForTimeout(1200);
    await expect(addr).toHaveValue('/help.html');

    // Create Shortcut must target where we actually are, not the homepage
    await ie.getByText('File', { exact: true }).click();
    await ie.getByText('Create Shortcut', { exact: true }).click();
    await expect(ie.getByText(/created on the desktop/)).toBeVisible({
        timeout: 15000,
    });
    await expect(
        page.locator('#work-space p', { hasText: 'wiby' }),
    ).toHaveCount(0);
});
