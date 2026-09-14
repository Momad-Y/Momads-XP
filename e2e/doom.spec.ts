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

test('DOOM hands the emulator the key codes js-dos expects @heavy', async ({
    page,
}) => {
    /*
     * THE TEST THAT WAS MISSING, and the reason DOOM shipped unplayable.
     *
     * `keymap.ts` spoke DOS set-1 scancodes (Escape = 1, ArrowUp = 328) while
     * js-dos 8.4.1 wants its own `KBD_KEYS` enum, which is GLFW's numbering
     * (Escape = 256, ArrowUp = 265). js-dos drops a code it does not know
     * WITHOUT ERROR, so the emulator booted, ran its attract demo, produced
     * audio, painted frames — and ignored every key. Every DOOM test passed.
     *
     * Nothing observable on this thread could have caught it: the canvas is
     * transferred to the worker so pixels cannot be read back, screenshots of
     * the demo differ whether or not input works, and the Escape-isolation
     * test below only proves the key did NOT reach the desktop.
     *
     * So this asserts at the one boundary that matters — the exact number
     * handed to `sendKeyEvent` — by wrapping js-dos before the app loads it.
     * The wrapper lives entirely in the test; nothing test-only ships.
     */
    test.setTimeout(180_000);

    await page.addInitScript(() => {
        const recorded = [];
        window.__doom_keys = recorded;

        // `emulators.js` assigns `window.emulators`; intercept the assignment
        // so the command interface can be wrapped the moment it is created.
        let value;
        Object.defineProperty(window, 'emulators', {
            configurable: true,
            get: () => value,
            set: (assigned) => {
                value = assigned;
                if (typeof assigned?.dosboxWorker !== 'function') return;
                const original = assigned.dosboxWorker.bind(assigned);
                assigned.dosboxWorker = async (...args) => {
                    const ci = await original(...args);
                    const send = ci.sendKeyEvent.bind(ci);
                    ci.sendKeyEvent = (code, pressed) => {
                        recorded.push([code, pressed]);
                        send(code, pressed);
                    };
                    return ci;
                };
            },
        });
    });

    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'DOOM');
    const win = page.locator('#work-space .window', { hasText: 'DOOM' });
    await win.locator('.doom-start').click();

    const canvas = win.locator('canvas.doom-screen');
    await expect(canvas).toBeVisible({ timeout: 120_000 });
    await canvas.click();

    const sent = async (): Promise<[number, boolean][]> =>
        page.evaluate(() => window.__doom_keys ?? []);

    // Escape is the key that gets a visitor out of the attract demo and into
    // the menu. If this one number is wrong, DOOM is a video.
    await canvas.press('Escape');
    await expect
        .poll(async () => (await sent()).some(([c, p]) => c === 256 && p))
        .toBe(true);

    // The rest of what the on-screen hint promises.
    for (const [key, code] of [
        ['ArrowUp', 265],
        ['ArrowDown', 264],
        ['ArrowLeft', 263],
        ['ArrowRight', 262],
        ['Control', 341],
        [' ', 32],
        ['Enter', 257],
    ] as [string, number][]) {
        await canvas.press(key);
        const codes = (await sent()).map(([c]) => c);
        expect(codes, `${key} was not forwarded as ${String(code)}`).toContain(
            code,
        );
    }

    // A key DOOM has no use for must not be forwarded at all. The keymap
    // returns 0 for it and the adapter drops it before reaching js-dos.
    const before = (await sent()).length;
    await canvas.press('ContextMenu');
    expect((await sent()).length).toBe(before);
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

test('the DOOM screen stays inside its window when maximized @heavy', async ({
    page,
}) => {
    /*
     * @heavy because it MUST start the emulator, and the first draft of this
     * test did not — which made it useless.
     *
     * A canvas nobody has drawn on has the default 300x150 intrinsic size, so
     * at 1280px wide its implied height is 640px and it fits a maximized
     * window comfortably. Only once js-dos hands the worker the canvas and
     * DOSBox settles on 320x200 does the implied height become 800px, against
     * 714px of room. The cheap version of this test maximized an unstarted
     * DOOM, measured zero spill, and passed against the broken layout.
     *
     * The bug: a canvas is a replaced element with an intrinsic aspect ratio,
     * and a flex item defaults to `min-height: auto`, so the canvas box would
     * not shrink below the height that ratio implied. DOOM's status bar — the
     * ammo, health and armour readouts — rendered past the bottom of the
     * window and behind the taskbar. Audio kept flowing and frames kept
     * changing, so every other DOOM test stayed green.
     */
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'DOOM');
    const win = page.locator('#work-space .window', { hasText: 'DOOM' });
    await win.locator('.doom-start').click();

    const canvas = win.locator('canvas.doom-screen');
    await expect(canvas).toBeVisible({ timeout: 120_000 });
    // Wait for DOSBox to settle on its own resolution: that is what gives the
    // canvas the intrinsic ratio this test is about.
    await expect
        .poll(
            async () =>
                canvas.evaluate((el: HTMLCanvasElement) => el.width === 320),
            { timeout: 120_000 },
        )
        .toBe(true);

    const spill = async (): Promise<{ bottom: number; right: number }> =>
        win.evaluate((el: HTMLElement) => {
            const screen = el.querySelector('canvas.doom-screen');
            if (screen == null) throw new Error('doom canvas missing');
            const frame = el.getBoundingClientRect();
            const box = screen.getBoundingClientRect();
            return {
                bottom: Math.round(box.bottom - frame.bottom),
                right: Math.round(box.right - frame.right),
            };
        });

    expect(
        await spill(),
        'the screen spills out of the window as opened',
    ).toEqual({ bottom: 0, right: 0 });

    await win
        .locator('.titlebar button:has(img[src*="Maximize"])')
        .first()
        .click();
    await expect
        .poll(async () => (await win.boundingBox())?.width ?? 0)
        .toBeGreaterThan(1000);

    expect(
        await spill(),
        'the screen spills out of the maximized window',
    ).toEqual({ bottom: 0, right: 0 });
});
