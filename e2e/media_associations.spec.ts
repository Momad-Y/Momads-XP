import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * Which program opens a media file, and whether it opens the RIGHT file.
 *
 * The association itself is unit-tested (`media_types.test.ts`). What only a
 * browser can show is the half that used to be broken underneath it: the
 * player looked the launched file up in its My Music library and fell back to
 * the first track, so double-clicking one song played another — and because
 * the player is a singleton, a second double-click raised its window and
 * changed nothing at all.
 */

const explorer = (page: Page): Locator =>
    page
        .locator('#work-space .window')
        .filter({ has: page.locator('.toolbar-menu') });

const player = (page: Page): Locator =>
    page
        .locator('#work-space .window')
        .filter({ has: page.getByTestId('music-notice') });

/** The title line of the Music Player's now-playing panel. */
const now_playing = (page: Page): Locator =>
    player(page).locator('.truncate.font-bold').first();

async function openMyComputer(page: Page): Promise<Locator> {
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = explorer(page);
    await expect(win).toBeVisible({ timeout: 15_000 });
    return win;
}

/**
 * Enter a folder, dismissing Explorer's one-time File Transfer guide.
 *
 * `:visible` matters: the "Other Places" sidebar renders `.fs-item` too, and
 * its entries can be collapsed — a plain `.first()` picks one of those and the
 * double-click never lands.
 */
async function enter(page: Page, name: string) {
    await explorer(page)
        .locator('.fs-item:visible', { hasText: name })
        .first()
        .dblclick();
    // The guide mounts a tick or two LATER, so an immediate isVisible() race
    // misses it — and then it swallows every subsequent click as an invisible
    // full-window overlay.
    await page.waitForTimeout(500);
    const ok = page.locator('.dialog').getByText('OK');
    if ((await ok.count()) > 0) await ok.first().click();
    await page.waitForTimeout(450);
}

/**
 * Bring a window to the front via its taskbar button.
 *
 * Needed between two double-clicks: the player opens ON TOP of Explorer, and
 * Playwright refuses to click an element another element covers — which is
 * exactly what a real visitor would have to do too.
 */
async function raise(page: Page, title: string) {
    await page.locator('.program-tile', { hasText: title }).first().click();
    await page.waitForTimeout(400);
}

async function openFile(page: Page, name: string) {
    await explorer(page)
        .locator('.fs-item:visible', { hasText: name })
        .first()
        .dblclick();
    await page.waitForTimeout(900);
}

test.beforeEach(async ({ page }) => {
    await bootToDesktop(page);
});

test('double-clicking a song opens the Music Player on THAT song', async ({
    page,
}) => {
    await openMyComputer(page);
    await enter(page, 'My Music');
    await enter(page, 'Arabic Pop');

    await openFile(page, 'Wailli.mp3');

    // The player, not Media Player Classic.
    await expect(player(page)).toBeVisible();
    // And the clicked track — NOT the first track in the library, which is
    // what the old fallback played.
    await expect(now_playing(page)).toHaveText('Wailli');
});

test('a second double-click switches the open player to that song', async ({
    page,
}) => {
    await openMyComputer(page);
    await enter(page, 'My Music');
    await enter(page, 'Arabic Pop');

    await openFile(page, 'Wailli.mp3');
    await expect(now_playing(page)).toHaveText('Wailli');

    // The player is a singleton, so this focuses the existing window rather
    // than launching a second one. It must still change track.
    await raise(page, 'Arabic Pop');
    await openFile(page, 'Kadabeen.mp3');
    await expect(now_playing(page)).toHaveText('Kadabeen');
    // Still exactly one player.
    await expect(player(page)).toHaveCount(1);
});

test('a song outside My Music plays, listed under its own folder', async ({
    page,
}) => {
    await openMyComputer(page);
    await enter(page, 'My Music');
    await enter(page, 'Arabic Pop');

    await explorer(page)
        .locator('.fs-item:visible', { hasText: 'Wailli.mp3' })
        .first()
        .click();
    await page.keyboard.press('Control+c');
    // Arabic Pop → My Music → My Computer, then into My Documents.
    await page.keyboard.press('Control+ArrowUp');
    await page.waitForTimeout(350);
    await page.keyboard.press('Control+ArrowUp');
    await page.waitForTimeout(350);
    await enter(page, 'My Documents');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(700);

    await openFile(page, 'Wailli.mp3');

    await expect(now_playing(page)).toHaveText('Wailli');
    // Its own group, named after the folder it came from — so the visitor can
    // see what is playing and where it is from.
    await expect(
        player(page)
            .getByTestId('genre-header')
            .filter({ hasText: 'My Documents' }),
    ).toHaveCount(1);
});

test('a video extension opens the video player, and says when it cannot play', async ({
    page,
}) => {
    await openMyComputer(page);
    await enter(page, 'My Documents');

    // No video ships with the site, so stage one: a new file renamed to a
    // video extension. Undecodable by design, which is the point — the player
    // has to SAY so rather than sit on an empty grey window, which is what it
    // did for any unrecognised extension before.
    const win = explorer(page);
    await win.locator('.toolbar-menu').getByText('File').click();
    await win.locator('p', { hasText: /^New$/ }).first().hover();
    await win.getByText('Text Document', { exact: true }).click();
    await expect(
        win.locator('.fs-item:visible', { hasText: 'New Text Document.txt' }),
    ).toBeVisible({ timeout: 15_000 });

    await win
        .locator('.fs-item:visible', { hasText: 'New Text Document.txt' })
        .first()
        .click({ button: 'right' });
    await page.locator('.context-menu').getByText('Rename').click();
    const box = win.locator('textarea');
    await expect(box).toBeVisible();
    await box.click();
    await box.fill('clip.mkv');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await openFile(page, 'clip.mkv');

    // Media Player Classic, with a visible reason — not the Music Player.
    await expect(page.getByTestId('mpc-load-error')).toBeVisible({
        timeout: 15_000,
    });
    await expect(player(page)).toHaveCount(0);
});
