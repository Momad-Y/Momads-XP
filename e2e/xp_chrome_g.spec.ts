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

test('a selection in another window is not deleted by this one', async ({
    page,
}) => {
    // the CRITICAL: `selectingItems` spans surfaces, and the victim's
    // highlight is focus-gated, so the user cannot see what they destroyed
    const win_a = await openMyComputer(page);
    await enterC(win_a, { first_entry: true });
    await win_a.getByText('Mohamed_Abdelnasser_Resume.pdf').click();

    const win_b = await openSecondExplorer(page);
    await enterC(win_b, { first_entry: false });

    // Ctrl+click in B ADDS to the global selection that A already holds
    await win_b
        .getByText('Mohamed_Abdelnasser_Resume.pdf')
        .click({ modifiers: ['Control'] });

    // deleting from B's File menu must act on B's items only, and the prompt
    // must name one file rather than "and 1 other item"
    await openMenu(win_b, 'File');
    await menuRow(win_b, 'Delete').click();
    const prompt = win_b.locator('.dialog');
    await expect(prompt).toBeVisible();
    await expect(prompt).not.toContainText('other item');
    await prompt.getByText('Cancel').click();
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
    await expect(row.locator('[data-cell="size"]')).toHaveText(/KB|MB|GB/);
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
    await expect(win.getByText(/^[\d.]+ (KB|MB|GB)$/)).toBeVisible();
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

    // Refresh is NOT a no-op here: it re-enumerates and the list comes back
    await openMenu(win, 'View');
    await menuRow(win, 'Refresh').click();
    await expect(win.getByText('Local Disk (C:)')).toBeVisible();
    await expect(win.getByText('Files Stored on This Computer')).toBeVisible();

    // the Favorites bar's Add... is greyed where the menu entry is greyed
    await openMenu(win, 'View');
    await pickSub(win, 'Explorer Bar', 'Favorites');
    await expect(win.getByRole('button', { name: 'Add...' })).toBeDisabled();
});

test('F5 does not refresh underneath an open modal', async ({ page }) => {
    const win = await openMyComputer(page);
    await enterC(win, { first_entry: true });
    await openMenu(win, 'View');
    await menuRow(win, 'Choose Details\\.\\.\\.').click();
    await expect(win.locator('[data-column="date_created"]')).toBeVisible();

    await page.keyboard.press('F5');
    // the modal owns the keyboard: it survives and the list is untouched
    await expect(win.locator('[data-column="date_created"]')).toBeVisible();
    await expect(win.getByText('working on it...')).toHaveCount(0);
});

test('Escape closes an open Explorer Bar, like its own X does', async ({
    page,
}) => {
    const win = await openMyComputer(page);
    await enterC(win, { first_entry: true });
    await openMenu(win, 'View');
    await pickSub(win, 'Explorer Bar', 'History');
    await expect(win.locator('[data-history-idx]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(win.locator('[data-history-idx]')).toHaveCount(0);
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
