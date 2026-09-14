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

test('the Minesweeper board fits inside its own window', async ({ page }) => {
    /*
     * INDEPENDENT OF FRAME_W / FRAME_H, and that is the whole point.
     *
     * The sizing test below asserts `width === cols * CELL_PX + FRAME_W`,
     * deriving the expected value from the very constant it is meant to
     * check — so it passed while both constants were far too small and the
     * board visibly overflowed: the bottom rows of a Beginner game rendered
     * below the window frame, a scrollbar appeared, and that scrollbar then
     * clipped the right-hand column.
     *
     * This asserts the property a player can see instead: nothing scrolls,
     * nothing is cut off, at every difficulty.
     */
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Minesweeper');
    const win = page.locator('#work-space .window', { hasText: 'Minesweeper' });
    await expect(win).toBeVisible();

    const fits = async (): Promise<{
        content_overflow_y: number;
        content_overflow_x: number;
        grid_clipped_x: number;
        grid_clipped_y: number;
        grid_below_window: number;
    }> =>
        win.evaluate((el: HTMLElement) => {
            const content = el.querySelector('[slot="content"]');
            const grid = el.querySelector('.ms-grid');
            if (content == null || grid == null) {
                throw new Error('minesweeper content or grid missing');
            }
            const window_box = el.getBoundingClientRect();
            const grid_box = grid.getBoundingClientRect();
            return {
                content_overflow_y: content.scrollHeight - content.clientHeight,
                content_overflow_x: content.scrollWidth - content.clientWidth,
                grid_clipped_x: grid.scrollWidth - grid.clientWidth,
                grid_clipped_y: grid.scrollHeight - grid.clientHeight,
                grid_below_window: Math.round(
                    grid_box.bottom - window_box.bottom,
                ),
            };
        });

    for (const level of ['Beginner', 'Intermediate', 'Expert']) {
        await win.getByText('Game', { exact: true }).click();
        await win.locator('.xp-menu-dropdown').getByText(level).click();
        await expect
            .poll(async () => (await fits()).grid_clipped_x, { timeout: 8000 })
            .toBe(0);
        const m = await fits();
        const where = `${level} ${JSON.stringify(m)}`;

        // Clipping is strict: a cut-off row or column is always a bug.
        expect(m.grid_clipped_x, `${where}: columns cut off`).toBe(0);
        expect(m.grid_clipped_y, `${where}: rows cut off`).toBe(0);
        expect(
            m.grid_below_window,
            `${where}: grid hangs below the window`,
        ).toBeLessThanOrEqual(0);

        /*
         * The container gets 1px of slack, and only 1px.
         *
         * Several heights here are fractional — the menu bar is 24.5px, the
         * sunken panel 217.5px — so `scrollHeight` rounds up and can sit one
         * pixel above `clientHeight` while everything is visibly in place.
         * The bug this test was written for was 62px of overflow with 10px of
         * columns cut off, so a 1px allowance costs nothing: reverting
         * FRAME_W/FRAME_H to their old values fails every assertion above as
         * well as this one.
         */
        expect(
            m.content_overflow_y,
            `${where}: content scrolls`,
        ).toBeLessThanOrEqual(1);
        expect(
            m.content_overflow_x,
            `${where}: content scrolls sideways`,
        ).toBeLessThanOrEqual(1);
    }
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
