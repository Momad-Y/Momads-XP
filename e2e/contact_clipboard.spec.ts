import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('toolbar cut, copy and paste operate on the focused field', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'Contact Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();

    const body = win.getByPlaceholder('Write your message here');
    await body.fill('Great site!');
    await body.click();
    await body.evaluate((el) => {
        (el as HTMLTextAreaElement).setSelectionRange(0, 5); // "Great"
    });

    // cut removes the selection and puts it on the clipboard
    await win.locator('[tooltip="Cut"]').click();
    await expect(body).toHaveValue(' site!');

    // paste inserts at the caret (left at the cut position)
    await win.locator('[tooltip="Paste"]').click();
    await expect(body).toHaveValue('Great site!');

    // copy from the subject, paste appended to the body
    const subject = win.getByPlaceholder('Subject of your message');
    await subject.fill('Hello');
    await subject.click();
    await subject.evaluate((el) => {
        (el as HTMLInputElement).select();
    });
    await win.locator('[tooltip="Copy"]').click();
    await body.click();
    await body.evaluate((el) => {
        const t = el as HTMLTextAreaElement;
        t.setSelectionRange(t.value.length, t.value.length);
    });
    await win.locator('[tooltip="Paste"]').click();
    await expect(body).toHaveValue('Great site!Hello');
});
