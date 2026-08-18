import { test, expect, type Locator, type Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * Explorer's View menu beyond the five view modes: Toolbars, Status Bar,
 * Explorer Bar, Choose Details..., Go To and Refresh — every one of which used
 * to be permanently greyed.
 */

/** Open My Computer and step into C:, dismissing the one-time transfer guide. */
async function openDriveC(page: Page): Promise<Locator> {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    return win;
}

/** Click a top-level menu-bar entry (the dropdown stays open on hover). */
async function openMenu(win: Locator, name: string): Promise<void> {
    await win.locator('.toolbar-menu').getByText(name, { exact: true }).click();
}

/** A row of an open dropdown, scoped to the menu bar. */
function menuRow(win: Locator, name: string): Locator {
    return win
        .locator('.toolbar-menu')
        .locator('p', { hasText: new RegExp(`^${name}$`) })
        .first()
        .locator('..');
}

/** A row of a hover-flyout submenu (View > Toolbars ▸, Explorer Bar ▸, …). */
function subRow(win: Locator, name: string): Locator {
    return win.locator('.group-sub1', {
        has: win.page().locator('p', { hasText: new RegExp(`^${name}$`) }),
    });
}

/** Hover a submenu parent, then click one of its entries. */
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

test('View > Toolbars shows and hides each toolbar row', async ({ page }) => {
    const win = await openDriveC(page);
    const address = win.getByText('Address', { exact: true });
    const back = win.locator('[tooltip="Back to Previous"]').first();

    await expect(address).toBeVisible();
    await expect(back).toBeVisible();

    await openMenu(win, 'View');
    await pickSub(win, 'Toolbars', 'Address Bar');
    await expect(address).toBeHidden();
    await expect(back).toBeVisible(); // the other row is untouched

    await openMenu(win, 'View');
    await pickSub(win, 'Toolbars', 'Standard Buttons');
    await expect(back).toBeHidden();

    // and back on again — the tick reflects the live state
    await openMenu(win, 'View');
    await pickSub(win, 'Toolbars', 'Address Bar');
    await expect(address).toBeVisible();

    // Links starts hidden, like XP, and appears when ticked. The bar's own
    // label is a <span>; the menu entry of the same name is a <p>.
    const links_bar = win.locator('span', { hasText: /^Links$/ });
    await expect(links_bar).toBeHidden();
    await openMenu(win, 'View');
    await pickSub(win, 'Toolbars', 'Links');
    await expect(links_bar).toBeVisible();
});

test('View > Status Bar counts what the folder holds, and toggles off', async ({
    page,
}) => {
    const win = await openDriveC(page);
    const status = win.getByText(/^\d+ objects?$/);
    await expect(status).toBeVisible();

    // selecting an item switches the count to the selection, like XP
    await win.getByText('Mohamed_Abdelnasser_Resume.pdf').click();
    await expect(win.getByText('1 object selected')).toBeVisible();

    await openMenu(win, 'View');
    await menuRow(win, 'Status Bar').click();
    await expect(win.getByText('1 object selected')).toBeHidden();

    await openMenu(win, 'View');
    await menuRow(win, 'Status Bar').click();
    await expect(win.getByText('1 object selected')).toBeVisible();
});

test('View > Explorer Bar opens the Favorites and History bars', async ({
    page,
}) => {
    const win = await openDriveC(page);

    await openMenu(win, 'View');
    await pickSub(win, 'Explorer Bar', 'Favorites');
    await expect(win.getByRole('button', { name: 'Add...' })).toBeVisible();
    await expect(
        win.getByRole('button', { name: 'Organize...' }),
    ).toBeVisible();

    // switching bars replaces the panel rather than stacking
    await openMenu(win, 'View');
    await pickSub(win, 'Explorer Bar', 'History');
    await expect(win.getByRole('button', { name: 'Add...' })).toBeHidden();
    // the trail: My Computer, then C:
    await expect(win.locator('[aria-label="Close History bar"]')).toBeVisible();
    await expect(win.locator('[data-history-idx]')).toHaveCount(2);

    // clicking the first stop walks back to My Computer
    await win.locator('[data-history-idx="0"]').click();
    await expect(win.getByText('Files Stored on This Computer')).toBeVisible();

    // the bar closes from its own X
    await win.locator('[aria-label="Close History bar"]').click();
    await expect(win.locator('[aria-label="Close History bar"]')).toBeHidden();
});

test('View > Choose Details... adds and removes Details columns', async ({
    page,
}) => {
    const win = await openDriveC(page);

    await openMenu(win, 'View');
    await win
        .locator('.toolbar-menu')
        .getByText('Details', { exact: true })
        .click();
    await expect(win.getByText('Type', { exact: true })).toBeVisible();
    await expect(win.getByText('Date Created', { exact: true })).toBeHidden();

    await openMenu(win, 'View');
    await menuRow(win, 'Choose Details\\.\\.\\.').click();
    const dialog = win.locator('[data-column="date_created"]');
    await expect(dialog).toBeVisible();
    await dialog.click();
    await win.locator('[data-column="type"]').click();
    await win.getByText('OK', { exact: true }).click();

    await expect(win.getByText('Date Created', { exact: true })).toBeVisible();
    await expect(win.getByText('Type', { exact: true })).toBeHidden();
});

test('View > Choose Details... Cancel discards, and Name cannot be removed', async ({
    page,
}) => {
    const win = await openDriveC(page);
    await openMenu(win, 'View');
    await win
        .locator('.toolbar-menu')
        .getByText('Details', { exact: true })
        .click();

    await openMenu(win, 'View');
    await menuRow(win, 'Choose Details\\.\\.\\.').click();
    await win.locator('[data-column="date_created"]').click();
    await win.locator('[data-column="name"]').click(); // ignored — Name is fixed
    await win.getByText('Cancel', { exact: true }).click();

    await expect(win.getByText('Date Created', { exact: true })).toBeHidden();
    await expect(win.getByText('Name', { exact: true })).toBeVisible();
});

test('View > Go To navigates, and Refresh keeps the folder listed', async ({
    page,
}) => {
    const win = await openDriveC(page);
    await expect(win.getByText('Mohamed_Abdelnasser_Resume.pdf')).toBeVisible();

    // Refresh really re-reads the folder: it drops back to the loading state
    // and re-sorts. The flash is too brief to poll for, so a MutationObserver
    // installed BEFORE the click records it — the title is just a channel back
    // to the test, since page.evaluate cannot hand out a live JS reference.
    await openMenu(win, 'View');
    await page.evaluate(() => {
        const observer = new MutationObserver(() => {
            if (document.body.textContent?.includes('working on it...')) {
                document.title = 'REFRESH_OBSERVED';
            }
        });
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
        });
    });
    // installed AFTER the menu is open, so the only DOM change it can be
    // reacting to is the Refresh click itself
    expect(await page.title()).not.toBe('REFRESH_OBSERVED');
    await menuRow(win, 'Refresh').click();
    await expect.poll(() => page.title()).toBe('REFRESH_OBSERVED');
    await expect(win.getByText('Mohamed_Abdelnasser_Resume.pdf')).toBeVisible();

    // Go To > Up One Level lands on the My Computer root
    await openMenu(win, 'View');
    await pickSub(win, 'Go To', 'Up One Level');
    await expect(win.getByText('Files Stored on This Computer')).toBeVisible();

    // …and Back returns to C:
    await openMenu(win, 'View');
    await pickSub(win, 'Go To', 'Back');
    await expect(win.getByText('Mohamed_Abdelnasser_Resume.pdf')).toBeVisible();
});
