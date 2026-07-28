import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

/** Builds a minimal valid one-page PDF with a correct xref table. */
function tiny_pdf(): string {
    const objects = [
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n',
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n',
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n',
    ];
    let body = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (const obj of objects) {
        offsets.push(body.length);
        body += obj;
    }
    const xref_pos = body.length;
    let xref = 'xref\n0 4\n0000000000 65535 f \n';
    for (const off of offsets) {
        xref += String(off).padStart(10, '0') + ' 00000 n \n';
    }
    return (
        body +
        xref +
        'trailer<</Size 4/Root 1 0 R>>\nstartxref\n' +
        String(xref_pos) +
        '\n%%EOF'
    );
}

test('an uploaded (local) PDF opens with its own content, not the resume', async ({
    page,
}) => {
    await bootToDesktop(page);

    await page.evaluate(async (pdf_text) => {
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
        const blob = new Blob([pdf_text], { type: 'application/pdf' });
        await put('e2eUploadedPdfBlob0001', blob);
        const drive = await get('hard_drive');
        const DESKTOP = 'nt1QdU9Sws26H26UNQZcQU';
        drive['e2eUploadedPdf0000001'] = {
            id: 'e2eUploadedPdf0000001',
            type: 'file',
            name: 'uploaded.pdf',
            basename: 'uploaded',
            ext: '.pdf',
            storage_type: 'local',
            url: 'e2eUploadedPdfBlob0001',
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
        desktop.children = [...desktop.children, 'e2eUploadedPdf0000001'];
        await put('hard_drive', drive);
    }, tiny_pdf());
    await page.reload();
    await bootToDesktop(page);

    await page.locator('#work-space p', { hasText: 'uploaded.pdf' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win.locator('canvas').first()).toBeVisible({
        timeout: 15000,
    });
    // the tiny PDF is 1 page; the resume is 4 — proves the right file opened
    await expect(win.getByText('1 page', { exact: true })).toBeVisible();
});

test('a failed PDF load shows the connection message and Try Again recovers', async ({
    page,
}) => {
    // simulate a dead connection for the resume asset
    await page.route('**/Mohamed_Abdelnasser_Resume.pdf', (route) =>
        route.abort(),
    );
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My CV' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win.getByText(/weak Internet connection/)).toBeVisible({
        timeout: 15000,
    });

    // connection recovers
    await page.unroute('**/Mohamed_Abdelnasser_Resume.pdf');
    await win.getByText('Try Again').click();
    await expect(win.locator('canvas').first()).toBeVisible({
        timeout: 15000,
    });
});

test('My CV opens the PDF viewer and renders a page', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My CV' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();
    await expect(win.locator('canvas').first()).toBeVisible({
        timeout: 15000,
    });
    await expect(win.getByText(/page/)).toBeVisible();
});
