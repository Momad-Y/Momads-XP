import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Content, read rather than spelled — the project list changes with the CV. */
const FIRST_PROJECT = String(
    (
        JSON.parse(readFileSync('src/lib/data/profile.json', 'utf8')) as {
            projects: { name: string }[];
        }
    ).projects[0]?.name,
);

test.describe('mobile portrait (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('renders the full-content portfolio', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText("Momad's XP — AI Engineer")).toBeVisible({
            timeout: 15_000,
        });
        await expect(
            page.getByRole('heading', { name: 'Mohamed Youssef Abdelnasser' }),
        ).toBeVisible();

        // ≥1 Experience entry
        await page.getByRole('button', { name: 'Experience' }).click();
        await expect(page.getByText('AI Engineer — Printerpix')).toBeVisible();

        // ≥1 Skills group
        await page.getByRole('button', { name: 'Skills' }).click();
        await expect(page.getByText('GenAI & LLM')).toBeVisible();

        // Projects render real entries now (Phase 2 populated profile.projects)
        await page.getByRole('button', { name: 'Projects' }).click();
        await expect(
            page.getByText(FIRST_PROJECT, { exact: true }),
        ).toBeVisible();
        await expect(page.getByText(/coming soon/)).toHaveCount(0);

        // resume download + socials
        await expect(page.locator('a[download]')).toHaveAttribute(
            'href',
            '/assets/CV.pdf',
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
