import { test, expect } from '@playwright/test';

test.describe('mobile portrait (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('renders the full-content portfolio', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText("Momad's XP — AI Engineer")).toBeVisible({
            timeout: 15_000,
        });
        await expect(
            page.getByRole('heading', { name: 'Mohamed Abdelnasser' }),
        ).toBeVisible();

        // ≥1 Experience entry
        await page.getByRole('button', { name: 'Experience' }).click();
        await expect(page.getByText('AI Engineer — Printerpix')).toBeVisible();

        // ≥1 Skills group
        await page.getByRole('button', { name: 'Skills' }).click();
        await expect(page.getByText('AI & Machine Learning')).toBeVisible();

        // resume download + socials
        await expect(page.locator('a[download]')).toHaveAttribute(
            'href',
            '/assets/Mohamed_Abdelnasser_Resume.pdf',
        );
        await expect(
            page.locator('a[href="https://github.com/Momad-Y"]'),
        ).toBeVisible();
    });
});

test.describe('mobile landscape (844x390)', () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test('shows the rotate prompt', async ({ page }) => {
        await page.goto('/');
        await expect(
            page.getByText('Rotate to portrait for the mobile experience'),
        ).toBeVisible({ timeout: 15_000 });
        // the desktop shell must NOT have booted
        await expect(page.locator('#start-menu-btn')).toHaveCount(0);
    });
});
