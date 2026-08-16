import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

async function openExperience(page: Page) {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    await win.locator('.fs-item', { hasText: 'Experience' }).first().dblclick();
    await page.waitForTimeout(450);
    return win;
}

const favMenu = (win: ReturnType<Page['locator']>) =>
    win.locator('.toolbar-menu').getByText('Favorites', { exact: true });

test('Explorer can favourite the folder it is showing', async ({ page }) => {
    const win = await openExperience(page);

    await favMenu(win).click();
    const addRow = win
        .locator('p', { hasText: /^Add to Favorites\.\.\.$/ })
        .first()
        .locator('..');
    await expect(addRow).toBeVisible();
    await expect(addRow).not.toHaveClass(/text-slate-400/);

    await win.getByText('Add to Favorites...', { exact: true }).click();
    const dialog = page
        .locator('#work-space .window')
        .filter({ hasText: 'Windows will add this folder' })
        .last();
    // XP prefills the name with the folder's own
    await expect(dialog.locator('input').first()).toHaveValue('Experience');
    await dialog.getByText('OK', { exact: true }).click();

    // it joins the Favorites menu
    await favMenu(win).click();
    await expect(
        win.locator('p', { hasText: /^Experience$/ }).first(),
    ).toBeVisible();
});

test('Organize Favorites can rename and delete', async ({ page }) => {
    const win = await openExperience(page);
    await favMenu(win).click();
    await win.getByText('Add to Favorites...', { exact: true }).click();
    const add = page
        .locator('#work-space .window')
        .filter({ hasText: 'Windows will add this folder' })
        .last();
    await add.getByText('OK', { exact: true }).click();
    await page.waitForTimeout(400);

    await favMenu(win).click();
    await win.getByText('Organize Favorites', { exact: true }).click();
    const org = page
        .locator('#work-space .window')
        .filter({ hasText: 'rename or delete' })
        .last();
    await expect(org).toBeVisible();

    // rename the folder favourite
    await org.getByText('Experience', { exact: true }).click();
    await org.getByText('Rename', { exact: true }).click();
    const box = org.locator('input');
    await expect(box).toBeVisible();
    // Click INTO the editor before typing. `fill()` alone focuses without
    // dispatching a click, so it hid a real bug: the row's click handler
    // cleared `renaming`, closing the editor the moment a user clicked it.
    await box.click();
    await expect(box).toBeVisible();
    await box.fill('My Work');
    await box.press('Enter');
    await expect(org.getByText('My Work', { exact: true })).toBeVisible();

    // and delete it
    await org.getByText('My Work', { exact: true }).click();
    await org.getByText('Delete', { exact: true }).click();
    await expect(org.getByText('My Work', { exact: true })).toHaveCount(0);
});

test('a SELECTED folder is what gets favourited, not just the open one', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);

    // sitting in C:\ but with a child folder selected
    await win.locator('.fs-item', { hasText: 'Experience' }).first().click();
    await page.waitForTimeout(250);
    await favMenu(win).click();
    await win.getByText('Add to Favorites...', { exact: true }).click();

    const dialog = page
        .locator('#work-space .window')
        .filter({ hasText: 'Windows will add this folder' })
        .last();
    // the selection wins over the folder the window is showing
    await expect(dialog.locator('input').first()).toHaveValue('Experience');
});

test('a selected FILE can be favourited, and opens in its program', async ({
    page,
}) => {
    const win = await openExperience(page);

    await win
        .locator('.fs-item', { hasText: 'Printerpix — AI Engineer.txt' })
        .first()
        .click();
    await page.waitForTimeout(250);
    await favMenu(win).click();
    await win.getByText('Add to Favorites...', { exact: true }).click();

    const dialog = page
        .locator('#work-space .window')
        .filter({ hasText: 'to your Favorites' })
        .last();
    await expect(dialog.getByText(/this file/)).toBeVisible();
    // the basename is offered, so a rename does not drag ".txt" along
    await expect(dialog.locator('input').first()).toHaveValue(
        'Printerpix — AI Engineer',
    );
    await dialog.getByText('OK', { exact: true }).click();
    await page.waitForTimeout(500);

    // choosing it launches the file rather than navigating the folder
    const before = await page.locator('#work-space .window').count();
    await favMenu(win).click();
    // a file favourite must show a FILE icon, never the folder glyph
    const icons = await win
        .locator('img')
        .evaluateAll((els) =>
            els.map((e) => (e as HTMLImageElement).getAttribute('src') ?? ''),
        );
    expect(icons.some((src) => src.includes('TXT'))).toBe(true);
    await win
        .locator('p', { hasText: /^Printerpix — AI Engineer$/ })
        .first()
        .click();
    await page.waitForTimeout(1500);
    expect(await page.locator('#work-space .window').count()).toBe(before + 1);
    // assert against the NEW window: a bare getByText('AI Engineer').first()
    // matches the (now hidden) favourites menu entry instead
    await expect(page.locator('#work-space .window').last()).toContainText(
        'AI Engineer',
    );
});

test('a folder favourite is shared with IE and opens Explorer, not a web page', async ({
    page,
}) => {
    const win = await openExperience(page);
    await favMenu(win).click();
    await win.getByText('Add to Favorites...', { exact: true }).click();
    const add = page
        .locator('#work-space .window')
        .filter({ hasText: 'Windows will add this folder' })
        .last();
    await add.getByText('OK', { exact: true }).click();
    await page.waitForTimeout(400);

    // IE shares the one Favorites list (XP keeps a single shell folder).
    // .last(): the Explorer window opened above is still on screen.
    await page
        .locator('#work-space p', { hasText: 'Internet Explorer' })
        .dblclick();
    await page.waitForTimeout(800);
    const ie = page.locator('#work-space .window').last();
    await ie
        .locator('.toolbar-menu')
        .getByText('Favorites', { exact: true })
        .click();
    await expect(
        ie.locator('p', { hasText: /^Experience$/ }).first(),
    ).toBeVisible();

    const before = await page.locator('#work-space .window').count();
    // pin IE by index: windows are appended, so `.last()` would silently
    // re-resolve to the new window this click is about to create
    const ie_index = before - 1;
    await ie
        .locator('p', { hasText: /^Experience$/ })
        .first()
        .click();
    await page.waitForTimeout(1500);

    // a folder favourite belongs to Explorer: a new window opens…
    expect(await page.locator('#work-space .window').count()).toBe(before + 1);
    // …and IE itself did NOT try to load the folder path as a web address
    await expect(
        page
            .locator('#work-space .window')
            .nth(ie_index)
            .locator('input')
            .first(),
    ).not.toHaveValue(/Experience/);
});
