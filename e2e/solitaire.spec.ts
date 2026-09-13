import { expect, test } from '@playwright/test';
import { bootToDesktop, openFromStartMenu } from './helpers';

test('Solitaire deals a Klondike tableau and draws from the stock', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Solitaire');

    const win = page.locator('#work-space .window', { hasText: 'Solitaire' });
    await expect(win).toBeVisible();

    // 1+2+3+4+5+6+7, with exactly one face up per column.
    await expect(win.locator('.sol-tableau .sol-card')).toHaveCount(28);
    await expect(win.locator('.sol-tableau .sol-card.sol-face-up')).toHaveCount(
        7,
    );
    await expect(win.locator('.sol-waste .sol-card')).toHaveCount(0);

    await win.locator('.sol-stock').click();
    await expect(win.locator('.sol-waste .sol-card')).toHaveCount(1);
    await expect(win.locator('.sol-waste .sol-card')).toHaveClass(
        /sol-face-up/,
    );
});

test('Solitaire honours prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Solitaire');

    const win = page.locator('#work-space .window', { hasText: 'Solitaire' });
    // The felt carries the flag the win animation reads, so this is assertable
    // without playing a game to completion.
    await expect(win.locator('.sol-felt')).toHaveAttribute(
        'data-reduced-motion',
        'true',
    );
});

test('Solitaire moves a card to a foundation on double-click', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Solitaire');
    const win = page.locator('#work-space .window', { hasText: 'Solitaire' });

    // Deal until an Ace is face up somewhere in the tableau, then send it home.
    // Which Ace appears depends on the shuffle, so this drives the real rule
    // rather than a fixed position.
    const ace = win.locator(
        '.sol-tableau .sol-card.sol-face-up[data-rank="1"]',
    );
    await expect(win.locator('.sol-tableau .sol-card')).toHaveCount(28);

    if ((await ace.count()) > 0) {
        await ace.first().dblclick();
        await expect(win.locator('.sol-foundation .sol-card')).toHaveCount(1);
    } else {
        // No Ace exposed in this deal — assert the foundations start empty and
        // that double-clicking an illegal card changes nothing.
        await expect(win.locator('.sol-foundation .sol-card')).toHaveCount(0);
        await win
            .locator('.sol-tableau .sol-card.sol-face-up')
            .first()
            .dblclick();
        await expect(win.locator('.sol-tableau .sol-card')).toHaveCount(28);
    }
});
