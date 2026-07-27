import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

async function openMyComputer(page: Page) {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    await expect(page.locator('#work-space .window').first()).toBeVisible();
}

/**
 * Enter a root folder and dismiss the inherited one-time "File Transfer"
 * guide dialog that mounts over the Explorer on first folder entry (each
 * test runs in a fresh browser context, so it appears every time).
 */
async function enterFolder(page: Page, name: string) {
    const win = page.locator('#work-space .window').first();
    await win.getByText(name, { exact: true }).dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    return win;
}

test('Explorer root lists the six portfolio folders', async ({ page }) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    for (const name of [
        'Experience',
        'Projects',
        'Education',
        'Skills',
        'Certifications',
        'Awards',
    ]) {
        await expect(win.getByText(name, { exact: true })).toBeVisible();
    }
});

test('root-view items highlight on selection', async ({ page }) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    const drive = win.getByText('Local Disk (C:)');
    await drive.click();
    await expect(drive).toHaveClass(/bg-blue-600/);
    const folder = win.getByText('Experience', { exact: true });
    await folder.click();
    await expect(folder).toHaveClass(/bg-blue-600/);
    await expect(drive).not.toHaveClass(/bg-blue-600/);
});

test('an experience entry opens a detail window with bullets', async ({
    page,
}) => {
    await openMyComputer(page);
    const win = await enterFolder(page, 'Experience');
    await win.getByText('Printerpix — AI Engineer.txt').dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(
        detail.getByText('AI Engineer', { exact: true }),
    ).toBeVisible();
    await expect(detail.getByText(/9 international markets/)).toBeVisible();
});

test('a project entry shows tech chips and link', async ({ page }) => {
    await openMyComputer(page);
    const win = await enterFolder(page, 'Projects');
    await win.getByText("Momad's XP.txt").dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(detail.getByText('SvelteKit', { exact: true })).toBeVisible();
    await expect(detail.getByText('Visit project')).toBeVisible();
});

test('an uploaded (local) txt file opens and shows its content', async ({
    page,
}) => {
    await bootToDesktop(page);
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
        await put(
            'e2eUploadedTxtBlob0001',
            new Blob(['hello from an uploaded file'], {
                type: 'text/plain',
            }),
        );
        const drive = await get('hard_drive');
        const DESKTOP = 'nt1QdU9Sws26H26UNQZcQU';
        drive['e2eUploadedTxt0000001'] = {
            id: 'e2eUploadedTxt0000001',
            type: 'file',
            name: 'notes.txt',
            basename: 'notes',
            ext: '.txt',
            storage_type: 'local',
            url: 'e2eUploadedTxtBlob0001',
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
        desktop.children = [...desktop.children, 'e2eUploadedTxt0000001'];
        await put('hard_drive', drive);
    });
    await page.reload();
    await bootToDesktop(page);

    await page.locator('#work-space p', { hasText: 'notes.txt' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win.getByText('hello from an uploaded file')).toBeVisible({
        timeout: 10000,
    });
});

test('a stale uppercase-extension upload opens after boot migration', async ({
    page,
}) => {
    await bootToDesktop(page);
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
        await put(
            'e2eUpperTxtBlob00001',
            new Blob(['CASE INSENSITIVE'], { type: 'text/plain' }),
        );
        const drive = await get('hard_drive');
        const DESKTOP = 'nt1QdU9Sws26H26UNQZcQU';
        // pre-fix upload shape: extension stored case-preserved
        drive['e2eUpperTxt0000000001'] = {
            id: 'e2eUpperTxt0000000001',
            type: 'file',
            name: 'NOTES.TXT',
            basename: 'NOTES',
            ext: '.TXT',
            storage_type: 'local',
            url: 'e2eUpperTxtBlob00001',
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
        desktop.children = [...desktop.children, 'e2eUpperTxt0000000001'];
        await put('hard_drive', drive);
    });
    await page.reload();
    await bootToDesktop(page);

    await page.locator('#work-space p', { hasText: 'NOTES.TXT' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win.getByText('CASE INSENSITIVE')).toBeVisible({
        timeout: 10000,
    });
});

test('an education entry shows honors', async ({ page }) => {
    await openMyComputer(page);
    const win = await enterFolder(page, 'Education');
    await win
        .getByText(/Arab Academy for Science.*\.txt/)
        .first()
        .dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(detail.getByText('Excellent with Honors')).toBeVisible();
});
