import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * The Music Player is a VIEW OVER `My Music`, not a compiled-in track list.
 *
 * WHY THESE ARE NOT IN `music_player.spec.ts`: that suite imports `GENRES` and
 * `TRACKS` from the generated manifest as its expectation of the library — and
 * the VFS seed is generated from the same scan, so the two agree by
 * construction. Every assertion in it passes identically whether the player
 * reads the drive or the constant. Reverting this whole feature leaves it
 * green. These mutate the drive through Explorer and then look at the player,
 * which is the only shape of test that can go red.
 *
 * One defect per test, named after the report.
 */

/** The Explorer window: the one with a toolbar menu. */
const explorer = (page: Page): Locator =>
    page
        .locator('#work-space .window')
        .filter({ has: page.locator('.toolbar-menu') });

/** The player window: the one with the licensing notice at the bottom. */
const player = (page: Page): Locator =>
    page
        .locator('#work-space .window')
        .filter({ has: page.getByTestId('music-notice') });

/**
 * Open My Computer, step into My Music, and dismiss the inherited one-time
 * "File Transfer" guide Explorer shows on first folder entry (a documented
 * trap in CLAUDE.md — without this every folder test hangs on an invisible
 * modal).
 */
async function openMyMusic(page: Page): Promise<Locator> {
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = explorer(page);
    await expect(win).toBeVisible({ timeout: 15_000 });
    await win.getByText('My Music', { exact: true }).first().dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    return win;
}

async function openPlayer(page: Page): Promise<Locator> {
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    await flyout.getByText('Windows Media Player', { exact: true }).click();
    const win = player(page);
    await expect(win).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(400);
    return win;
}

/** Right-click ▸ Delete ▸ OK, on a named item in the Explorer window. */
async function deleteItem(page: Page, win: Locator, name: string) {
    await win
        .getByText(name, { exact: true })
        .first()
        .click({ button: 'right' });
    await page
        .locator('.context-menu')
        .getByText('Delete', { exact: true })
        .click();
    await page.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(400);
}

/** A genre header in the player, by its folder name. */
const header = (win: Locator, name: string) =>
    win.getByTestId('genre-header').filter({ hasText: name });

/** The count badge a header carries. */
async function headerCount(win: Locator, name: string): Promise<string> {
    return (
        (await header(win, name)
            .locator('span.text-\\[10px\\]')
            .textContent()) ?? ''
    );
}

async function enterFolder(page: Page, win: Locator, name: string) {
    await win.getByText(name, { exact: true }).first().dblclick();
    await page.waitForTimeout(450);
}

test.beforeEach(async ({ page }) => {
    await bootToDesktop(page);
});

/* Defect 1 — the player kept listing and playing a deleted song. */
test('deleting a song removes it from the player', async ({ page }) => {
    const music = await openPlayer(page);
    const win = await openMyMusic(page);
    await enterFolder(page, win, 'Arabic Pop');

    expect(await headerCount(music, 'Arabic Pop')).toBe('3');
    await expect(
        music.getByTestId('track-row').filter({ hasText: 'Wailli' }),
    ).toHaveCount(1);

    await deleteItem(page, explorer(page), 'Wailli.mp3');

    await expect.poll(async () => headerCount(music, 'Arabic Pop')).toBe('2');
    await expect(
        music.getByTestId('track-row').filter({ hasText: 'Wailli' }),
    ).toHaveCount(0);
});

/* Defect 1, the sharp edge: the song that is CURRENTLY playing. */
test('deleting the playing song stops the player', async ({ page }) => {
    const music = await openPlayer(page);
    const win = await openMyMusic(page);
    await enterFolder(page, win, 'Arabic Pop');

    // The first track is selected on open.
    await expect(music.getByText('Shedeeny', { exact: true })).toHaveCount(2);

    await deleteItem(page, explorer(page), 'Shedeeny.mp3');

    await expect(music.getByText('No track')).toBeVisible();
    await expect
        .poll(async () => music.locator('audio').getAttribute('src'))
        .toBeFalsy();
});

/* Defect 2 — deleting a whole genre folder left its header standing. */
test('deleting a genre folder removes the category', async ({ page }) => {
    const music = await openPlayer(page);
    const win = await openMyMusic(page);

    await expect(header(music, 'Scores')).toHaveCount(1);

    await deleteItem(page, win, 'Scores');

    await expect(header(music, 'Scores')).toHaveCount(0);
});

/* Defect 3 — an emptied genre is still a genre. */
test('a genre whose songs are all deleted stays, at zero', async ({ page }) => {
    const music = await openPlayer(page);
    const win = await openMyMusic(page);
    await enterFolder(page, win, 'Scores');

    expect(await headerCount(music, 'Scores')).toBe('1');

    await deleteItem(page, explorer(page), 'The 7 Testaments Main Score.mp3');

    // The folder is still there, so the category is still there.
    await expect.poll(async () => headerCount(music, 'Scores')).toBe('0');
    await expect(header(music, 'Scores')).toHaveCount(1);
});

/* Defect 4 — a folder the visitor makes is a category too. */
test('a folder created in My Music becomes a category', async ({ page }) => {
    const music = await openPlayer(page);
    const win = await openMyMusic(page);

    await expect(header(music, 'New Folder')).toHaveCount(0);

    await win.locator('.toolbar-menu').getByText('File').click();
    await win.locator('p', { hasText: /^New$/ }).first().hover();
    await win.getByText('Folder', { exact: true }).click();

    await expect(header(music, 'New Folder')).toHaveCount(1);
    expect(await headerCount(music, 'New Folder')).toBe('0');
});

/* Defect 7 — the Recycle Bin could only be emptied, never restored from. */
test('Restore puts a deleted song back, and the player picks it up', async ({
    page,
}) => {
    const music = await openPlayer(page);
    const win = await openMyMusic(page);
    await enterFolder(page, win, 'Scores');

    await deleteItem(page, explorer(page), 'The 7 Testaments Main Score.mp3');
    await expect.poll(async () => headerCount(music, 'Scores')).toBe('0');

    // The bin opens in its own Explorer window; close this one so the
    // `.toolbar-menu` filter keeps naming exactly one.
    await win.locator('.toolbar-menu').getByText('File').click();
    await win
        .locator('p', { hasText: /^Close$/ })
        .first()
        .click();
    await page.waitForTimeout(400);
    await page.locator('#work-space p', { hasText: 'Recycle Bin' }).dblclick();
    const bin = explorer(page);
    await expect(bin).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(400);

    await bin
        .getByText('The 7 Testaments Main Score.mp3', { exact: true })
        .first()
        .click({ button: 'right' });
    await page
        .locator('.context-menu')
        .getByText('Restore', { exact: true })
        .click();
    await page.waitForTimeout(400);

    // Back in its genre, and back in the player.
    await expect.poll(async () => headerCount(music, 'Scores')).toBe('1');
    await expect(
        bin.getByText('The 7 Testaments Main Score.mp3', { exact: true }),
    ).toHaveCount(0);
});
