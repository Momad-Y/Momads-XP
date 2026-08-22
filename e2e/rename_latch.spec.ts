import { test, expect, type Locator, type Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * `rename_cancelled` is a latch: it is set by cancel_renaming and cleared ONLY
 * inside end_renaming. Cancelling removes the focused textarea, and Chromium
 * and WebKit fire NO blur for an element removed while focused — so
 * end_renaming never ran and the latch survived into the NEXT rename, which
 * then silently discarded whatever was typed. Nothing covered this on either
 * surface, and the desktop copy had no Escape handling at all until #95.
 */

async function newTextFileInExperience(page: Page): Promise<Locator> {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await win.locator('.fs-item', { hasText: 'Experience' }).first().dblclick();

    // work on a file we created, so rename is permitted
    await win.locator('.toolbar-menu').getByText('File').click();
    await win.locator('p', { hasText: /^New$/ }).first().hover();
    await win.getByText('Text Document').click();
    await expect(win.getByText('New Text Document.txt')).toBeVisible({
        timeout: 15000,
    });
    return win;
}

/**
 * `fill()` replaces the WHOLE textarea. The real gesture only replaces the
 * pre-selected basename, so every fill below carries the extension too —
 * otherwise the file loses it and the assertion looks like a failed rename.
 */
async function startRename(win: Locator, name: string): Promise<Locator> {
    await win.getByText(name).click({ button: 'right' });
    await win.page().locator('.context-menu').getByText('Rename').click();
    const box = win.locator('textarea');
    await expect(box).toBeVisible();
    return box;
}

test('Escape abandons a rename WITHOUT disarming the next one', async ({
    page,
}) => {
    const win = await newTextFileInExperience(page);

    // 1. cancel a rename — correct, and the edit is abandoned
    let box = await startRename(win, 'New Text Document.txt');
    await box.fill('Abandoned.txt');
    await page.keyboard.press('Escape');
    await expect(win.locator('textarea')).toHaveCount(0);
    await expect(win.getByText('New Text Document.txt')).toBeVisible();
    await expect(win.getByText('Abandoned.txt')).toHaveCount(0);

    // 2. the very next rename must COMMIT. It used to hit the stale latch and
    //    discard silently, so the file kept its old name and only a THIRD
    //    attempt worked.
    box = await startRename(win, 'New Text Document.txt');
    await box.fill('Budget.txt');
    await page.keyboard.press('Enter');
    await expect(win.getByText('Budget.txt')).toBeVisible({ timeout: 15000 });
});

test('F5 mid-rename abandons the edit and does not disarm the next one', async ({
    page,
}) => {
    const win = await newTextFileInExperience(page);

    // refresh() cancels an in-flight rename, which armed the same latch with
    // no Escape involved at all — F5 is a reflex key, so this was reachable
    // by accident mid-edit.
    let box = await startRename(win, 'New Text Document.txt');
    await box.fill('Interrupted.txt');
    await page.keyboard.press('F5');
    await expect(win.locator('textarea')).toHaveCount(0);
    await expect(win.getByText('New Text Document.txt')).toBeVisible();

    box = await startRename(win, 'New Text Document.txt');
    await box.fill('Renamed.txt');
    await page.keyboard.press('Enter');
    await expect(win.getByText('Renamed.txt')).toBeVisible({ timeout: 15000 });
});

test('Escape cancels a rename on the DESKTOP too, and commits the next', async ({
    page,
}) => {
    await bootToDesktop(page);
    // a desktop item that is not protected: create one via the desktop menu
    await page.locator('#work-space').click({
        button: 'right',
        position: { x: 900, y: 500 },
    });
    const ctx = page.locator('.context-menu');
    await ctx.getByText('New', { exact: true }).hover();
    await ctx.getByText('Text Document').click();
    const created = page.locator('#work-space p', {
        hasText: 'New Text Document.txt',
    });
    await expect(created.first()).toBeVisible({ timeout: 15000 });

    // cancel one rename …
    await created.first().click({ button: 'right' });
    await page.locator('.context-menu').getByText('Rename').click();
    let box = page.locator('#work-space textarea');
    await expect(box).toBeVisible();
    await box.fill('Abandoned.txt');
    await page.keyboard.press('Escape');
    await expect(page.locator('#work-space textarea')).toHaveCount(0);
    await expect(
        page.locator('#work-space p', { hasText: 'Abandoned.txt' }),
    ).toHaveCount(0);

    // … and the next one must still commit
    await created.first().click({ button: 'right' });
    await page.locator('.context-menu').getByText('Rename').click();
    box = page.locator('#work-space textarea');
    await expect(box).toBeVisible();
    await box.fill('Committed.txt');
    await page.keyboard.press('Enter');
    await expect(
        page.locator('#work-space p', { hasText: 'Committed.txt' }),
    ).toBeVisible({ timeout: 15000 });
});
