import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('an uploaded PDF with a missing blob shows an error, not the résumé', async ({
    page,
}) => {
    await bootToDesktop(page);
    // seed a .pdf VFS item whose idb blob does NOT exist (evicted-blob case)
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
        drive['e2eMissingPdf00000001'] = {
            id: 'e2eMissingPdf00000001',
            type: 'file',
            name: 'contract.pdf',
            basename: 'contract',
            ext: '.pdf',
            storage_type: 'local',
            url: 'e2eBlobThatDoesNotExist', // no matching blob → get_url throws
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
        desktop.children = [...desktop.children, 'e2eMissingPdf00000001'];
        await put('hard_drive', drive);
    });
    await page.reload();
    await bootToDesktop(page);

    await page.locator('#work-space p', { hasText: 'contract.pdf' }).dblclick();
    const win = page.locator('#work-space .window').first();
    // shows the connection/error message, NOT a rendered (résumé) canvas
    await expect(win.getByText(/could not be loaded/)).toBeVisible({
        timeout: 15000,
    });
    await expect(win.locator('canvas')).toHaveCount(0);
});

test('a shortcut (.lnk) offers no "Add to archive" (would hang)', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win.getByText('Local Disk (C:)').dblclick();
    await win.locator('.dialog').getByText('OK').click();
    await page.waitForTimeout(450);
    await win.locator('.fs-item', { hasText: 'Experience' }).first().dblclick();
    await page.waitForTimeout(450);
    const entry = win.getByText('Printerpix — AI Engineer.txt');
    await entry.click({ button: 'right' });
    await page
        .locator('.context-menu')
        .getByText('Create Shortcut', { exact: true })
        .click();
    const shortcut = win.getByText('Shortcut to Printerpix — AI Engineer.lnk');
    await expect(shortcut).toBeVisible({ timeout: 15000 });

    // right-click the shortcut → the archive option must be absent
    await shortcut.click({ button: 'right' });
    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Add to archive...')).toHaveCount(0);
});
