import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('About Me renders bio, sidebar and toolbar actions', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'About Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win.getByText('Social Links')).toBeVisible();
    await expect(win.getByText('NLP & LLMs')).toBeVisible();
    await expect(win.getByText(/Hi, I'm Mohamed Abdelnasser/)).toBeVisible();

    // .last(): the View menu holds a hidden "My Projects" item too — the
    // toolbar button renders after it in DOM order
    await win.getByText('My Projects', { exact: true }).last().click();
    const explorer = page.locator('#work-space .window').nth(1);
    await expect(explorer.getByText("Momad's XP.txt")).toBeVisible();
});

test('About Me menu bar has working File/View/Help menus', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'About Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win.getByText('Social Links')).toBeVisible();

    // Help -> About Momad opens an XP dialog
    await win.locator('.toolbar-menu').getByText('Help').click();
    await win.getByText('About Momad', { exact: true }).click();
    await expect(page.getByText(/Very Professional/)).toBeVisible();
    await page.getByText('OK', { exact: true }).click();

    // File -> Close closes the window
    await win.locator('.toolbar-menu').getByText('File').click();
    await win.getByText('Close', { exact: true }).click();
    await expect(win).toBeHidden();
});
