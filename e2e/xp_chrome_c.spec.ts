import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

async function openMyComputer(page: Page) {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    await expect(page.locator('#work-space .window').first()).toBeVisible();
}

test('Folders button shows a tree that navigates', async ({ page }) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    await win.locator('[tooltip="Folders"]').first().click();

    // root entries in the tree
    const tree = win.locator('div[role="treeitem"]');
    await expect(tree.filter({ hasText: 'Local Disk (C:)' })).toBeVisible();
    await expect(tree.filter({ hasText: 'Experience' }).first()).toBeVisible();

    // clicking a portfolio folder in the tree navigates the viewer into it
    await tree.filter({ hasText: 'Experience' }).first().click();
    // File Transfer guide may appear on first folder entry
    const guide = win.locator('.dialog').getByText('OK');
    if (await guide.count()) await guide.click();
    await expect(win.getByText('Printerpix — AI Engineer.txt')).toBeVisible();
});

test('Search button finds files by name', async ({ page }) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    await win.locator('[tooltip="Search"]').first().click();

    // click before typing: fill() focuses without dispatching a click, so it
    // can drive a path no user can reach (see e2e/favorites.spec.ts)
    await win.getByPlaceholder('All or part of a name').click();
    await win.getByPlaceholder('All or part of a name').fill('Resume');
    // the panel's own Search button, not the toolbar one
    await win.getByRole('button', { name: 'Search' }).click();

    await expect(win.getByText('Mohamed_Abdelnasser_Resume.pdf')).toBeVisible();

    // a nonsense query yields the empty state
    await win.getByPlaceholder('All or part of a name').click();
    await win.getByPlaceholder('All or part of a name').fill('zzzznope');
    await win.getByRole('button', { name: 'Search' }).click();
    await expect(win.getByText('No items match your search.')).toBeVisible();
});
