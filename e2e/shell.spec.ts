import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

// All §3.5 desktop apps are real now — the placeholder tests use the
// start-menu Python entry (Phase 3), the surviving placeholder target.
async function openPythonPlaceholder(page: Page) {
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    await flyout.getByText('Python', { exact: true }).click();
}

test('Python start-menu entry opens the named placeholder', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openPythonPlaceholder(page);

    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();
    await expect(
        win.getByText(
            'Python is under construction — coming in a later phase.',
        ),
    ).toBeVisible();
    await win.getByText('OK').click();
    await expect(win).toBeHidden();
});

test('two rect-less windows cascade instead of stacking', async ({ page }) => {
    await bootToDesktop(page);
    await openPythonPlaceholder(page);
    await expect(page.locator('#work-space .window')).toHaveCount(1);
    await openPythonPlaceholder(page);
    await expect(page.locator('#work-space .window')).toHaveCount(2);

    const first = await page
        .locator('#work-space .window')
        .nth(0)
        .boundingBox();
    const second = await page
        .locator('#work-space .window')
        .nth(1)
        .boundingBox();
    if (!first || !second) throw new Error('window has no bounding box');
    // both placeholders share the same size → identical base, so the second
    // sits exactly one 24px cascade step down-right of the first
    expect(Math.round(second.x - first.x)).toBe(24);
    expect(Math.round(second.y - first.y)).toBe(24);
});

test('a new Text Document opens as an empty page (txt is associated now)', async ({
    page,
}) => {
    await bootToDesktop(page);
    const workspace = page.locator('#work-space');
    await workspace.click({ button: 'right', position: { x: 700, y: 300 } });
    await page.getByText('New', { exact: true }).hover();
    await page.getByText('Text Document', { exact: true }).click();
    // commit the default name (spawns in rename mode; Enter commits, and a
    // plain click elsewhere blurs/commits as a fallback)
    await page.keyboard.press('Enter');
    await workspace.click({ position: { x: 900, y: 500 } });

    await page
        .locator('#work-space p', { hasText: 'New Text Document' })
        .dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();
    await expect(win.locator('.titlebar')).toContainText('New Text Document');
    await expect(page.getByText('Windows cannot open this file')).toBeHidden();
});

test('double-clicking an unassociated file shows the XP dialog', async ({
    page,
}) => {
    await bootToDesktop(page);
    // inject a file with a genuinely unassociated extension
    await page.evaluate(async () => {
        const open = indexedDB.open('keyval-store');
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            open.onsuccess = () => {
                resolve(open.result);
            };
            open.onerror = () => {
                reject(new Error('idb open failed'));
            };
        });
        const put = (key: string, val: unknown) =>
            new Promise<void>((resolve, reject) => {
                const tx = db
                    .transaction('keyval', 'readwrite')
                    .objectStore('keyval')
                    .put(val, key);
                tx.onsuccess = () => {
                    resolve();
                };
                tx.onerror = () => {
                    reject(new Error('idb put failed'));
                };
            });
        const get = (key: string) =>
            new Promise<Record<string, { children: string[] }>>(
                (resolve, reject) => {
                    const tx = db
                        .transaction('keyval')
                        .objectStore('keyval')
                        .get(key);
                    tx.onsuccess = () => {
                        resolve(
                            tx.result as Record<string, { children: string[] }>,
                        );
                    };
                    tx.onerror = () => {
                        reject(new Error('idb get failed'));
                    };
                },
            );
        const drive = await get('hard_drive');
        const DESKTOP = 'nt1QdU9Sws26H26UNQZcQU';
        drive['e2eUnassociated000001'] = {
            id: 'e2eUnassociated000001',
            type: 'file',
            name: 'mystery.xyz',
            basename: 'mystery',
            ext: '.xyz',
            storage_type: 'local',
            url: 'e2eUnassociatedBlob01',
            parent: DESKTOP,
            size: 1,
            children: [],
            date_created: 1,
            date_modified: 1,
            sort_option: 0,
            sort_order: 0,
        } as never;
        const desktop = drive[DESKTOP];
        if (desktop == null) throw new Error('desktop missing');
        desktop.children = [...desktop.children, 'e2eUnassociated000001'];
        await put('hard_drive', drive);
    });
    await page.reload();
    await bootToDesktop(page);

    await page.locator('#work-space p', { hasText: 'mystery.xyz' }).dblclick();
    await expect(
        page.getByText(
            'Windows cannot open this file — no program is associated with it.',
        ),
    ).toBeVisible();
    await page.getByText('OK').click();
});
