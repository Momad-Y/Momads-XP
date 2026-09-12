import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';
/*
 * The library, imported from the generated manifest.
 *
 * These specs are about the PLAYER — grouping, prev/next, the KB-vs-MB rule —
 * not about which songs the owner happens to like. Hardcoding three demo
 * tracks meant that swapping in the real library reddened five tests that had
 * found nothing wrong.
 *
 * Directly importable, unlike profile.json: this module's only import is
 * type-only, so nothing survives to need a JSON import attribute.
 */
import { GENRES, TRACKS } from '../src/lib/generated/music';

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

/**
 * My Music now holds a folder per genre, so anything asserting on track FILES
 * has to descend one level. The dialog only appears on the first folder entry.
 */
async function openGenre(page: Page, genre: string) {
    const win = await openMyMusic(page);
    await win.getByText(genre, { exact: true }).first().dblclick();
    await page.waitForTimeout(450);
    return win;
}

async function openPlayer(page: Page) {
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    await flyout.getByText('Windows Media Player', { exact: true }).click();
    await expect(page.getByTestId('play-pause')).toBeVisible({
        timeout: 15_000,
    });
}

test('opens with the discovered track list, grouped by genre', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openPlayer(page);

    // The library is scanned from static/audio/music/<genre>/*.mp3 and ordered
    // genre-by-genre, then by filename, so these are positions in a flat list
    // that the headers only visually divide.
    // one header per genre, in profile.json's declared order
    const headers = page.getByTestId('genre-header');
    await expect(headers).toHaveCount(GENRES.length);
    for (const [i, genre] of GENRES.entries()) {
        await expect(headers.nth(i)).toContainText(genre.name);
    }

    /*
     * Genres collapse, and only the one being played is open — 15 tracks under
     * 5 headers was a 20-row list that pushed the transport controls out of a
     * 470px window. So the visible rows are the FIRST genre's, not the whole
     * library.
     */
    const rows = page.getByTestId('track-row');
    const first_group = TRACKS.filter((t) => t.genre === GENRES[0]?.dir);
    await expect(rows).toHaveCount(first_group.length);
    await expect(rows.nth(0)).toContainText(String(first_group[0]?.title));

    // opening a second genre ADDS to it rather than closing the first
    const second = TRACKS.filter((t) => t.genre === GENRES[1]?.dir);
    await headers.nth(1).click();
    await expect(rows).toHaveCount(first_group.length + second.length);

    // art slot always renders — the icon stands in when a file carries no cover
    await expect(page.getByTestId('cover-art')).toBeVisible();

    // Exact string, per CLAUDE.md. It lives in profile.json, not the
    // component, because it is content.
    await expect(page.getByTestId('music-notice')).toHaveText(
        'All music legally acquired™ · personal listening only, not for distribution.',
    );
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

    // THE THIRD CLICK IS THE POINT: createMediaElementSource() is a permanent
    // one-shot binding on the ELEMENT, so a naive implementation throws
    // InvalidStateError here.
    //
    // Honest scope note: what actually protects this path today is
    // ensure_graph()'s `if (analyser == null)` guard, which builds the graph
    // once per component. The WeakMap in player.ts is a second line of defence
    // for any future caller that reaches for a source node directly, and its
    // CONTRACT is unit-tested. This e2e proves the user-visible behaviour, not
    // which of the two mechanisms delivered it.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await button.click();
    await expect.poll(async () => button.textContent()).toBe('⏸');

    const audio = page.locator('audio');
    await expect
        .poll(async () => audio.evaluate((el: HTMLAudioElement) => el.paused))
        .toBe(false);
    // No InvalidStateError reached the page.
    expect(errors.filter((e) => e.includes('InvalidStateError'))).toEqual([]);
});

test('next and previous wrap around the playlist', async ({ page }) => {
    await bootToDesktop(page);
    await openPlayer(page);

    const src = async () =>
        page.locator('audio').evaluate((el: HTMLAudioElement) => el.src);

    // Order is FILENAME order within a genre, not the old hand-written array
    // order — which is how the owner controls playback order, by prefixing.
    const at = (i: number) => decodeURI(String(TRACKS[i]?.url));
    expect(decodeURI(await src())).toContain(at(0));
    await page.getByRole('button', { name: 'Next' }).click();
    await expect.poll(async () => decodeURI(await src())).toContain(at(1));

    // Backwards past the first track must wrap to the LAST, not stall at 0 —
    // which is only a real assertion because the list spans several genres.
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect.poll(async () => decodeURI(await src())).toContain(at(0));
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect
        .poll(async () => decodeURI(await src()))
        .toContain(at(TRACKS.length - 1));
});

test('clicking a track row switches to it', async ({ page }) => {
    await bootToDesktop(page);
    await openPlayer(page);

    // nth(2) counts across the flat list, so a genre header between rows must
    // not shift the mapping — which is exactly what `group.offset` guarantees.
    /*
     * A row in the SECOND genre, reached by expanding it first. A header
     * between rows must not shift the index mapping — `group.offset` is what
     * guarantees that, and picking a row past a header is what tests it.
     */
    const target = TRACKS.findIndex((t) => t.genre !== TRACKS[0]?.genre);
    await page.getByTestId('genre-header').nth(1).click();
    await page.getByTestId('track-row').nth(target).click();
    await expect
        .poll(async () =>
            decodeURI(
                await page
                    .locator('audio')
                    .evaluate((el: HTMLAudioElement) => el.src),
            ),
        )
        .toContain(decodeURI(String(TRACKS[target]?.url)));
});

test('the volume slider drives the element, multiplied by the tray volume', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openPlayer(page);

    await page.getByTestId('volume').fill('0.5');
    // An EXACT value. `toBeLessThanOrEqual(0.5)` was satisfied by 0, so the
    // test passed with `effective_volume` returning a constant zero.
    // systemVolume defaults to 1, so 0.5 x 1 = 0.5.
    await expect
        .poll(async () =>
            page.locator('audio').evaluate((el: HTMLAudioElement) => el.volume),
        )
        .toBeCloseTo(0.5, 2);
});

test('is a singleton — it owns the audio output', async ({ page }) => {
    await bootToDesktop(page);
    await openPlayer(page);
    await expect(page.locator('#work-space .window')).toHaveCount(1);

    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    await page
        .locator('#all-programs-flyout')
        .getByText('Windows Media Player', { exact: true })
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
    // held more than 1 MB. A genre folder clears that easily — and asserting
    // BOTH spellings in the same window is what makes the test load-bearing.
    // Asserting only the Details cell would pass on a codebase where
    // size_label had been re-routed through format_size.
    await bootToDesktop(page);
    // Tracks live one level down in their genre folder; the coverage did not
    // move with them by accident — this is still the ONLY assertion that the
    // Details column and the status bar spell sizes by different rules.
    const win = await openGenre(page, String(GENRES[0]?.name));
    const group = TRACKS.filter((t) => t.genre === GENRES[0]?.dir);

    // Details view. The status bar is ON by default — toggling it here would
    // turn it OFF, which is how this test first failed.
    await win.locator('[data-menu="View"]').click();
    await win.getByText('Details', { exact: true }).click();
    await win
        .getByText(`${String(group[0]?.title)}.mp3`, { exact: true })
        .first()
        .click();
    await page.keyboard.press('Control+a');

    /*
     * Per-file, in the Details Size column: ALWAYS KB with separators. The
     * numbers come from the generated manifest, so re-exporting a track
     * changes the expectation with the file instead of reddening this.
     */
    for (const track of group) {
        await expect(
            win.getByText(`${track.size_kb.toLocaleString('en-US')} KB`, {
                exact: true,
            }),
        ).toBeVisible();
    }

    // The very same window's status bar, for the very same files: MB.
    const total_kb = group.reduce((sum, t) => sum + t.size_kb, 0);
    expect(total_kb).toBeGreaterThan(1024);
    const mb = (total_kb / 1024).toFixed(2);
    await expect(
        win.getByText(`${String(group.length)} objects selected`),
    ).toBeVisible();
    await expect(win.getByText(`${mb} MB`)).toBeVisible();
});

test('a genre collapses and reopens, and the playing one opens itself', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openPlayer(page);

    const rows = page.getByTestId('track-row');
    const headers = page.getByTestId('genre-header');
    const first = TRACKS.filter((t) => t.genre === GENRES[0]?.dir);

    // the playing genre starts open; a header reports its own track count
    await expect(rows).toHaveCount(first.length);
    await expect(headers.nth(0)).toContainText(String(first.length));

    // collapsing the playing genre is allowed — it is the visitor's call
    await headers.nth(0).click();
    await expect(rows).toHaveCount(0);
    await headers.nth(0).click();
    await expect(rows).toHaveCount(first.length);

    /*
     * Playing into a COLLAPSED genre must open it, or the visitor is left
     * looking at five closed headers with no idea where the sound is coming
     * from. Stepping back from the first track wraps to the last, which is in
     * the final genre.
     */
    await headers.nth(0).click();
    await expect(rows).toHaveCount(0);
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(rows).toHaveCount(
        TRACKS.filter((t) => t.genre === TRACKS[TRACKS.length - 1]?.genre)
            .length,
    );
});

test('cover art is cropped past the letterboxing', async ({ page }) => {
    /*
     * Art pulled from YouTube is a 16:9 thumbnail padded into a square, so a
     * plain object-cover renders two flat bands and a strip of picture. The
     * box is measured at build time (`cover_box`) and applied here; asserting
     * the rendered image is WIDER than its slot is what proves the zoom
     * happened, since an uncropped cover would exactly fill it.
     */
    await bootToDesktop(page);
    await openPlayer(page);

    const slot = page.getByTestId('cover-art');
    await expect(slot).toBeVisible();
    const box = await slot.boundingBox();
    const img = await slot.locator('img').boundingBox();
    expect(box).not.toBeNull();
    expect(img).not.toBeNull();

    const cropped = TRACKS[0]?.cover_box;
    expect(cropped, 'first track should have a measured crop').toBeTruthy();
    expect(img?.width ?? 0).toBeGreaterThan((box?.width ?? 0) + 1);
    // and it stays square — the slot must not letterbox it a second time
    expect(Math.abs((box?.width ?? 0) - (box?.height ?? 0))).toBeLessThan(2);
});
