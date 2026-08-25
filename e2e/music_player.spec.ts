import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * The Music Player (SPECIFICATION.md §3.2) and the two shipped surfaces the
 * bundled tracks light up for the first time.
 *
 * NOTE ON WHAT CI CANNOT SEE: headless Chromium ignores the autoplay policy —
 * `new AudioContext().state` is "running" without a gesture — so a regression
 * that moved context creation back to onMount would pass here and fail for
 * every real visitor. That check is a manual deploy-probe line in
 * docs/phase-3-guide.md, stated rather than pretended.
 */

/**
 * Open My Computer, step into My Music, and dismiss the inherited one-time
 * "File Transfer" guide that Explorer shows on first folder entry (a
 * documented trap in CLAUDE.md — without this every folder test hangs on an
 * invisible modal).
 */
async function openMyMusic(page: Page) {
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible({ timeout: 15_000 });
    await win.getByText('My Music', { exact: true }).first().dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    return win;
}

async function openPlayer(page: Page) {
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    await flyout.getByText('Music Player', { exact: true }).click();
    await expect(page.getByTestId('play-pause')).toBeVisible({
        timeout: 15_000,
    });
}

test('opens with the bundled track list', async ({ page }) => {
    await bootToDesktop(page);
    await openPlayer(page);

    const rows = page.getByTestId('track-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Ascent');
    await expect(rows.nth(1)).toContainText('Pulse');
    await expect(rows.nth(2)).toContainText('Drift');
});

test('play, pause and play again — the createMediaElementSource trap', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openPlayer(page);

    const button = page.getByTestId('play-pause');
    await button.click();
    await expect.poll(async () => button.textContent()).toBe('⏸');

    await button.click();
    await expect.poll(async () => button.textContent()).toBe('▶');

    // THE THIRD CLICK IS THE POINT. createMediaElementSource() is a permanent
    // one-shot binding on the ELEMENT, so a naive implementation throws
    // InvalidStateError here — even from a different AudioContext. The
    // WeakMap cache in player.ts is what makes this survive.
    await button.click();
    await expect.poll(async () => button.textContent()).toBe('⏸');

    const audio = page.locator('audio');
    await expect
        .poll(async () => audio.evaluate((el: HTMLAudioElement) => el.paused))
        .toBe(false);
});

test('next and previous wrap around the playlist', async ({ page }) => {
    await bootToDesktop(page);
    await openPlayer(page);

    const src = async () =>
        page.locator('audio').evaluate((el: HTMLAudioElement) => el.src);

    expect(await src()).toContain('ascent.mp3');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect.poll(src).toContain('pulse.mp3');

    // Backwards past the first track must wrap to the last, not stall at 0.
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect.poll(src).toContain('ascent.mp3');
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect.poll(src).toContain('drift.mp3');
});

test('clicking a track row switches to it', async ({ page }) => {
    await bootToDesktop(page);
    await openPlayer(page);

    await page.getByTestId('track-row').nth(2).click();
    await expect
        .poll(async () =>
            page.locator('audio').evaluate((el: HTMLAudioElement) => el.src),
        )
        .toContain('drift.mp3');
});

test('the volume slider drives the element, multiplied by the tray volume', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openPlayer(page);

    await page.getByTestId('volume').fill('0.5');
    await expect
        .poll(async () =>
            page.locator('audio').evaluate((el: HTMLAudioElement) => el.volume),
        )
        .toBeLessThanOrEqual(0.5);
});

test('is a singleton — it owns the audio output', async ({ page }) => {
    await bootToDesktop(page);
    await openPlayer(page);
    await expect(page.locator('#work-space .window')).toHaveCount(1);

    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    await page
        .locator('#all-programs-flyout')
        .getByText('Music Player', { exact: true })
        .click();
    await expect(page.locator('#work-space .window')).toHaveCount(1);
});

test('Details shows KB while the status bar shows MB — in ONE window', async ({
    page,
}) => {
    // session-handoff.md §8 rule 1: XP's Details Size column is ALWAYS KB with
    // separators, while the status bar picks a unit. They are two DIFFERENT
    // rules, not two drifted copies of one — unifying them re-spells five
    // shipped Desktop items.
    //
    // §8 recorded this as a deliberate coverage gap because no VISIBLE folder
    // held more than 1 MB. The bundled tracks total 1123 KB, so it is finally
    // testable — and asserting BOTH spellings in the same window is what makes
    // the test load-bearing. Asserting only the Details cell would pass on a
    // codebase where size_label had been re-routed through format_size.
    await bootToDesktop(page);
    const win = await openMyMusic(page);

    // Details view. The status bar is ON by default — toggling it here would
    // turn it OFF, which is how this test first failed.
    await win.locator('[data-menu="View"]').click();
    await win.getByText('Details', { exact: true }).click();
    await win.getByText('Ascent.mp3', { exact: true }).first().click();
    await page.keyboard.press('Control+a');

    // Per-file, in the Details Size column: ALWAYS KB.
    await expect(win.getByText('501 KB', { exact: true })).toBeVisible();
    await expect(win.getByText('167 KB', { exact: true })).toBeVisible();

    // The very same window's status bar, for the very same files: MB.
    await expect(win.getByText('3 objects selected')).toBeVisible();
    await expect(win.getByText(/1\.1[0-9] MB/)).toBeVisible();
});
