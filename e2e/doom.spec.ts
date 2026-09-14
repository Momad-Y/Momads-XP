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

test('DOOM keeps its keys away from the desktop @heavy', async ({ page }) => {
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'DOOM');
    const win = page.locator('#work-space .window', { hasText: 'DOOM' });
    await win.locator('.doom-start').click();

    const canvas = win.locator('canvas.doom-screen');
    await expect(canvas).toBeVisible({ timeout: 120_000 });
    await canvas.click();

    /*
     * Real selectors: the button is `#start-menu-btn` and the menu is the id
     * `#start-menu`, as start_menu.spec.ts uses them.
     *
     * Arrow keys rather than Escape: clicking the canvas already closes the
     * Start menu by click-outside, so an Escape press afterwards would prove
     * nothing. Movement keys are what must not leak, and they leave the menu
     * open — while the canvas holds focus.
     */
    await page.locator('#start-menu-btn').click();
    await expect(page.locator('#start-menu')).toBeVisible();

    await canvas.press('ArrowUp');
    await canvas.press('Space');
    await expect(page.locator('#start-menu')).toBeVisible();

    /*
     * …and the desktop's own Escape still works once the game does NOT hold
     * focus. Blurring explicitly rather than clicking something: while the
     * canvas is focused, swallowing Escape is the correct behaviour, so a
     * press here without the blur would assert the opposite of the design.
     */
    await canvas.evaluate((el: HTMLCanvasElement) => {
        el.blur();
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('#start-menu')).toBeHidden();
});

test('minimizing DOOM pauses it, restoring resumes it @heavy', async ({
    page,
}) => {
    /*
     * Guards the wiring: minimizing must reach the emulator, and restoring
     * must let it go again. A minimized DOOM that keeps running burns a core
     * for a window nobody can see.
     *
     * THE ASSERTION IS ON STATE, NOT PIXELS, and that is not laziness.
     * Screenshots cannot answer this: a minimized window is hidden, so its
     * canvas shots come back essentially blank (526 bytes against 91,889 while
     * visible), and comparing across a restore fails too because `resume()`
     * fires first and DOOM runs at ~35fps. Both probes were tried; both
     * measure the window's visibility rather than the emulator's state.
     *
     * That the emulator honours pause/resume is unit-tested against a fake in
     * `dosbox_adapter.test.ts`. This covers the half that lives in the
     * component, which would break silently if `accessors` ever left
     * Window.svelte.
     */
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'DOOM');
    const win = page.locator('#work-space .window', { hasText: 'DOOM' });
    await win.locator('.doom-start').click();
    await expect(win.locator('canvas.doom-screen')).toBeVisible({
        timeout: 120_000,
    });

    const shell = win.locator('[data-paused]');
    await expect(shell).toHaveAttribute('data-paused', 'false');

    await win.locator('.titlebar').getByRole('button').first().click();
    await expect(shell).toHaveAttribute('data-paused', 'true');

    await page.locator('.program-tile').filter({ hasText: 'DOOM' }).click();
    await expect(shell).toHaveAttribute('data-paused', 'false');
});
