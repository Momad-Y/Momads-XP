import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';
import { readFileSync } from 'node:fs';

/*
 * Read, not imported: Playwright's loader needs an import attribute for JSON
 * that Vite supplies inside the app but the test runner does not. Content is
 * still sourced from profile.json rather than spelled here, so rewriting a CV
 * does not turn into a red E2E.
 */
const profile = JSON.parse(
    readFileSync('src/lib/data/profile.json', 'utf8'),
) as { skills: Record<string, string[]>; about: { bio: string[] } };

test('About Me renders bio, sidebar and toolbar actions', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'About Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win.getByText('Social Links')).toBeVisible();
    // a skill group and the bio opener — both are content, so they are read
    // from profile rather than spelled, or a CV update breaks the suite
    await expect(
        win.getByText(Object.keys(profile.skills)[0] ?? ''),
    ).toBeVisible();
    await expect(
        win.getByText(String(profile.about.bio[0]).slice(0, 40), {
            exact: false,
        }),
    ).toBeVisible();

    // .last(): the View menu holds a hidden "My Projects" item too — the
    // toolbar button renders after it in DOM order
    await win.getByText('My Projects', { exact: true }).last().click();
    const explorer = page.locator('#work-space .window').nth(1);
    await expect(explorer.getByText("Momad's XP.txt")).toBeVisible();
});

test('Skills categories expand and collapse', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'About Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    // group name and its first two skills come from profile.json, so the
    // expand/collapse behaviour is what is asserted, not the CV's wording
    const [group, skills] = Object.entries(profile.skills)[0] ?? ['', []];
    const [first, second] = skills;
    await expect(win.getByText(group)).toBeVisible();
    await expect(win.getByText(String(first), { exact: true })).toBeHidden();

    await win.getByText(group).click();
    await expect(win.getByText(String(first), { exact: true })).toBeVisible();
    await expect(win.getByText(String(second), { exact: true })).toBeVisible();

    await win.getByText(group).click();
    await expect(win.getByText(String(first), { exact: true })).toBeHidden();
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
