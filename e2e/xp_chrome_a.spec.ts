import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

async function openMyComputer(page: Page) {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    await expect(page.locator('#work-space .window').first()).toBeVisible();
}

test('View System Information opens the funny System Properties', async ({
    page,
}) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    await win.getByText('View System Information').click();
    const sys = page.locator('#work-space .window', {
        hasText: 'System Properties',
    });
    await expect(sys.getByText('Mohamed Abdelnasser')).toBeVisible();
    await expect(sys.getByText(/raw ambition/)).toBeVisible();

    // the other three tabs are implemented too (profile-driven funny content)
    await sys.getByText('Computer Name', { exact: true }).click();
    await expect(sys.getByText('momad-xp.local')).toBeVisible();
    await sys.getByText('Hardware', { exact: true }).click();
    await expect(
        sys.getByText('Caffeine Intake Controller (USB, always-on)'),
    ).toBeVisible();
    await sys.getByText('Advanced', { exact: true }).click();
    await expect(sys.getByText('User Profiles')).toBeVisible();

    await sys.getByText('OK', { exact: true }).click();
    await expect(sys).toBeHidden();
});

test('Create Shortcut makes a working .lnk that opens its target', async ({
    page,
}) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    // navigate into C: then into Experience (unique entry files live there)
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    await win.locator('.fs-item', { hasText: 'Experience' }).first().dblclick();
    await page.waitForTimeout(450);
    const entry = win.getByText('Printerpix — AI Engineer.txt');
    await expect(entry).toBeVisible();

    // right-click the entry file → Create Shortcut (lands beside it)
    await entry.click({ button: 'right' });
    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();
    await menu.getByText('Create Shortcut', { exact: true }).click();
    const shortcut = win.getByText('Shortcut to Printerpix — AI Engineer.lnk');
    await expect(shortcut).toBeVisible({ timeout: 15000 });

    // opening the shortcut opens the target file's detail window
    await shortcut.dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(detail.getByText('AI Engineer', { exact: true })).toBeVisible({
        timeout: 15000,
    });
});

test('File menu > Create Shortcut works in Explorer once an item is selected', async ({
    page,
}) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    await win.locator('.fs-item', { hasText: 'Experience' }).first().dblclick();
    await page.waitForTimeout(450);

    // select an entry, then use the File menu (not the right-click menu)
    const entry = win
        .locator('.fs-item', { hasText: 'Printerpix — AI Engineer.txt' })
        .first();
    await entry.click();
    await win.locator('.toolbar-menu').getByText('File').click();
    await win.getByText('Create Shortcut', { exact: true }).click();

    await expect(
        win.getByText('Shortcut to Printerpix — AI Engineer.lnk'),
    ).toBeVisible({ timeout: 15000 });
});

test('Explorer File menu greys selection-only actions, like XP', async ({
    page,
}) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    await win.locator('.fs-item', { hasText: 'Experience' }).first().dblclick();
    await page.waitForTimeout(450);

    const row = (name: string) =>
        win
            .locator('p', { hasText: new RegExp(`^${name}$`) })
            .first()
            .locator('..');

    await win.locator('.toolbar-menu').getByText('File').click();
    // real XP greys the selection-driven verbs when nothing is selected
    for (const name of ['Open', 'Create Shortcut', 'Delete', 'Rename']) {
        await expect(row(name)).toHaveClass(/text-slate-400/);
    }
    // …while New/Properties/Close stay live
    for (const name of ['New', 'Properties', 'Close']) {
        await expect(row(name)).not.toHaveClass(/text-slate-400/);
    }

    // New ▸ opens its flyout and creates a real file
    await win.locator('p', { hasText: /^New$/ }).first().hover();
    await expect(win.getByText('Text Document')).toBeVisible();
    await win.getByText('Text Document').click();
    await expect(win.getByText('New Text Document.txt')).toBeVisible({
        timeout: 15000,
    });
});

test('Explorer Tools > Folder Options opens', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win.locator('.toolbar-menu').getByText('Tools').click();
    await win.getByText('Folder Options...', { exact: true }).click();
    // .last(): the Explorer window also contains the text "Folder Options..."
    const dlg = page
        .locator('#work-space .window', { hasText: 'Folder Options' })
        .last();
    await expect(dlg.getByText(/defaults were never that good/)).toBeVisible({
        timeout: 15000,
    });
    await dlg.getByText('View', { exact: true }).click();
    await expect(dlg.getByText(/checked in spirit/)).toBeVisible();
    await dlg.getByText('File Types', { exact: true }).click();
    await expect(dlg.getByText(/Paint's finest hour/)).toBeVisible();
});

test('IE Tools > Internet Options opens', async ({ page }) => {
    await bootToDesktop(page);
    await page
        .locator('#work-space p', { hasText: 'Internet Explorer' })
        .dblclick();
    const ie = page.locator('#work-space .window').first();
    await ie.locator('.toolbar-menu').getByText('Tools').click();
    await ie.getByText('Internet Options...', { exact: true }).click();
    const dlg = page
        .locator('#work-space .window', { hasText: 'Internet Options' })
        .last();
    await expect(dlg.getByText(/about:momad/)).toBeVisible({ timeout: 15000 });
    await dlg.getByText('Security', { exact: true }).click();
    await expect(dlg.getByText(/autoplays sound/)).toBeVisible();
    await dlg.getByText('Advanced', { exact: true }).click();
    await expect(dlg.getByText(/careful tinkering/)).toBeVisible();
});

test('IE Mail button opens Contact Me', async ({ page }) => {
    await bootToDesktop(page);
    await page
        .locator('#work-space p', { hasText: 'Internet Explorer' })
        .dblclick();
    const ie = page.locator('#work-space .window').first();
    await expect(ie).toBeVisible();
    await ie.getByText('Mail', { exact: true }).click();
    await expect(
        page.locator('#work-space .window', { hasText: 'Contact Me' }),
    ).toBeVisible();
});
