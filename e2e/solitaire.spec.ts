import { expect, test } from '@playwright/test';
import { bootToDesktop, openFromStartMenu } from './helpers';

test('Solitaire deals a Klondike tableau and draws from the stock', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Solitaire');

    const win = page.locator('#work-space .window', { hasText: 'Solitaire' });
    await expect(win).toBeVisible();

    // 1+2+3+4+5+6+7, with exactly one face up per column.
    await expect(win.locator('.sol-tableau .sol-card')).toHaveCount(28);
    await expect(win.locator('.sol-tableau .sol-card.sol-face-up')).toHaveCount(
        7,
    );
    await expect(win.locator('.sol-waste .sol-card')).toHaveCount(0);

    await win.locator('.sol-stock').click();
    await expect(win.locator('.sol-waste .sol-card')).toHaveCount(1);
    await expect(win.locator('.sol-waste .sol-card')).toHaveClass(
        /sol-face-up/,
    );
});

test('Solitaire honours prefers-reduced-motion', async ({ page }) => {
    /*
     * The flag is now READ BY SOMETHING. It previously sat on the felt with no
     * consumer at all — no CSS, no JS, and no win animation to suppress — so
     * this test asserted a dead attribute and would have passed with the whole
     * concern unimplemented, which it was.
     *
     * `start_bounce()` returns immediately when it is set, so the cascade
     * never launches and the static "You won" panel stands alone. The cascade
     * itself is unit-tested in `cascade.test.ts`: winning a game of Klondike
     * from an E2E is not practical, which is precisely why the physics lives
     * in `src/lib` rather than in the component.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Solitaire');

    const win = page.locator('#work-space .window', { hasText: 'Solitaire' });
    await expect(win.locator('.sol-felt')).toHaveAttribute(
        'data-reduced-motion',
        'true',
    );
    // No card is ever in flight under reduced motion.
    await expect(win.locator('.sol-bounce')).toHaveCount(0);
});

test('Solitaire moves a card to a foundation on double-click', async ({
    page,
}) => {
    /*
     * DEALS UNTIL AN ACE IS EXPOSED, rather than hoping for one.
     *
     * The deal is unseeded, and P(no ace among the seven face-up cards) is
     * about 43% — so the previous version skipped the assertion entirely on
     * nearly half of CI runs, silently. Redealing is bounded and makes the
     * feature exercised every time.
     */
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Solitaire');
    const win = page.locator('#work-space .window', { hasText: 'Solitaire' });
    const ace = win.locator(
        '.sol-tableau .sol-card.sol-face-up[data-rank="1"]',
    );

    let dealt = 0;
    while ((await ace.count()) === 0) {
        expect(
            dealt++,
            'no ace exposed in 40 deals — the deal is not random',
        ).toBeLessThan(40);
        await win.getByText('Game', { exact: true }).click();
        await win
            .locator('.xp-menu-dropdown')
            .getByText('Deal', { exact: true })
            .click();
        await expect(win.locator('.sol-tableau .sol-card')).toHaveCount(28);
    }

    await expect(win.locator('.sol-foundation .sol-card')).toHaveCount(0);
    await ace.first().dblclick();
    await expect(win.locator('.sol-foundation .sol-card')).toHaveCount(1);
});
