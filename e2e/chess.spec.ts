import { expect, test } from '@playwright/test';
import {
    bootToDesktop,
    openFromStartMenu,
    watchForeignOrigins,
} from './helpers';

test('Chess opens with a full board and enforces legality', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Chess');
    const win = page.locator('#work-space .window', { hasText: 'Chess' });

    await expect(win).toBeVisible();
    await expect(win.locator('.chess-square')).toHaveCount(64);
    await expect(win.locator('.chess-piece')).toHaveCount(32);

    // Two-player mode: no engine, so the board is testable on its own and this
    // spec stays out of the serial `heavy` project.
    await win.getByLabel('Opponent').selectOption('two-player');

    await win.locator('[data-square="e2"]').click();
    await win.locator('[data-square="e5"]').click(); // illegal: pawns go 1 or 2
    await expect(win.locator('[data-square="e2"] .chess-piece')).toHaveCount(1);
    await expect(win.locator('[data-square="e5"] .chess-piece')).toHaveCount(0);

    await win.locator('[data-square="e2"]').click();
    await win.locator('[data-square="e4"]').click(); // legal
    await expect(win.locator('[data-square="e4"] .chess-piece')).toHaveCount(1);
    await expect(win.locator('[data-square="e2"] .chess-piece')).toHaveCount(0);
    await expect(win.locator('.chess-history li')).toHaveCount(1);
});

test('Chess gets a reply from the engine @heavy', async ({ page }) => {
    test.setTimeout(120_000);
    const foreign = watchForeignOrigins(page);

    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Chess');
    const win = page.locator('#work-space .window', { hasText: 'Chess' });

    await expect(win.locator('.chess-status')).toHaveText(/your move/i, {
        timeout: 60_000,
    });

    await win.locator('[data-square="e2"]').click();
    await win.locator('[data-square="e4"]').click();

    // Two entries: the player's move and the engine's reply. Asserting on the
    // move list rather than piece counts, which do not change on a quiet move.
    await expect(win.locator('.chess-history li')).toHaveCount(2, {
        timeout: 60_000,
    });

    // Self-hosted: the engine must not reach for a CDN.
    expect(foreign).toEqual([]);
});
