import { test, expect } from '@playwright/test';
import { OWNER_NAME } from './helpers';

test('login screen renders branding, instruction, and user card', async ({
    page,
}) => {
    await page.goto('/');
    const card = page.locator('#login-user-card');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(
        page.getByText("To begin, click 'My' user name"),
    ).toBeVisible();
    await expect(page.getByText("Restart Momad's XP")).toBeVisible();
    await expect(card.getByText(OWNER_NAME)).toBeVisible();
    await expect(card.getByText('1337 programs running.')).toBeVisible();
});

test('clicking the user card reaches the desktop through welcome', async ({
    page,
}) => {
    await page.goto('/');
    await page.locator('#login-user-card').click({ timeout: 30_000 });
    await expect(page.locator('#welcome-overlay')).toBeVisible({
        timeout: 15_000,
    });
    await expect(page.locator('#start-menu-btn')).toBeVisible({
        timeout: 30_000,
    });
    await expect(page.locator('#welcome-overlay')).toHaveCount(0, {
        timeout: 10_000,
    });
});
