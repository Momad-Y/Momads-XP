import { test, expect, type Locator, type Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * The holes a red-team pass found in xp_chrome_f: nothing opened a SECOND
 * Explorer window (this repo's #1 historical bug class), nothing asserted a
 * Details CELL or the status bar's size pane, and the new controls were only
 * ever exercised inside C:\.
 */

async function openMyComputer(page: Page): Promise<Locator> {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    return page.locator('#work-space .window').first();
}

/**
 * A SECOND Explorer. Not via the desktop icon: once a window is open, the
 * text "My Computer" also lives in its Go To submenu and History bar, and the
 * window may cover the icon. The Start menu entry is unambiguous.
 */
async function openSecondExplorer(page: Page): Promise<Locator> {
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('My Computer').click();
    const windows = page.locator('#work-space .window');
    await expect(windows).toHaveCount(2);
    return windows.nth(1);
}

/**
 * `first_entry` dismisses the one-time File Transfer guide with an
 * auto-waiting click. It is keyed off the caller rather than probed with
 * `count()`, which does NOT auto-wait and would race the dialog's mount.
 */
async function enterC(
    win: Locator,
    { first_entry }: { first_entry: boolean },
): Promise<void> {
    await win.getByText('Local Disk (C:)').dblclick();
    if (first_entry) await win.locator('.dialog').getByText('OK').click();
    await expect(win.getByText('Mohamed_Abdelnasser_Resume.pdf')).toBeVisible();
}

async function openMenu(win: Locator, name: string): Promise<void> {
    await win.locator('.toolbar-menu').getByText(name, { exact: true }).click();
}

function menuRow(win: Locator, name: string): Locator {
    return win
        .locator('.toolbar-menu')
        .locator('p', { hasText: new RegExp(`^${name}$`) })
        .first()
        .locator('..');
}

function subRow(win: Locator, name: string): Locator {
    return win.locator('.group-sub1', {
        has: win.page().locator('p', { hasText: new RegExp(`^${name}$`) }),
    });
}

async function pickSub(
    win: Locator,
    parent: string,
    child: string,
): Promise<void> {
    await win
        .locator('.toolbar-menu')
        .getByText(parent, { exact: true })
        .hover();
    await subRow(win, child).click();
}

test('chrome and status are PER WINDOW, not shared through a store', async ({
    page,
}) => {
    const win_a = await openMyComputer(page);
    await enterC(win_a, { first_entry: true });
    // pin by index — .last() re-resolves to whatever a click just created
    const win_b = await openSecondExplorer(page);

    // B stays at the root while A sits in C:, so the two windows genuinely
    // show different ids. (Two windows on the SAME folder legitimately share
    // a selection — `visible_ids` scopes by what is shown, not by window.)
    // NOTE: mounting B clears the global selection, so select AFTER it opens.
    await win_b.getByText('Local Disk (C:)').click();
    await expect(win_b.getByText('1 object selected')).toBeVisible();

    // `selectingItems` is ONE global store, but A is not showing that drive,
    // so A must keep reporting its own contents
    await expect(win_a.getByText('1 object selected')).toHaveCount(0);
    await expect(win_a.getByText(/^\d+ objects$/)).toBeVisible();

    // toolbars: switching B's Address Bar off must not touch A's
    await openMenu(win_b, 'View');
    await pickSub(win_b, 'Toolbars', 'Address Bar');
    await expect(win_b.getByText('Address', { exact: true })).toBeHidden();
    await expect(win_a.getByText('Address', { exact: true })).toBeVisible();

    // and B's status bar can be switched off without taking A's with it.
    // toBeHidden, not toHaveCount(0): the row is display:none, still in the DOM
    await openMenu(win_b, 'View');
    await menuRow(win_b, 'Status Bar').click();
    await expect(win_b.getByText('1 object selected')).toBeHidden();
    await expect(win_a.getByText(/^\d+ objects$/)).toBeVisible();
});

test('a desktop selection is not deleted by an Explorer right-click', async ({
    page,
}) => {
    // The CRITICAL. Two earlier attempts at this test could not fail:
    //  - deleting through the FILE MENU exercises a path already scoped in #93;
    //  - two windows both showing C:\ have identical visible_ids, so the
    //    narrowing is the identity function;
    //  - and a PROTECTED desktop item (Recycle Bin, My Computer) is dropped by
    //    plan_delete anyway, so the prompt names one file either way.
    // It has to be a DELETABLE item on a genuinely different surface.
    await bootToDesktop(page);
    await page
        .locator('#work-space')
        .click({ button: 'right', position: { x: 900, y: 500 } });
    const ctx = page.locator('.context-menu');
    await ctx.getByText('New', { exact: true }).hover();
    await ctx.getByText('Text Document').click();
    const desktop_file = page
        .locator('#work-space p', { hasText: 'New Text Document.txt' })
        .first();
    await expect(desktop_file).toBeVisible({ timeout: 15000 });

    // NOT openMyComputer(): that re-runs bootToDesktop, reloading the page out
    // from under the file we just made
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await enterC(win, { first_entry: true });

    // the selection has to be made AFTER the window mounts — mounting a viewer
    // clears the global selection, which is what made earlier attempts vacuous
    await desktop_file.click();
    await win
        .getByText('Mohamed_Abdelnasser_Resume.pdf')
        .click({ modifiers: ['Control'] });

    // right-click Delete in Explorer must act on Explorer's item alone
    await win
        .getByText('Mohamed_Abdelnasser_Resume.pdf')
        .click({ button: 'right' });
    await page.locator('.context-menu').getByText('Delete').click();
    const prompt = win.locator('.dialog');
    await expect(prompt).toBeVisible();
    // unscoped, the batch is two items and the prompt says "and 1 other item"
    await expect(prompt).not.toContainText('other item');

    await prompt.getByText('OK').click();
    await expect(prompt).toBeHidden();
    // the Explorer file went …
    await expect(win.getByText('Mohamed_Abdelnasser_Resume.pdf')).toHaveCount(
        0,
    );
    // … and the desktop file, which the user never targeted, survived
    await expect(
        page.locator('#work-space p', { hasText: 'New Text Document.txt' }),
    ).toBeVisible();
});

test('Details renders real CELL values, not just headers', async ({ page }) => {
    const win = await openMyComputer(page);
    await enterC(win, { first_entry: true });
    await openMenu(win, 'View');
    await win
        .locator('.toolbar-menu')
        .getByText('Details', { exact: true })
        .click();

    const row = win.locator('.fs-item', {
        hasText: 'Mohamed_Abdelnasser_Resume.pdf',
    });
    // the cells, not the column captions: blanking column_value used to pass
    await expect(row.locator('[data-cell="type"]')).toHaveText('PDF File');
    // the exact string: /KB|MB|GB/ was unanchored AND the fixture is 61 KB,
    // so it matched the old formatter, the new one, and a hardcoded '0 KB'.
    // NOTE: the KB-vs-adaptive rule itself cannot be asserted here — every
    // file reachable in Explorer is under 1 MB (the only larger ones live in
    // the Desktop folder, which is in `hidden_items`), so both rules print
    // "61 KB". details_columns.test.ts covers it with 13,323 / 5,000,000 KB.
    await expect(row.locator('[data-cell="size"]')).toHaveText('61 KB');
    await expect(row.locator('[data-cell="date_modified"]')).toHaveText(
        /^\d+\/\d+\/\d{4} \d+:\d{2} [AP]M$/,
    );
});

test('the status bar reports a real count and a real size', async ({
    page,
}) => {
    const win = await openMyComputer(page);
    await enterC(win, { first_entry: true });
    // not just "some digits": `0 objects` used to satisfy the old regex
    const count = win.getByText(/^\d+ objects$/);
    await expect(count).toBeVisible();
    await expect(count).not.toHaveText('0 objects');
    // scoped to the status bar: window-scoped, a Details size CELL satisfies
    // the assertion this test names
    await expect(win.locator('[data-status="size"]')).toHaveText(
        /^[\d.,]+ (KB|MB|GB|TB)$/,
    );
});

test('at the My Computer root the new controls stay honest', async ({
    page,
}) => {
    const win = await openMyComputer(page);

    // Choose Details greys with the view modes — the root has no columns
    await openMenu(win, 'View');
    await expect(menuRow(win, 'Choose Details\\.\\.\\.')).toHaveClass(
        /text-slate-400/,
    );
    await page.keyboard.press('Escape');

    // the status bar counts the drives and folders the root is showing
    await expect(win.getByText(/^\d+ objects$/)).toBeVisible();
    await expect(win.getByText('0 objects')).toHaveCount(0);

    // Refresh is NOT a no-op here. Both halves matter: the loading state must
    // actually be OBSERVABLE (it used to clear on tick(), inside the same
    // microtask drain, so no frame could ever paint it), and the list must
    // come back. Asserting only the second is what a no-op also produces.
    await openMenu(win, 'View');
    await menuRow(win, 'Refresh').click();
    await expect(win.locator('[data-root-loading]')).toBeVisible();
    await expect(win.getByText('Local Disk (C:)')).toBeVisible();
    await expect(win.getByText('Files Stored on This Computer')).toBeVisible();

    // the Favorites bar's Add... is greyed where the menu entry is greyed
    await openMenu(win, 'View');
    await pickSub(win, 'Explorer Bar', 'Favorites');
    await expect(win.getByRole('button', { name: 'Add...' })).toBeDisabled();
});

test('F5 does not refresh underneath the DELETE confirmation', async ({
    page,
}) => {
    // Choose Details was already guarded before the fix by its own boolean;
    // the new guard is the DOM query that covers the dialogs which mount into
    // the window and set no flag. This is one of those.
    const win = await openMyComputer(page);
    await enterC(win, { first_entry: true });
    await win.getByText('Mohamed_Abdelnasser_Resume.pdf').click();
    await openMenu(win, 'File');
    await menuRow(win, 'Delete').click();
    const prompt = win.locator('.dialog');
    await expect(prompt).toBeVisible();

    await page.keyboard.press('F5');
    // the modal owns the keyboard: it survives and the list is untouched
    await expect(prompt).toBeVisible();
    await expect(win.getByText('working on it...')).toHaveCount(0);

    // and Escape is Cancel here, as on any XP dialog
    await page.keyboard.press('Escape');
    await expect(prompt).toBeHidden();
    await expect(win.getByText('Mohamed_Abdelnasser_Resume.pdf')).toBeVisible();
});

test('Escape does NOT close an Explorer Bar — that was never XP', async ({
    page,
}) => {
    // Escape-closes-the-bar was invented, not ported, and cost three defects:
    // it reached through an open dialog, collapsed the menu bar and the bar
    // together, and discarded a typed Search query with its results.
    const win = await openMyComputer(page);
    await enterC(win, { first_entry: true });
    await openMenu(win, 'View');
    await pickSub(win, 'Explorer Bar', 'Search');
    const query = win.getByPlaceholder('All or part of a name');
    await query.click();
    await query.fill('Resume');
    await win.getByRole('button', { name: 'Search', exact: true }).click();
    // the panel's own result row, not the same file in the folder listing
    const hit = win.getByRole('button', {
        name: 'Mohamed_Abdelnasser_Resume.pdf',
    });
    await expect(hit).toBeVisible();

    await page.keyboard.press('Escape');
    // the query and its results survive — both are component-local `let`s and
    // died with the panel when Escape closed the bar
    await expect(query).toHaveValue('Resume');
    await expect(hit).toBeVisible();
});

test('Escape closes the menu bar WITHOUT taking the Explorer Bar with it', async ({
    page,
}) => {
    const win = await openMyComputer(page);
    await enterC(win, { first_entry: true });
    await openMenu(win, 'View');
    await pickSub(win, 'Explorer Bar', 'History');
    await expect(win.locator('[data-history-idx]').first()).toBeVisible();

    await openMenu(win, 'View');
    const row = menuRow(win, 'Refresh');
    await expect(row).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(row).toBeHidden(); // the menu closed …
    await expect(win.locator('[data-history-idx]').first()).toBeVisible(); // … the bar did not
});

test('every Explorer Bar can be dismissed from its own caption', async ({
    page,
}) => {
    const win = await openMyComputer(page);
    await enterC(win, { first_entry: true });
    for (const bar of ['Search', 'Favorites', 'History', 'Folders']) {
        await openMenu(win, 'View');
        await pickSub(win, 'Explorer Bar', bar);
        const close = win.locator(`[aria-label="Close ${bar} bar"]`);
        await expect(close).toBeVisible();
        await close.click();
        await expect(close).toHaveCount(0);
    }
});
