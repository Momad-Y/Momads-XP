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
import { test, expect, type Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/** Loaded from app.html with an SRI hash, so they are not part of this problem. */
const ALLOWED = [
    /^https:\/\/code\.jquery\.com\//,
    /^https:\/\/unpkg\.com\/loadjs@/,
];

/**
 * Collects every request that is neither our own origin nor SRI-pinned.
 *
 * The origin test is a literal prefix rather than `new URL(page.url()).origin`
 * — the first requests fire while the page is still about:blank, so comparing
 * against the live URL reports the site itself as foreign.
 */
function watch_origins(page: Page): string[] {
    const foreign: string[] = [];
    page.on('request', (req) => {
        const url = req.url();
        if (url.startsWith('data:') || url.startsWith('blob:')) return;
        if (
            url.startsWith('http://localhost') ||
            url.startsWith('http://127.0.0.1')
        )
            return;
        if (ALLOWED.some((re) => re.test(url))) return;
        foreign.push(url);
    });
    return foreign;
}

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

    // the seeded C: is almost entirely free, which the capture showed Google
    // rendering as an <ellipse> plus one wall rather than two wedges
    await expect(chart.locator('[fill="#ec4899"]')).toHaveCount(1);
    await expect(chart.locator('[fill="#b13673"]')).toHaveCount(1);
    // whatever it drew, it must be real geometry
    await expect(chart.locator('path,ellipse').first()).toBeVisible();

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
