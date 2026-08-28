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
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    await flyout.getByText('Command Prompt', { exact: true }).click();
    // xterm renders into a canvas/rows structure; .xterm-rows is the text
    // layer. Waiting for `.xterm` to be VISIBLE is not enough: the banner is
    // written from `on_ready`, which the component defers a frame past the
    // window's open transition, so a read immediately after this resolved
    // against an empty terminal on a 2-core CI runner. Wait for actual
    // CONTENT, which is the thing every caller goes on to assert about.
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 20_000 });
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText(), {
            timeout: 20_000,
        })
        .toContain('momad@xp:~$');
}

/** Everything currently on screen, as plain text. */
async function screen(page: Page): Promise<string> {
    return page.locator('.xterm-rows').innerText();
}

async function run(page: Page, line: string) {
    await page.locator('.xterm-helper-textarea').fill('');
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

test('an easter egg can be escaped, twice in a row', async ({ page }) => {
    await bootToDesktop(page);
    await openCmd(page);

    // Run, cancel, run again, cancel again. The second half is the point: a
    // cancellation latch that does not reset leaves the terminal permanently
    // deaf, and this repo has a scar from exactly that shape
    // (`rename_cancelled`).
    for (let i = 0; i < 2; i++) {
        const marker = `escaped-${String(i)}`;
        await run(page, 'matrix');
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
    await page.locator('.xterm-helper-textarea').click();
    await page.keyboard.press('Control+d');
    await expect(page.locator('#work-space .window')).toHaveCount(0);
});

test('Ctrl+D mid-line does NOT close the terminal', async ({ page }) => {
    // The other half: CPython and this shell ignore Ctrl+D while there is text
    // on the line, and closing the window under someone mid-type would be the
    // worst possible reading of the key.
    await bootToDesktop(page);
    await openCmd(page);
    await page.locator('.xterm-helper-textarea').click();
    await page.keyboard.type('some text');
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(300);
    await expect(page.locator('#work-space .window')).toHaveCount(1);
    await expect.poll(async () => screen(page)).toContain('some text');
});
