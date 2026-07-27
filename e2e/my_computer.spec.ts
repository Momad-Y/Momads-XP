import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

async function openMyComputer(page: Page) {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    await expect(page.locator('#work-space .window').first()).toBeVisible();
}

/**
 * Enter a root folder and dismiss the inherited one-time "File Transfer"
 * guide dialog that mounts over the Explorer on first folder entry (each
 * test runs in a fresh browser context, so it appears every time).
 */
async function enterFolder(page: Page, name: string) {
    const win = page.locator('#work-space .window').first();
    await win.getByText(name, { exact: true }).dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    return win;
}

test('Explorer root lists the six portfolio folders', async ({ page }) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    for (const name of [
        'Experience',
        'Projects',
        'Education',
        'Skills',
        'Certifications',
        'Awards',
    ]) {
        await expect(win.getByText(name, { exact: true })).toBeVisible();
    }
});

test('root-view items highlight on selection', async ({ page }) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    const drive = win.getByText('Local Disk (C:)');
    await drive.click();
    await expect(drive).toHaveClass(/bg-blue-600/);
    const folder = win.getByText('Experience', { exact: true });
    await folder.click();
    await expect(folder).toHaveClass(/bg-blue-600/);
    await expect(drive).not.toHaveClass(/bg-blue-600/);
});

test('an experience entry opens a detail window with bullets', async ({
    page,
}) => {
    await openMyComputer(page);
    const win = await enterFolder(page, 'Experience');
    await win.getByText('Printerpix — AI Engineer.txt').dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(
        detail.getByText('AI Engineer', { exact: true }),
    ).toBeVisible();
    await expect(detail.getByText(/9 international markets/)).toBeVisible();
});

test('a project entry shows tech chips and link', async ({ page }) => {
    await openMyComputer(page);
    const win = await enterFolder(page, 'Projects');
    await win.getByText("Momad's XP.txt").dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(detail.getByText('SvelteKit', { exact: true })).toBeVisible();
    await expect(detail.getByText('Visit project')).toBeVisible();
});

test('an education entry shows honors', async ({ page }) => {
    await openMyComputer(page);
    const win = await enterFolder(page, 'Education');
    await win
        .getByText(/Arab Academy for Science.*\.txt/)
        .first()
        .dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(detail.getByText('Excellent with Honors')).toBeVisible();
});
