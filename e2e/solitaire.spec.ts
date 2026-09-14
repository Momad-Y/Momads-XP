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

test('Solitaire moves a run by dragging it', async ({ page }) => {
    /*
     * THE INTERACTION NOBODY TESTED, and the one that was broken.
     *
     * Solitaire's only other way to move a card is double-click-to-foundation,
     * which the test above covers — so the suite was green while dragging, the
     * primary way anyone plays Klondike, did nothing at all.
     *
     * The cause was that a card is an `<img>`, and an `<img>` is natively
     * draggable: pressing one and moving started the browser's own HTML5 drag,
     * which fires `pointercancel` at (0, 0) and tore down the pointer sequence
     * before the drop was ever hit-tested. The card lifted, followed the
     * cursor, then snapped back. `draggable="false"` is the fix.
     *
     * Re-deals until a legal tableau-to-tableau move exists rather than
     * pinning a seed: the deal is random, and about a third of them open with
     * no such move. Thirty deals without one is not a thing that happens.
     */
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Solitaire');
    const win = page.locator('#work-space .window', { hasText: 'Solitaire' });
    await expect(win).toBeVisible();

    const piles = win.locator('[data-drop="tableau"]');
    const tops = async (): Promise<(string | null)[]> =>
        win.evaluate((el: HTMLElement) =>
            [...el.querySelectorAll('[data-drop="tableau"]')].map((pile) => {
                const images = [...pile.querySelectorAll('img')];
                const last = images[images.length - 1];
                return last == null
                    ? null
                    : (last.getAttribute('src') ?? '')
                          .split('/')
                          .pop()!
                          .replace('.png', '');
            }),
        );

    const rank = (card: string): number =>
        ({ A: 1, J: 11, Q: 12, K: 13 })[card[0] ?? ''] ??
        (card.startsWith('10') ? 10 : Number(card[0]));
    const is_red = (card: string): boolean =>
        card.includes('H') || card.includes('D');

    const legal_move = (
        board: (string | null)[],
    ): { from: number; to: number; card: string } | null => {
        for (let from = 0; from < 7; from++) {
            for (let to = 0; to < 7; to++) {
                const a = board[from];
                const b = board[to];
                if (from === to || a == null || b == null) continue;
                if (rank(a) === rank(b) - 1 && is_red(a) !== is_red(b)) {
                    return { from, to, card: a };
                }
            }
        }
        return null;
    };

    let move = legal_move(await tops());
    for (let deal = 0; move == null && deal < 30; deal++) {
        await win.getByText('Game', { exact: true }).click();
        await win.locator('.xp-menu-dropdown').getByText('Deal').click();
        await expect(win.locator('.sol-card').first()).toBeVisible();
        move = legal_move(await tops());
    }
    expect(move, 'thirty deals with no legal tableau move').not.toBeNull();
    const { from, to, card } = move!;

    const source = await piles
        .nth(from)
        .locator('.sol-card')
        .last()
        .boundingBox();
    const target = await piles
        .nth(to)
        .locator('.sol-card')
        .last()
        .boundingBox();
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();

    await page.mouse.move(source!.x + source!.width / 2, source!.y + 15);
    await page.mouse.down();
    // Two moves: the first is what used to trigger the native image drag.
    await page.mouse.move(source!.x + source!.width / 2 + 15, source!.y + 40, {
        steps: 5,
    });
    await page.mouse.move(
        target!.x + target!.width / 2,
        target!.y + target!.height - 8,
        { steps: 10 },
    );
    await page.mouse.up();

    await expect.poll(async () => (await tops())[to]).toBe(card);
    expect(
        (await tops())[from],
        'the dragged card was copied rather than moved',
    ).not.toBe(card);
});
