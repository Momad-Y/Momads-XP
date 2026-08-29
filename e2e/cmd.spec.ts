import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * CMD (SPECIFICATION.md §3.2). The command layer itself is pure and covered by
 * unit tests; this spec covers what only a browser can show — that xterm
 * mounts, that the readline round-trips real keystrokes, and that the easter
 * eggs can be escaped from.
 */

async function openCmd(page: Page) {
    // Counted BEFORE the click, so the wait below is for one MORE terminal
    // rather than for "a terminal" — CMD is deliberately multi-instance, and a
    // page-wide `.xterm` assertion resolves on the first poll against the
    // terminal that was already there.
    const already_open = await page.locator('.xterm').count();

    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    await flyout.getByText('Command Prompt', { exact: true }).click();
    await expect(page.locator('.xterm')).toHaveCount(already_open + 1, {
        timeout: 20_000,
    });

    // Then wait for actual CONTENT. The banner is written from `on_ready`,
    // which the component defers a frame past the window's open transition, so
    // a read immediately after mount resolved against an empty terminal on a
    // 2-core CI runner.
    await expect
        .poll(async () => screen(page), { timeout: 20_000 })
        .toContain('momad@xp:~$');
}

/**
 * Everything on the NEWEST terminal's screen, as plain text.
 *
 * `.last()` is not defensive tidying. A bare `page.locator('.xterm-rows')`
 * resolves to two elements the moment a second terminal mounts, and every read
 * through it then throws a strict-mode violation — which is how `openCmd`
 * failed on CI. It passed almost everywhere because the poll normally won the
 * race against the second terminal's dynamic xterm import and so saw exactly
 * one element; a loaded 2-core runner loses that race.
 *
 * Newest is last: windows are appended to `#work-space` in creation order.
 */
async function screen(page: Page): Promise<string> {
    return page.locator('.xterm-rows').last().innerText();
}

async function run(page: Page, line: string) {
    // Same reason as `screen`: typing must go to the newest terminal, and a
    // page-wide textarea locator throws once a second one exists.
    await page.locator('.xterm-helper-textarea').last().fill('');
    await page.keyboard.type(line);
    await page.keyboard.press('Enter');
}

test('opens with the §3.2 banner and a prompt', async ({ page }) => {
    await bootToDesktop(page);
    await openCmd(page);

    await expect
        .poll(async () => screen(page), { timeout: 20_000 })
        .toContain("Welcome to Momad's XP Terminal");

    const text = await screen(page);
    expect(text).toContain("Type 'help' to see available commands.");
    expect(text).toContain('momad@xp:~$');

    // The banner must NOT advertise the Phase 6 filesystem commands. §3.2's
    // original third line said "try 'ls' or 'cd experience'", which would have
    // pointed every visitor at two commands that answer "not available yet".
    expect(text).not.toContain("try 'ls'");
    expect(text).not.toContain('cd experience');
});

test('runs commands and sources their output from profile.json', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openCmd(page);

    await run(page, 'whoami');
    await expect.poll(async () => screen(page)).toContain('momad');

    await run(page, 'echo Hello World');
    // Verbatim, case preserved — lookup is case-sensitive like bash, but
    // arguments pass through untouched.
    await expect.poll(async () => screen(page)).toContain('Hello World');
});

test('an unknown command answers in bash wording, not cmd.exe', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openCmd(page);

    await run(page, 'notacommand');
    // Polled, not read once: the write is asynchronous relative to the
    // keypress, so a bare read races the terminal.
    await expect
        .poll(async () => screen(page))
        .toContain('notacommand: command not found');
    // §3.2 line 1 specifies "bash emulation, not Windows cmd".
    expect(await screen(page)).not.toContain('is not recognized');
});

test('deferred filesystem commands say so instead of failing', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openCmd(page);

    await run(page, 'ls');
    await expect.poll(async () => screen(page)).toContain('not available yet');
    expect(await screen(page)).not.toContain('command not found');
});

test('history recall and line editing work through real keystrokes', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openCmd(page);

    await run(page, 'whoami');
    // Up must recall the previous line into the prompt.
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => screen(page)).toContain('momad@xp:~$ whoami');

    // Backspace must edit it, proving the readline is driving the display and
    // not just echoing.
    await page.keyboard.press('Backspace');
    await expect.poll(async () => screen(page)).toContain('momad@xp:~$ whoam');
});

test('clear wipes the screen but keeps the prompt', async ({ page }) => {
    await bootToDesktop(page);
    await openCmd(page);

    await run(page, 'echo marker-text');
    await expect.poll(async () => screen(page)).toContain('marker-text');

    await run(page, 'clear');
    await expect.poll(async () => screen(page)).not.toContain('marker-text');
    await expect.poll(async () => screen(page)).toContain('momad@xp:~$');
});

test('a FINITE easter egg can be escaped by any key, twice in a row', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openCmd(page);

    // `hack`, not `matrix`: the two eggs now have deliberately different exit
    // policies. `hack` is finite, so any key skips it; `matrix` runs until
    // interrupted and answers only to Ctrl+C, which its own test covers.
    //
    // Run, cancel, run again, cancel again. The second half is the point: a
    // cancellation latch that does not reset leaves the terminal permanently
    // deaf, and this repo has a scar from exactly that shape
    // (`rename_cancelled`).
    for (let i = 0; i < 2; i++) {
        const marker = `escaped-${String(i)}`;
        await run(page, 'hack');
        await page.waitForTimeout(400);
        await page.keyboard.press('x');

        // A UNIQUE marker, not the prompt. Asserting `toContain('momad@xp:~$')`
        // was satisfied by the banner's own prompt still in the viewport, so
        // the test passed even with cancellation disabled entirely — the exact
        // `rename_cancelled` shape its comment cites.
        await run(page, `echo ${marker}`);
        await expect
            .poll(async () => screen(page), { timeout: 10_000 })
            .toContain(marker);
    }
});

test('hack runs its script, and the whole line follows the accent', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openCmd(page);

    await run(page, 'color #ff8800');
    await expect
        .poll(async () => screen(page))
        .toContain('Accent colour set to #ff8800');

    await run(page, 'hack');
    // Polled on the TAG, not on the step text: the tag is written after the
    // last dot, so waiting for the text alone read the line mid-animation and
    // saw a single dot.
    await expect
        .poll(async () => screen(page), { timeout: 20_000 })
        .toContain('FOUND');

    // xterm merges runs of cells that share their attributes into ONE span, so
    // a step whose dots carry the accent arrives as a single span containing
    // both the text and the dots. That is the whole assertion: the dots used to
    // be written bare, which put them in a span of their own at the default
    // foreground while the text beside them followed `color`.
    const step = await page.locator('.xterm-rows').evaluate((root) => {
        for (const el of Array.from(root.querySelectorAll('span'))) {
            const text = el.textContent ?? '';
            if (text.includes('Locating mainframe')) {
                return { text, color: getComputedStyle(el).color };
            }
        }
        return null;
    });

    expect(step, 'no span carried the step text').not.toBeNull();
    expect(step?.text).toContain('...... FOUND');
    expect(step?.color).toBe('rgb(255, 136, 0)');

    // Escapable like every other egg — this one runs for about ten seconds,
    // so a visitor who cannot interrupt it is stuck watching.
    await page.keyboard.press('x');
    await run(page, 'echo hack-escaped');
    await expect
        .poll(async () => screen(page), { timeout: 10_000 })
        .toContain('hack-escaped');
});

test('matrix fills the screen, rains until Ctrl+C, and follows the accent', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openCmd(page);

    await run(page, 'color #ff8800');
    await expect
        .poll(async () => screen(page))
        .toContain('Accent colour set to #ff8800');

    // The terminal's REAL width, measured from the banner BEFORE the rain
    // starts — deliberately NOT derived from the thing under test. xterm does
    // not pad its DOM rows, so a rendered row is exactly as wide as whatever
    // was written into it; measuring the rain's rows against each other passes
    // just as happily when the rain covers 70 columns of an 83-column
    // terminal. It did, which is why this measurement is here.
    const cols = await page
        .locator('.xterm-rows')
        .last()
        .evaluate((root) => {
            const span = root.querySelector('span');
            const screen = root.parentElement;
            if (!span || !screen) return 0;
            const text = span.textContent ?? '';
            const cell = span.getBoundingClientRect().width / text.length;
            return Math.round(screen.getBoundingClientRect().width / cell);
        });
    expect(cols).toBeGreaterThan(70);

    await run(page, 'matrix');

    // The intro names the only way out BEFORE the keyboard is trapped. If this
    // ever stops appearing, the egg becomes a dead end for anyone who does not
    // already know the convention.
    await expect
        .poll(async () => screen(page), { timeout: 20_000 })
        .toContain('There is only Ctrl+C');

    // Past the intro pause and well past the 60 frames the old egg stopped at.
    await page.waitForTimeout(4_000);

    const grid = await page
        .locator('.xterm-rows')
        .last()
        .evaluate((root) => {
            const rows = Array.from(root.children).map(
                (r) => r.textContent ?? '',
            );
            const accents = new Set<string>();
            for (const el of Array.from(root.querySelectorAll('span'))) {
                if ((el.textContent ?? '').trim().length > 0) {
                    accents.add(getComputedStyle(el).color);
                }
            }
            return {
                rows,
                // The rightmost column that actually carries a glyph.
                reach: Math.max(...rows.map((r) => r.trimEnd().length)),
                accents: Array.from(accents),
            };
        });

    // FULL SCREEN, which is the whole point of the rewrite: every row of the
    // grid carries glyphs. The original wrote one 70-column row per frame and
    // scrolled it, so the top of the terminal stayed empty.
    expect(grid.rows.length).toBeGreaterThan(10);
    const lit = grid.rows.filter((r) => r.trim().length > 0);
    expect(lit.length).toBe(grid.rows.length);
    // And it spans the terminal's REAL width, not a hardcoded 70.
    expect(grid.reach).toBeGreaterThanOrEqual(cols - 2);

    // Head and trail both resolve through the one palette slot `color`
    // repaints, so the rain is in the accent rather than the default green.
    expect(grid.accents).toContain('rgb(255, 136, 0)');
    expect(grid.accents).not.toContain('rgb(0, 255, 0)');

    // Still raining: the frame must differ a moment later.
    const before = await screen(page);
    await page.waitForTimeout(600);
    expect(await screen(page)).not.toBe(before);

    // An ordinary key is SWALLOWED. The egg is infinite on purpose and says so.
    await page.keyboard.press('x');
    await page.waitForTimeout(600);
    expect(await screen(page)).not.toContain('momad@xp:~$');

    // Ctrl+C, and only Ctrl+C, gives the terminal back.
    await page.keyboard.press('Control+c');
    await expect
        .poll(async () => screen(page), { timeout: 10_000 })
        .toContain('momad@xp:~$');

    await run(page, 'echo matrix-escaped');
    await expect
        .poll(async () => screen(page), { timeout: 10_000 })
        .toContain('matrix-escaped');
});

test('help advertises python, and it is not a dead entry', async ({ page }) => {
    // §1b's no-dead-entries standard. The session itself needs the real runtime
    // and so is covered by the @online specs; what belongs here is that the
    // command is discoverable and that asking for it does not open a second
    // window.
    await bootToDesktop(page);
    await openCmd(page);

    await run(page, 'help');
    await expect.poll(async () => screen(page)).toContain('python');
    expect(await screen(page)).not.toContain('python: command not found');
});

test('sudo refuses, using the name from profile.json', async ({ page }) => {
    await bootToDesktop(page);
    await openCmd(page);

    await run(page, 'sudo rm -rf /');
    await expect
        .poll(async () => screen(page))
        .toContain('is not in the sudoers file');
});

test('two terminals can be open at once', async ({ page }) => {
    // CMD is deliberately multi-instance, unlike the Python REPL which owns a
    // multi-megabyte runtime.
    await bootToDesktop(page);
    await openCmd(page);
    await openCmd(page);
    await expect(page.locator('#work-space .window')).toHaveCount(2);
    // Count the TERMINALS, not just the windows: openCmd's
    // `expect(.xterm).toBeVisible()` resolves on the first poll, when only the
    // first terminal exists, so the second was never waited for or observed.
    await expect(page.locator('.xterm')).toHaveCount(2, { timeout: 20_000 });

    // Reading a terminal must keep working while two are open. This is the
    // deterministic form of a failure that used to surface as a flake: a
    // page-wide `.xterm-rows` locator throws a strict-mode violation here every
    // single time, and `openCmd` only escaped it by usually reading before the
    // second terminal had mounted.
    await expect
        .poll(async () => screen(page), { timeout: 20_000 })
        .toContain('momad@xp:~$');

    // And they must CASCADE rather than land pixel-identical. Registry apps
    // were mounted without `options.id`, so calc_nudges found no sibling and
    // both windows opened at the same coordinates.
    const first = await page
        .locator('#work-space .window')
        .nth(0)
        .boundingBox();
    const second = await page
        .locator('#work-space .window')
        .nth(1)
        .boundingBox();
    if (!first || !second) throw new Error('window has no bounding box');
    expect(second.x).not.toBe(first.x);
    expect(second.y).not.toBe(first.y);
});

test('exit and Ctrl+D each close the terminal', async ({ page }) => {
    await bootToDesktop(page);
    await openCmd(page);
    await expect(page.locator('#work-space .window')).toHaveCount(1);

    await run(page, 'exit');
    await expect(page.locator('#work-space .window')).toHaveCount(0);

    // Ctrl+D on an EMPTY line does the same, as in any shell.
    await openCmd(page);
    await page.locator('.xterm-helper-textarea').last().click();
    await page.keyboard.press('Control+d');
    await expect(page.locator('#work-space .window')).toHaveCount(0);
});

test('Ctrl+D mid-line does NOT close the terminal', async ({ page }) => {
    // The other half: CPython and this shell ignore Ctrl+D while there is text
    // on the line, and closing the window under someone mid-type would be the
    // worst possible reading of the key.
    await bootToDesktop(page);
    await openCmd(page);
    await page.locator('.xterm-helper-textarea').last().click();
    await page.keyboard.type('some text');
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(300);
    await expect(page.locator('#work-space .window')).toHaveCount(1);
    await expect.poll(async () => screen(page)).toContain('some text');
});

test('color repaints the accent, including existing scrollback', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openCmd(page);

    /** The rendered colour of the prompt, read from the DOM. */
    const promptColour = async () =>
        page.evaluate(() => {
            const spans = [
                ...document.querySelectorAll('.xterm-rows span'),
            ] as HTMLElement[];
            const el = spans.find((s) => s.textContent?.includes('momad@xp'));
            return el ? getComputedStyle(el).color : null;
        });

    const before = await promptColour();
    expect(before).not.toBeNull();

    await run(page, 'color #ff8800');
    await expect.poll(async () => screen(page)).toContain('#ff8800');

    // The BANNER's prompt — printed long before the command ran — must have
    // repainted too. That is the point of rewriting the palette slot rather
    // than colouring new output: cmd.exe's `color` recolours the console, not
    // just what comes next.
    await expect.poll(promptColour).not.toBe(before);
    await expect.poll(promptColour).toBe('rgb(255, 136, 0)');

    await run(page, 'color reset');
    await expect.poll(promptColour).toBe(before);
});

test('color refuses black, and the terminal keeps working', async ({
    page,
}) => {
    await bootToDesktop(page);
    await openCmd(page);

    await run(page, 'color #000000');
    await expect.poll(async () => screen(page)).toContain('genius');

    // Nothing was applied, and the prompt still responds.
    await run(page, 'echo still-here');
    await expect.poll(async () => screen(page)).toContain('still-here');
});
