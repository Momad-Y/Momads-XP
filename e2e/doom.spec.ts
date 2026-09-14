import { expect, test } from '@playwright/test';
import {
    bootToDesktop,
    openFromStartMenu,
    watchForeignOrigins,
} from './helpers';

test('DOOM boots from a click and renders a frame @heavy', async ({ page }) => {
    test.setTimeout(180_000);
    const foreign = watchForeignOrigins(page);

    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'DOOM');
    const win = page.locator('#work-space .window', { hasText: 'DOOM' });

    // Nothing downloads or starts until the gesture: the AudioContext must be
    // constructed inside a click handler or it starts suspended and plays
    // silently, and ~4MB of emulator and game should not load on window open.
    await expect(win.locator('.doom-start')).toBeVisible();
    await win.locator('.doom-start').click();

    const canvas = win.locator('canvas.doom-screen');
    await expect(canvas).toBeVisible({ timeout: 120_000 });

    /*
     * PROOF THE EMULATOR IS RUNNING, not merely that something painted once.
     *
     * The canvas is transferred to the worker, so `getContext` is unavailable
     * on this thread and pixels cannot be sampled. Two screenshots a moment
     * apart is the stronger assertion anyway: DOOM's title screen plays a demo
     * loop, so a live emulator produces different bytes while a dead black
     * canvas produces identical ones.
     */
    await expect
        .poll(
            async () => {
                const first = await canvas.screenshot();
                await page.waitForTimeout(1200);
                const second = await canvas.screenshot();
                return Buffer.compare(first, second) !== 0;
            },
            { timeout: 120_000 },
        )
        .toBe(true);

    // Self-hosted: the emulator layer must not reach for js-dos.com or
    // dos.zone. This is why the cloud UI layer is deliberately not vendored.
    expect(foreign).toEqual([]);
});

test('DOOM keeps Escape away from the desktop @heavy', async ({ page }) => {
    /*
     * ESCAPE, not the arrow keys.
     *
     * The first version pressed ArrowUp and Space and asserted the Start menu
     * stayed open — which it always would: `start_menu.svelte`'s keydown
     * handler begins `if (event.key !== 'Escape') return;`, so arrows could
     * never have closed it. Deleting `stopPropagation` from the component left
     * that test green. Escape is the one key where the desktop and the game
     * genuinely compete, so it is the only one worth asserting.
     */
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'DOOM');
    const win = page.locator('#work-space .window', { hasText: 'DOOM' });
    await win.locator('.doom-start').click();

    const canvas = win.locator('canvas.doom-screen');
    await expect(canvas).toBeVisible({ timeout: 120_000 });
    await canvas.click();

    // Open the Start menu, then press Escape INTO the focused game.
    await page.locator('#start-menu-btn').click();
    await expect(page.locator('#start-menu')).toBeVisible();
    await canvas.press('Escape');
    await expect(
        page.locator('#start-menu'),
        'Escape leaked out of the game and closed the Start menu',
    ).toBeVisible();

    // …and the desktop's own Escape still works once no game holds focus.
    await canvas.evaluate((el: HTMLCanvasElement) => {
        el.blur();
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('#start-menu')).toBeHidden();
});

test('minimizing DOOM stops the emulator, restoring restarts it @heavy', async ({
    page,
}) => {
    /*
     * Asserts the EMULATOR stopped, not that a flag flipped.
     *
     * The previous version checked only `data-paused`, which mirrors the bound
     * `minimized` prop — replacing the whole body of `sync_running()` with a
     * no-op left it green. Pixels cannot settle it either: the canvas is
     * transferred to the worker so it cannot be read back, and a minimized
     * window screenshots blank (526 bytes against ~92KB visible).
     *
     * Audio is the one signal a running emulator sends the main thread. If the
     * buffer count stops advancing while minimized and resumes afterwards, the
     * emulator really stopped.
     */
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'DOOM');
    const win = page.locator('#work-space .window', { hasText: 'DOOM' });
    await win.locator('.doom-start').click();
    await expect(win.locator('canvas.doom-screen')).toBeVisible({
        timeout: 120_000,
    });

    const shell = win.locator('[data-audio-ticks]');
    const ticks = async (): Promise<number> =>
        Number((await shell.getAttribute('data-audio-ticks')) ?? '0');

    // The emulator must be producing audio at all, or the rest proves nothing.
    await expect.poll(ticks, { timeout: 60_000 }).toBeGreaterThan(0);
    const running_before = await ticks();
    await page.waitForTimeout(1500);
    expect(
        await ticks(),
        'the emulator produced no audio while running — this test cannot measure anything',
    ).toBeGreaterThan(running_before);

    await win.locator('.titlebar').getByRole('button').first().click();
    await expect(shell).toHaveAttribute('data-paused', 'true');
    await page.waitForTimeout(1200); // let any in-flight buffers land
    const paused_at = await ticks();
    await page.waitForTimeout(2500);
    expect(
        await ticks(),
        'the emulator kept producing audio while minimized — it was not paused',
    ).toBe(paused_at);

    await page.locator('.program-tile').filter({ hasText: 'DOOM' }).click();
    await expect(shell).toHaveAttribute('data-paused', 'false');
    await expect.poll(ticks, { timeout: 30_000 }).toBeGreaterThan(paused_at);
});
