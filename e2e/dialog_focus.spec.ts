import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * Escape belongs to the FOCUSED window's dialog, not to any dialog on screen.
 *
 * Dialog.svelte was the one window-level keydown consumer in the app without a
 * z-index guard — every other one already checks
 * `window?.z_index === $zIndex`. It ranked only against OTHER dialogs, so it
 * answered Escape no matter which window had focus.
 *
 * Phase 3 is what makes that reachable: Escape is a routine keystroke at a
 * terminal prompt, not a rare one. session-handoff.md §8 rule 2 names
 * "handlers each deciding in isolation" as the root cause of three shipped
 * defects, and §8 rule 2 also records that Escape must NOT be repurposed.
 */
test('Escape at a terminal prompt does not cancel a background dialog', async ({
    page,
}) => {
    await bootToDesktop(page);

    // 1. An Explorer window with a modal open (the one-time File Transfer
    //    guide, which appears on first folder entry).
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const explorer = page.locator('#work-space .window').first();
    await expect(explorer).toBeVisible({ timeout: 15_000 });
    await explorer.getByText('Local Disk (C:)').dblclick();
    const dialog = explorer.locator('.dialog');
    await expect(dialog).toBeVisible();

    // 2. Open a SECOND window on top. The dialog is now in a background one.
    //
    // Deliberately not a terminal: xterm consumes Escape on its own textarea,
    // so a terminal cannot demonstrate this — verified by mutation, where a
    // terminal-based version of this test passed even with the guard removed.
    // A second Explorer is the honest reproduction.
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    await flyout.getByText('My Computer', { exact: true }).click();
    await expect(page.locator('#work-space .window')).toHaveCount(2);

    // 3. Escape while the SECOND window has focus.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // The background dialog must still be open. Without the guard it is gone.
    await expect(dialog).toBeVisible();
});

test('Escape still cancels a dialog in the FOCUSED window', async ({
    page,
}) => {
    // The other half: the guard must not break the behaviour it protects.
    // §8 rule 2 — Escape IS Cancel on the topmost dialog.
    await bootToDesktop(page);

    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const explorer = page.locator('#work-space .window').first();
    await expect(explorer).toBeVisible({ timeout: 15_000 });
    await explorer.getByText('Local Disk (C:)').dblclick();
    const dialog = explorer.locator('.dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
});
