import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('Explorer view modes switch the layout', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    // enter C: for a folder with files
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);

    async function pickView(mode: string) {
        await win
            .locator('.toolbar-menu')
            .getByText('View', { exact: true })
            .click();
        await win.getByText(mode, { exact: true }).click();
    }

    // Details: header columns appear
    await pickView('Details');
    await expect(win.getByText('Type', { exact: true })).toBeVisible();
    await expect(win.getByText('Size', { exact: true })).toBeVisible();
    await expect(win.getByText('PDF File')).toBeVisible();

    // Icons: the Details header is gone
    await pickView('Icons');
    await expect(win.getByText('Type', { exact: true })).toBeHidden();

    // Thumbnails: still shows the items (larger)
    await pickView('Thumbnails');
    await expect(win.getByText('Mohamed_Abdelnasser_Resume.pdf')).toBeVisible();
});

test('view modes are greyed at the My Computer root, where they do nothing', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();

    const row = (name: string) =>
        win
            .locator('p', { hasText: new RegExp(`^${name}$`) })
            .first()
            .locator('..');
    const modes = ['Thumbnails', 'Tiles', 'Icons', 'List', 'Details'];

    // the root renders a fixed layout, so the modes change nothing there
    await win
        .locator('.toolbar-menu')
        .getByText('View', { exact: true })
        .click();
    await expect(row('Icons')).toBeVisible();
    for (const mode of modes) {
        await expect(row(mode)).toHaveClass(/text-slate-400/);
    }
    // …and the Views toolbar button is greyed too
    await expect(win.locator('[tooltip="Views"]').first()).toContainText('', {
        timeout: 5000,
    });
    expect(
        await win.locator('[tooltip="Views"]').first().innerHTML(),
    ).toContain('grayscale');

    // inside a real folder they all come alive again
    await page.mouse.click(1150, 700);
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    await win
        .locator('.toolbar-menu')
        .getByText('View', { exact: true })
        .click();
    await expect(row('Icons')).toBeVisible();
    for (const mode of modes) {
        await expect(row(mode)).not.toHaveClass(/text-slate-400/);
    }
    expect(
        await win.locator('[tooltip="Views"]').first().innerHTML(),
    ).not.toContain('grayscale');
});
