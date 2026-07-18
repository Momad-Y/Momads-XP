import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('About Me renders bio, sidebar and toolbar actions', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'About Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win.getByText('Social Links')).toBeVisible();
    await expect(win.getByText('NLP & LLMs')).toBeVisible();
    await expect(win.getByText(/Hi, I'm Mohamed Abdelnasser/)).toBeVisible();

    await win.getByText('My Projects').click();
    const explorer = page.locator('#work-space .window').nth(1);
    await expect(explorer.getByText("Momad's XP.txt")).toBeVisible();
});
