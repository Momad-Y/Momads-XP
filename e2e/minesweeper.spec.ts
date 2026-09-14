import { expect, test } from '@playwright/test';
import { bootToDesktop, openFromStartMenu } from './helpers';
import {
    CELL_PX,
    FRAME_W,
    PRESETS,
} from '../src/lib/games/minesweeper/difficulty';

const width_of = (cols: number): number => cols * CELL_PX + FRAME_W;

test('Minesweeper opens, flags with the right button and reveals with the left', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Minesweeper');

    const win = page.locator('#work-space .window', { hasText: 'Minesweeper' });
    await expect(win).toBeVisible();
    await expect(win.locator('.ms-cell')).toHaveCount(81); // Beginner 9x9
    await expect(win.locator('.ms-mine-count')).toHaveText('010');

    await win.locator('.ms-cell').first().click({ button: 'right' });
    await expect(win.locator('.ms-mine-count')).toHaveText('009');
    await expect(win.locator('.ms-cell').first()).toHaveClass(/ms-flagged/);

    // A flagged cell must not open — that is what the flag is for.
    await win.locator('.ms-cell').first().click();
    await expect(win.locator('.ms-cell').first()).toHaveClass(/ms-flagged/);

    await win.locator('.ms-cell').nth(40).click();
    await expect(win.locator('.ms-cell.ms-revealed').first()).toBeVisible();
});

test('Minesweeper sizes its window to the board, and resizes for Expert', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Minesweeper');
    const win = page.locator('#work-space .window', { hasText: 'Minesweeper' });

    /*
     * Assert the ACTUAL width, not merely "bigger than before".
     *
     * A registry app that never receives a width shrink-wraps its content, and
     * a shrink-wrapped Beginner board is narrower than a correct Expert one —
     * so an `after > before` comparison passes while the sizing is broken.
     * That is precisely the bug this test exists to catch, and the reason
     * `app_registry.ts`'s minesweeper row carries `default_size`.
     */
    await expect
        .poll(async () => Math.round((await win.boundingBox())?.width ?? 0))
        .toBe(width_of(PRESETS.beginner.cols));

    await win.getByText('Game', { exact: true }).click();
    await win.locator('.xp-menu-dropdown').getByText('Expert').click();

    await expect(win.locator('.ms-cell')).toHaveCount(480); // 30x16
    await expect
        .poll(async () => Math.round((await win.boundingBox())?.width ?? 0))
        .toBe(width_of(PRESETS.expert.cols));
});
