/**
 * The two SRI-less CDN origins are gone: `www.gstatic.com` (Google Charts, one
 * pie in the drive Properties sheet) and `cdn.skypack.dev` (three.js, every
 * music-player visualizer).
 *
 * These assert an ALLOWLIST, not "no gstatic, no skypack". A denylist only
 * catches the reintroduction of two hostnames; the allowlist catches any new
 * third-party origin, which is the drift that put these two here in the first
 * place.
 *
 * Note what this earns: ci.yml calls the `default` project hermetic. Until
 * this change that was not true — `desktop.svelte` fetched gstatic on every
 * page load, and `music_player.spec.ts` pulls a random visualizer, and so
 * skypack, whenever it plays audio.
 */
import { test, expect } from '@playwright/test';
import {
    bootToDesktop,
    openFromStartMenu,
    watchForeignOrigins,
} from './helpers';

/*
 * The allowlist and the watcher now live in `helpers.ts` as the single source.
 * They were declared here, and `chess.spec.ts` grew a weaker copy of the same
 * idea — which promptly failed on the app's own SRI-pinned jQuery. One list,
 * one place: duplicating it reintroduces exactly the drift this file exists to
 * catch, one file down.
 */
const watch_origins = watchForeignOrigins;

test('the desktop boots without contacting a third-party origin', async ({
    page,
}) => {
    const foreign = watch_origins(page);
    await bootToDesktop(page);
    await page.waitForTimeout(1500);

    expect(foreign).toEqual([]);
});

test('drive Properties draws its pie locally', async ({ page }) => {
    const foreign = watch_origins(page);
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();

    const explorer = page.locator('#work-space .window').first();
    await explorer.getByText('Local Disk (C:)').click({ button: 'right' });
    await page.locator('.context-menu').getByText('Properties').click();

    const chart = page.locator('.window .chart svg');
    await expect(chart).toBeVisible();

    /*
     * Presence, not counts. How many shapes each slice contributes depends on
     * where the seam falls: past 6 o'clock a slice owns a radial face as well
     * as its wall, so pinning the count made the test a function of how full
     * the drive happens to be — it broke when real music took C: to 59%.
     */
    await expect(chart.locator('[fill="#ec4899"]').first()).toBeVisible();
    await expect(chart.locator('[fill="#b13673"]').first()).toBeVisible();

    /*
     * The used wedge must be VISIBLE, not merely present. At the drive's old
     * 25GiB capacity this slice was 0.34 degrees — about a third of a pixel —
     * so it was in the DOM and invisible on screen, which is exactly the bug
     * that shrinking the capacity fixed. Asserted here rather than in its own
     * spec because the dialog is already open; a separate file would pay a
     * second boot for one measurement.
     */
    const used = chart.locator('[fill="#1d4ed8"]');
    await expect(used).toHaveCount(1);
    const box = await used.first().boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(20);
    expect(box?.height ?? 0).toBeGreaterThan(10);

    expect(foreign.filter((u) => u.includes('gstatic'))).toEqual([]);
    expect(foreign).toEqual([]);
});

test('an empty drive collapses to a full ellipse', async ({ page }) => {
    /*
     * D: is seeded empty, so used/total is 0 and the pie is one whole slice.
     * A single elliptical arc whose ends coincide draws NOTHING in SVG, which
     * is why the captured baseline emits an <ellipse> there instead of a path
     * — this is the branch that would silently render an empty box if the
     * special case were dropped.
     */
    const foreign = watch_origins(page);
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();

    const explorer = page.locator('#work-space .window').first();
    await explorer.getByText('Local Disk (D:)').click({ button: 'right' });
    await page.locator('.context-menu').getByText('Properties').click();

    const chart = page.locator('.window .chart svg');
    await expect(chart).toBeVisible();
    await expect(chart.locator('ellipse')).toHaveCount(1);
    await expect(chart.locator('ellipse')).toHaveAttribute('fill', '#ec4899');
    // the wall, and nothing else: an empty drive has no used wedge to draw
    await expect(chart.locator('path')).toHaveCount(1);
    await expect(chart.locator('[fill="#1d4ed8"]')).toHaveCount(0);

    expect(foreign).toEqual([]);
});

test('every visualizer runs on vendored three.js', async ({ page }) => {
    /*
     * All twelve in ONE test with sequential navigations: playwright.config.ts
     * documents that this suite flakes under machine load, and twelve separate
     * tests each compiling shaders is the most expensive thing anyone could
     * add to it.
     */
    const foreign: string[] = [];
    const failures: string[] = [];
    const errors: string[] = [];

    page.on('request', (req) => {
        const url = req.url();
        if (url.startsWith('data:') || url.startsWith('blob:')) return;
        if (
            url.startsWith('http://localhost') ||
            url.startsWith('http://127.0.0.1')
        )
            return;
        foreign.push(url);
    });
    page.on('response', (res) => {
        if (res.status() >= 400)
            failures.push(`${String(res.status())} ${res.url()}`);
    });
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
        // a bare specifier or a 404'd module surfaces here, not as a pageerror
        if (msg.type() === 'error') errors.push(msg.text());
    });

    for (let i = 1; i <= 12; i++) {
        await page.goto(`/html/visualizers/${String(i)}.html`);
        await page.waitForTimeout(700);

        const has_webgl = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (canvas == null) return false;
            // getContext('2d') returns null once a WebGL context exists on the
            // element — so this proves three.js initialised without creating a
            // second context of our own
            return canvas.getContext('2d') === null;
        });
        expect(
            has_webgl,
            `visualizer ${String(i)} never got a WebGL context`,
        ).toBe(true);
    }

    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
    expect(foreign).toEqual([]);
});

test('every game runs without contacting a third-party origin @heavy', async ({
    page,
}) => {
    /*
     * The guard that would catch a js-dos or Stockfish URL slipping back in.
     *
     * Both are vendored precisely so this holds: js-dos's own UI layer
     * hardcodes br.cdn.dos.zone, net.dos.zone, v8.js-dos.com and a Yandex API
     * gateway, and shipping it instead of the emulator layer would fail here.
     *
     * Tagged @heavy because DOOM boots a DOSBox image and Chess instantiates
     * Stockfish — expensive, not networked.
     */
    test.setTimeout(180_000);
    const foreign = watch_origins(page);
    await bootToDesktop(page);

    for (const game of ['Minesweeper', 'Solitaire', 'Chess']) {
        await openFromStartMenu(page, 'Games', game);
        await expect(
            page.locator('#work-space .window', { hasText: game }),
        ).toBeVisible();
    }

    // DOOM only downloads anything once its start gate is clicked, so the
    // click is the part that matters here.
    await openFromStartMenu(page, 'Games', 'DOOM');
    const doom = page.locator('#work-space .window', { hasText: 'DOOM' });
    await doom.locator('.doom-start').click();
    await expect(doom.locator('canvas.doom-screen')).toBeVisible({
        timeout: 120_000,
    });
    await page.waitForTimeout(3000);

    expect(foreign).toEqual([]);
});
