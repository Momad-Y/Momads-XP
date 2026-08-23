import { test, expect } from '@playwright/test';
import type { Page, FrameLocator } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * Paint (the vendored jspaint bundle) had NO e2e coverage before this file —
 * the only two references in the whole suite were a Start-Menu label in
 * `start_menu.spec.ts` and a Folder-Options string in `xp_chrome_a.spec.ts`.
 *
 * It lands BEFORE the Phase 3 prune (plan T2p → T2) on purpose: the prune is a
 * destructive edit to a 45 MB third-party bundle, and gate 4 found two ways
 * the originally-planned version broke Paint with no visible error.
 *
 * TWO CORRECTIONS TO THE GATE-4 FINDINGS, established by probing the running
 * app rather than by reading jspaint's source:
 *
 *   1. The File ▸ New MENU ITEM does not reach `file_new()` in this embed.
 *      `menus.js:15` calls `open_empty_window()`, which `paint.svelte`
 *      overrides to open a second Paint WINDOW. `file_new()` — and therefore
 *      the unguarded `new_local_session()` at `functions.js:923` — is
 *      reachable only through the Ctrl+Alt+N shortcut (`app.js:1123`).
 *      So that is what the shortcut test below drives.
 *   2. "Canvas is reset" is NOT a usable assertion for those paths: both
 *      `file_new` and `open_from_image_info` wrap their body in
 *      `are_you_sure(...)`, which prompts first whenever the canvas is dirty.
 *      Measured identical pixel counts before and after in BOTH the healthy
 *      and broken builds — a test asserting on that would have been a test
 *      that cannot fail.
 *
 * What IS load-bearing is proven by mutation below: deleting
 * `styles/themes/classic.css` turns the theme test red, and removing the
 * `sessions.js` script tag turns the round-trip test red.
 */

const PAINT_LOAD = 30_000;

async function openPaintFromStartMenu(page: Page) {
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    await flyout.getByText('Paint', { exact: true }).click();
}

/** The newest Paint window's frame, once jspaint has really mounted. */
/**
 * Wait until EXACTLY `expected` Paint iframes exist, then return the newest.
 *
 * The count is mandatory. Without it `.last()` resolves against whatever is
 * attached at that instant, so a second Paint window that has not mounted yet
 * silently yields the FIRST window — which already has a canvas and, in the
 * round-trip test, already has ink. That made the reopen assertion pass on a
 * build where the open path was completely broken. Caught by mutation, not by
 * review.
 */
async function paintFrame(page: Page, expected = 1): Promise<FrameLocator> {
    await expect(page.locator('#work-space .window iframe')).toHaveCount(
        expected,
        { timeout: PAINT_LOAD },
    );
    const frame = page.frameLocator('#work-space .window iframe').last();
    await expect(frame.locator('.main-canvas')).toBeAttached({
        timeout: PAINT_LOAD,
    });
    return frame;
}

/** Count of non-white pixels in the newest Paint window's canvas. */
async function inkedPixels(page: Page, index = -1): Promise<number> {
    return page.evaluate((idx) => {
        const frames = document.querySelectorAll<HTMLIFrameElement>(
            '#work-space .window iframe',
        );
        const doc = (idx < 0 ? frames[frames.length - 1] : frames[idx])
            ?.contentDocument;
        const canvas = doc?.querySelector<HTMLCanvasElement>('.main-canvas');
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return -1;
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let inked = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200)
                inked++;
        }
        return inked;
    }, index);
}

async function drawStroke(page: Page, frame: FrameLocator) {
    const box = await frame.locator('.main-canvas').boundingBox();
    if (!box) throw new Error('paint canvas has no bounding box');
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 90, { steps: 14 });
    await page.mouse.up();
}

test('Paint opens with the classic theme actually applied, not merely linked', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openPaintFromStartMenu(page);
    await paintFrame(page);

    // The theme is loaded by RUNTIME string construction — `theme.js:5` builds
    // `styles/themes/${theme}` and `paint.svelte:241` asks for classic.css by
    // name — so `index.html` references it ZERO times and no static scan of
    // the bundle can see the dependency. That is precisely why a "prune to
    // what index.html loads" would delete the only stylesheet Paint has.
    //
    // Reading cssRules, not the href, is what makes this load-bearing: a
    // deleted stylesheet still leaves its <link> element with the right href.
    const theme = await page.evaluate(() => {
        const frames = document.querySelectorAll<HTMLIFrameElement>(
            '#work-space .window iframe',
        );
        const doc = frames[frames.length - 1]?.contentDocument;
        if (!doc) return { href: null, rules: -1 };
        const href =
            doc.getElementById('theme-link')?.getAttribute('href') ?? null;
        let rules = -1;
        for (const sheet of Array.from(doc.styleSheets)) {
            if (sheet.href?.includes('classic.css') === true) {
                try {
                    rules = sheet.cssRules.length;
                } catch {
                    rules = -2; // cross-origin — would mean this is not our frame
                }
            }
        }
        return { href, rules };
    });

    expect(theme.href).toBe('styles/themes/classic.css');
    expect(theme.rules).toBeGreaterThan(0);
});

test('draw → Save As writes a real PNG into the VFS, and reopening it round-trips through open_from_file', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openPaintFromStartMenu(page);
    const frame = await paintFrame(page);

    await drawStroke(page, frame);
    expect(await inkedPixels(page)).toBeGreaterThan(0);

    // ── Save As ──────────────────────────────────────────────────────────────
    await frame.getByRole('menuitem', { name: 'File' }).click();
    await frame.getByRole('menuitem', { name: /Save As/ }).click();

    const save = page.locator('#work-space .window').last();
    await expect(save.getByText('Save as type:')).toBeVisible();
    await save.getByText('Desktop', { exact: true }).click();
    // .nth(1), not .first(): input[0] is the "Look in" field (value
    // "My Computer"). And the Save button stays disabled until the name is
    // non-empty, so this must land before the click.
    const nameField = save.locator('input[type="text"]').nth(1);
    await nameField.click(); // click before fill — fill() alone drives a path no user can take
    await nameField.fill('e2e-paint');
    const saveBtn = save.getByRole('button', { name: 'Save' });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // The saved file must be a REAL png in the VFS, not a zero-byte stub —
    // that is what makes the reopen below exercise the decode path.
    // `.first()` is required, not lazy: the label text resolves to THREE
    // nested elements on the desktop, so a bare locator is a strict-mode
    // violation. (The repo's warning about `.first()` is about it grabbing
    // HIDDEN menu items — checked here: this one is visible.)
    const saved = page.locator('#desktop').getByText('e2e-paint.png').first();
    await expect(saved).toBeVisible({ timeout: 15_000 });

    // ── Reopen it ────────────────────────────────────────────────────────────
    // `.png`'s default handler is the Image Viewer (doctypes[0]), so Paint is
    // reached through Open With. This drives paint.svelte:251 open_from_file →
    // functions.js open_from_image_info → the UNGUARDED new_local_session().
    await saved.click({ button: 'right' });
    await page.getByText('Open With', { exact: true }).hover();
    await page.getByText('Paint', { exact: true }).click();

    const reopened = await paintFrame(page, 2);
    await expect(reopened.locator('.main-canvas')).toBeAttached();

    // The decisive assertion: the reopened canvas carries the stroke. If
    // open_from_image_info threw, the image never lands and the canvas is
    // blank — which is exactly what removing sessions.js produces.
    // Index 1, not "the last one": this must read the REOPENED window's
    // canvas. Reading the newest-at-that-moment frame is what made this
    // assertion vacuous before.
    await expect
        .poll(async () => inkedPixels(page, 1), { timeout: 15_000 })
        .toBeGreaterThan(0);
});

test('Ctrl+Alt+N reaches file_new — the real path to the unguarded new_local_session', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openPaintFromStartMenu(page);
    const frame = await paintFrame(page);

    // Deliberately NOT the File ▸ New menu item: `menus.js:15` calls
    // `open_empty_window()`, which paint.svelte overrides to open a second
    // window. Only the shortcut at app.js:1123 calls file_new().
    // The canvas is left clean so `are_you_sure` invokes its callback
    // immediately instead of prompting.
    await frame.locator('.main-canvas').click();
    await page.keyboard.press('Control+Alt+KeyN');

    // Still exactly one Paint window (the shortcut resets in place rather than
    // opening a new one), and the canvas is still usable afterwards.
    await expect(frame.locator('.main-canvas')).toBeAttached();
    await drawStroke(page, frame);
    expect(await inkedPixels(page)).toBeGreaterThan(0);
});

test('the #load: hash no longer fetches an arbitrary URL (T2 hardening)', async ({
    page,
}) => {
    // Before the prune this was live ON PRODUCTION: sessions.js parsed
    // `#load:<url>`, fetched it and rendered it inside a page served from the
    // owner's own domain — a phishing-grade primitive.
    //
    // The test is written so it CANNOT pass just because the page broke:
    // it asserts jspaint still boots (canvas present) AND that the attacker
    // URL was never requested. A "did it fail?" assertion alone would go green
    // on a bundle that no longer loads at all.
    const attacker = 'https://attacker.example/payload.png';
    let requested = 0;
    await page.route('**/attacker.example/**', (route) => {
        requested++;
        return route.abort();
    });

    await page.goto(
        `/html/jspaint/index.html#load:${encodeURIComponent(attacker)}`,
    );

    // jspaint must still be alive — this is the half that stops the test being
    // vacuous.
    await expect(page.locator('.main-canvas')).toBeAttached({
        timeout: PAINT_LOAD,
    });
    // Give any surviving hash handler time to act before asserting the negative.
    await page.waitForTimeout(1500);
    expect(requested).toBe(0);
});
