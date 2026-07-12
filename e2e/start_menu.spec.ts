import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('start menu matches the §3.4 structure', async ({ page }) => {
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
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();

    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    for (const label of [
        'My Computer',
        'About Me',
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
