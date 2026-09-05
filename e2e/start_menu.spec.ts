import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';
import { stubBrowse } from './stub_browse';

test('start menu matches the §3.4 structure', async ({ page }) => {
    await stubBrowse(page);
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    const menu = page.locator('#start-menu');
    await expect(menu).toBeVisible();

    // identity header
    await expect(menu.getByText('Mohamed Abdelnasser')).toBeVisible();
    // pinned column
    await expect(menu.getByText('Internet Explorer')).toBeVisible();
    await expect(menu.getByText('Contact Me').first()).toBeVisible();
    // right column
    await expect(menu.getByText('My Computer').first()).toBeVisible();
    await expect(menu.getByText('My CV')).toBeVisible();
    await expect(menu.getByText('About Me').first()).toBeVisible();

    // socials are real external links (new tab + noopener)
    const github = menu.locator('a[href="https://github.com/Momad-Y"]');
    await expect(github).toBeVisible();
    await expect(github).toHaveAttribute('target', '_blank');
    await expect(github).toHaveAttribute('rel', /noopener/);
    await expect(
        menu.locator(
            'a[href="https://www.linkedin.com/in/mohamed-y-abdelnasser/"]',
        ),
    ).toBeVisible();
    await expect(
        menu.locator('a[href="https://instagram.com/7.zsjj"]'),
    ).toBeVisible();

    // gone per design decision 7
    await expect(menu.getByText('Log Off')).toHaveCount(0);
    await expect(menu.getByText('Display Properties')).toHaveCount(0);
    await expect(menu.getByText('Search')).toHaveCount(0);
});

test('All Programs flyout lists the programs and the Games flyout', async ({
    page,
}) => {
    await stubBrowse(page);
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();

    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    for (const label of [
        'My Computer',
        'About Me',
        'My CV',
        'Internet Explorer',
        'Contact Me',
        'Command Prompt',
        'Python',
        'Paint',
        'Music Player',
        'Games',
    ]) {
        await expect(flyout.getByText(label)).toBeVisible();
    }

    // Games level-2 flyout (opens after the 180ms hover delay)
    await flyout.getByText('Games').hover();
    for (const game of ['Minesweeper', 'Solitaire', 'Chess', 'DOOM']) {
        await expect(flyout.getByText(game)).toBeVisible();
    }
});

// My CV carries no fs_item (the viewer falls back to profile.meta.resumePdf);
// a partial one would throw in full_vfs_item, so launching it is the assertion
// that matters — visibility in the flyout alone would not catch that.
test('All Programs launches My CV', async ({ page }) => {
    await stubBrowse(page);
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    await page.locator('#all-programs-flyout').getByText('My CV').click();

    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();
    await expect(win.locator('canvas').first()).toBeVisible({
        timeout: 15000,
    });
});

test('All Programs launches Contact Me', async ({ page }) => {
    await stubBrowse(page);
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    await page.locator('#all-programs-flyout').getByText('Contact Me').click();

    await expect(
        page.locator('#work-space .window', { hasText: 'Contact Me' }),
    ).toBeVisible();
});
