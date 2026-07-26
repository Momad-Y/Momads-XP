import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('corrupted saved window rect is clamped on restore', async ({ page }) => {
    await bootToDesktop(page);

    // Simulate the legacy bug: a persisted rect with a negative top (title
    // bar off-screen) and a size larger than any workspace.
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
        await new Promise<void>((resolve, reject) => {
            const tx = db
                .transaction('keyval', 'readwrite')
                .objectStore('keyval')
                .put(
                    { top: -120, left: -50, width: 5000, height: 5000 },
                    './programs/pdf_viewer.svelte',
                );
            tx.onsuccess = () => {
                resolve();
            };
            tx.onerror = () => {
                reject(new Error('idb put failed'));
            };
        });
    });

    await page.locator('#work-space p', { hasText: 'My CV' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();

    const winBox = await win.boundingBox();
    const workspace = await page.locator('#work-space').boundingBox();
    if (!winBox || !workspace) throw new Error('missing bounding boxes');

    // fully inside the workspace: title-bar buttons reachable
    expect(winBox.y).toBeGreaterThanOrEqual(0);
    expect(winBox.x).toBeGreaterThanOrEqual(0);
    expect(winBox.y + winBox.height).toBeLessThanOrEqual(workspace.height + 1);
    expect(winBox.x + winBox.width).toBeLessThanOrEqual(workspace.width + 1);

    // and the close button actually works
    await win.locator('.titlebar').getByRole('button').last().click();
    await expect(win).toBeHidden();
});
