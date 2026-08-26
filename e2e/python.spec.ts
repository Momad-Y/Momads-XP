import { test, expect } from '@playwright/test';
import type { Frame, Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * The Python REPL (SPECIFICATION.md §3.2) and — more importantly — the
 * isolation that makes it safe to offer at all.
 *
 * The default suite is HERMETIC: the Pyodide origin is route-stubbed, so no
 * spec here reaches the internet. Real execution lives in the `@online`
 * project, which `npx playwright test` does not run.
 */

const PYODIDE_GLOB = '**/cdn.jsdelivr.net/**';

async function openPython(page: Page) {
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    await flyout.getByText('Python', { exact: true }).click();
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 20_000 });
}

/** The sandbox frame, once it has attached. */
async function sandboxFrame(page: Page): Promise<Frame> {
    const handle = page.locator('iframe[title="Python runtime (isolated)"]');
    await expect(handle).toBeAttached({ timeout: 20_000 });
    const frame = await handle.elementHandle().then((h) => h?.contentFrame());
    if (frame == null) throw new Error('sandbox frame never attached');
    return frame;
}

test('the runtime frame is isolated — no VFS, no origin, no same-origin worker', async ({
    page,
}) => {
    // THIS IS EXIT CRITERION 2's PROOF, and it deliberately does NOT run the
    // probe through Python. Gate 4 showed that version was vacuous three ways:
    // the hermetic suite substitutes a STUB runtime that cannot execute
    // js.fetch; /api/* does not run under `vite preview` at all, so "the fetch
    // failed" is true regardless of isolation; and if the runtime never loads,
    // "no VFS data appeared" passes. Probing the frame's CAPABILITIES directly
    // fails loudly if the frame did not load.
    await page.route(PYODIDE_GLOB, (route) => route.abort());
    await bootToDesktop(page);
    await openPython(page);

    const frame = await sandboxFrame(page);

    const probe = await frame.evaluate(async () => {
        const out: Record<string, string> = {};

        // 1. IndexedDB holds the entire VFS under `hard_drive`.
        try {
            indexedDB.open('probe');
            out.indexeddb = 'ALLOWED';
        } catch (error) {
            out.indexeddb = error instanceof Error ? error.name : 'threw';
        }

        // 2. A same-origin worker script would mean the origin is NOT opaque.
        try {
            new Worker('/probe-worker.js');
            out.worker = 'ALLOWED';
        } catch (error) {
            out.worker = error instanceof Error ? error.name : 'threw';
        }

        // 3. A blob worker MUST still work — it is how the runtime is hosted.
        try {
            const url = URL.createObjectURL(
                new Blob(['self.postMessage(1)'], { type: 'text/javascript' }),
            );
            new Worker(url);
            out.blob_worker = 'ALLOWED';
        } catch {
            out.blob_worker = 'BLOCKED';
        }

        // 4. localStorage is another same-origin store.
        try {
            localStorage.getItem('x');
            out.localstorage = 'ALLOWED';
        } catch (error) {
            out.localstorage = error instanceof Error ? error.name : 'threw';
        }
        return out;
    });

    // The VFS must be unreachable. `location.origin` is deliberately NOT used
    // as the check — it reports the URL's origin while the SECURITY origin is
    // opaque, which is a trap worth naming.
    expect(probe.indexeddb).toBe('SecurityError');
    expect(probe.worker).toBe('SecurityError');
    expect(probe.localstorage).toBe('SecurityError');
    // ...and the mechanism the runtime actually needs must survive.
    expect(probe.blob_worker).toBe('ALLOWED');
});

test('a fetch from the runtime frame carries Origin: null', async ({
    page,
}) => {
    // Both /api/browse and /api/email reject that, which is what removes the
    // "Python drives our own API from a trusted origin" prize. Asserted on a
    // REAL intercepted request, so a missing route is a failure rather than a
    // silent pass.
    await page.route(PYODIDE_GLOB, (route) => route.abort());
    await bootToDesktop(page);
    await openPython(page);
    const frame = await sandboxFrame(page);

    let seen: string | undefined;
    await page.route('**/origin-probe', (route) => {
        seen = route.request().headers().origin;
        return route.fulfill({ status: 204 });
    });

    await frame.evaluate(async () => {
        await fetch('/origin-probe', { method: 'POST', body: 'x' }).catch(
            () => undefined,
        );
    });

    expect(seen).toBe('null');
});

test('shows a legible error when the runtime cannot be fetched', async ({
    page,
}) => {
    // The offline path. A visitor on hotel wifi is a likely first user of this
    // window, and a spinner-forever would be indistinguishable from a hang.
    await page.route(PYODIDE_GLOB, (route) => route.abort());
    await bootToDesktop(page);
    await openPython(page);

    await expect
        .poll(async () => page.locator('.xterm-rows').innerText(), {
            timeout: 30_000,
        })
        .toContain('Python runtime unavailable');

    // The window must stay usable so it can be closed normally.
    await expect(page.locator('#work-space .window').first()).toBeVisible();
});

test('is a singleton — a second launch raises the open window', async ({
    page,
}) => {
    // Each instance owns its own Pyodide runtime: ~5 MB over the wire plus a
    // full CPython heap. Three Start-Menu clicks would be a tab kill on a
    // mid-range phone.
    await page.route(PYODIDE_GLOB, (route) => route.abort());
    await bootToDesktop(page);
    await openPython(page);
    await expect(page.locator('#work-space .window')).toHaveCount(1);

    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    await page
        .locator('#all-programs-flyout')
        .getByText('Python', { exact: true })
        .click();

    await expect(page.locator('#work-space .window')).toHaveCount(1);
});

test('uses the Python icon, not the generic one', async ({ page }) => {
    await page.route(PYODIDE_GLOB, (route) => route.abort());
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(
        flyout.locator('img[src*="Python.png"], [style*="Python.png"]').first(),
    ).toBeAttached();
});

test('runs real Python end to end @online', async ({ page }) => {
    // EXCLUDED from the default suite: it downloads ~5 MB from jsDelivr.
    // Run deliberately with `npx playwright test --project=online`.
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openPython(page);

    // The real banner, from the running interpreter — not a literal.
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText(), {
            timeout: 120_000,
        })
        .toContain('Python 3.13');

    // §3.2's pre-loaded greeting.
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText())
        .toContain("Welcome to Momad's XP");

    // A DISTINCTIVE value, not '4'. A single digit is present in the CPython
    // banner (build date, version) and in "Welcome to Momad's XP", so
    // `toContain('4')` passed no matter what the runtime returned.
    await page.keyboard.type('6 * 7');
    await page.keyboard.press('Enter');
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText(), {
            timeout: 30_000,
        })
        .toContain('42');
});

test('Ctrl+C restarts the interpreter and the prompt comes back @online', async ({
    page,
}) => {
    // THERE WAS NO TEST FOR THIS, which is how it shipped broken.
    // `restart()` called `location.reload()` on the opaque-origin frame;
    // `reload` is not cross-origin-accessible, so merely READING it threw
    // SecurityError, the throw escaped through xterm's onData, and the REPL
    // was dead forever — "Restarting Python…" and then no prompt. The unit
    // test could not see it because it injected a `reload: vi.fn()` stub.
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await bootToDesktop(page);
    await openPython(page);
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText(), {
            timeout: 120_000,
        })
        .toContain('>>>');

    // Define something, then throw the session away.
    await page.keyboard.type('marker = 123');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+c');

    await expect
        .poll(async () => page.locator('.xterm-rows').innerText())
        .toContain('Restarting Python');

    // The interpreter must come BACK, and its state must be GONE.
    //
    // NOT `toContain('Python 3.13')` — the FIRST banner is still on screen, so
    // that assertion is satisfied before the restart even begins. (My own
    // first draft of this test did exactly that and raced.) Asking the new
    // interpreter for the old variable proves both halves at once: a NameError
    // can only come from a live interpreter that no longer has `marker`.
    await expect
        .poll(
            async () => {
                await page.keyboard.type('marker');
                await page.keyboard.press('Enter');
                return page.locator('.xterm-rows').innerText();
            },
            { timeout: 150_000, intervals: [5_000] },
        )
        .toContain('NameError');

    // And no SecurityError escaped to the page.
    expect(errors.filter((e) => e.includes('SecurityError'))).toEqual([]);
});

test('runs a MULTI-LINE block — the continuation path @online', async ({
    page,
}) => {
    // THE TEST WHOSE ABSENCE LET THE BUG SHIP.
    //
    // The component used to send the whole accumulated block on every line,
    // but PyodideConsole.push() appends to its OWN buffer and re-joins
    // (console.py: `self.buffer.append(line); source = "\n".join(self.buffer)`).
    // So the second line double-concatenated and every def/if/for raised
    // IndentationError, and the function was never defined. The only
    // real-execution test typed `2 + 2`, so nothing saw it.
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openPython(page);
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText(), {
            timeout: 120_000,
        })
        .toContain('>>>');

    await page.keyboard.type('def answer():');
    await page.keyboard.press('Enter');
    // The continuation prompt must appear — that is the `incomplete` status
    // coming back from CPython's own codeop.
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText())
        .toContain('...');

    await page.keyboard.type('    return 6 * 7');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // blank line closes the block

    await page.keyboard.type('answer()');
    await page.keyboard.press('Enter');

    const screen = await expect
        .poll(async () => page.locator('.xterm-rows').innerText(), {
            timeout: 30_000,
        })
        .toContain('42');
    void screen;

    // And no traceback: a broken continuation surfaces as IndentationError or
    // NameError, both of which would still leave '42' absent — but assert it
    // explicitly so the failure names itself.
    const text = await page.locator('.xterm-rows').innerText();
    expect(text).not.toContain('IndentationError');
    expect(text).not.toContain('NameError');
});

test('exit() closes the window instead of dumping a SystemExit traceback @online', async ({
    page,
}) => {
    // Pyodide has no process to exit, so `exit()` raised SystemExit and dumped
    // a six-frame traceback through webloop/asyncio/console internals — which
    // reads as a crash rather than "the interpreter closed".
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openPython(page);
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText(), {
            timeout: 120_000,
        })
        .toContain('>>>');

    await page.keyboard.type('exit()');
    await page.keyboard.press('Enter');
    await expect(page.locator('#work-space .window')).toHaveCount(0);
});

test('Ctrl+C at an IDLE prompt keeps the session @online', async ({ page }) => {
    // The behaviour this fixes: Ctrl+C used to terminate and respawn the
    // worker unconditionally, so pressing it out of habit to clear a line
    // silently destroyed every variable the visitor had defined. CPython
    // prints KeyboardInterrupt and keeps going.
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openPython(page);
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText(), {
            timeout: 120_000,
        })
        .toContain('>>>');

    await page.keyboard.type('keep_me = 99');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1_000);

    await page.keyboard.press('Control+c');
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText())
        .toContain('KeyboardInterrupt');
    // NOT a restart: no second banner.
    const text = await page.locator('.xterm-rows').innerText();
    expect(text).not.toContain('Restarting Python');

    // And the variable is still there — the whole point.
    await page.keyboard.type('keep_me');
    await page.keyboard.press('Enter');
    await expect
        .poll(async () => page.locator('.xterm-rows').innerText(), {
            timeout: 20_000,
        })
        .toContain('99');
});
