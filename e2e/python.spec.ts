import { test, expect } from '@playwright/test';
import type { Frame, Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * The Python REPL (SPECIFICATION.md §3.2) and — more importantly — the
 * isolation that makes it safe to offer at all.
 *
 * The `default` project is HERMETIC: the Pyodide origin is route-stubbed, so
 * no spec running there reaches the internet. Real execution lives in the
 * `@online` project.
 *
 * A bare `npx playwright test` runs BOTH projects — use `--project=default`
 * for a hermetic run. (An earlier version of this comment said the opposite.)
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

/**
 * CMD hosts a session in its OWN window (`python` at the shell prompt).
 *
 * The REPL semantics come from `src/lib/python/repl.ts`, shared with the
 * standalone app and covered by unit tests. What only a browser can show is
 * what this asserts: that it is genuinely the same window, that leaving hands
 * the shell back rather than closing it, and that the two sessions keep
 * separate line histories.
 */
async function openCmd(page: Page) {
    const open = await page.locator('.xterm').count();
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();
    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    await flyout.getByText('Command Prompt', { exact: true }).click();
    await expect(page.locator('.xterm')).toHaveCount(open + 1, {
        timeout: 20_000,
    });
    await expect
        .poll(async () => page.locator('.xterm-rows').last().innerText(), {
            timeout: 20_000,
        })
        .toContain('momad@xp:~$');
}

async function type(page: Page, line: string) {
    await page.locator('.xterm-helper-textarea').last().fill('');
    await page.keyboard.type(line);
    await page.keyboard.press('Enter');
}

async function cmdType(page: Page, line: string) {
    await page.locator('.xterm-helper-textarea').last().fill('');
    await page.keyboard.type(line);
    await page.keyboard.press('Enter');
}

async function cmdScreen(page: Page): Promise<string> {
    return page.locator('.xterm-rows').last().innerText();
}

test('python runs INSIDE the cmd window, and exit() gives the shell back @online', async ({
    page,
}) => {
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openCmd(page);

    // No sandbox frame exists until a session is asked for — the runtime is
    // not loaded just because a terminal is open.
    await expect(
        page.locator('iframe[title="Python runtime (isolated)"]'),
    ).toHaveCount(0);

    // Somewhere other than home first, so exit() has a working directory to
    // give back. A real shell's cwd survives a child process; this is the only
    // coverage `stop_python`'s title/prompt restoration has.
    await type(page, 'cd projects');

    await type(page, 'python');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 120_000 })
        .toContain('Python 3.13');

    // THE POINT OF THE FEATURE: one window, not two.
    await expect(page.locator('#work-space .window')).toHaveCount(1);
    await expect(page.locator('.xterm')).toHaveCount(1);

    await type(page, '2 + 3');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('5');

    // A multi-line block, in the NEW host. This is the shape that was broken
    // for the whole of Phase 3 — a joined block is an IndentationError — so it
    // is asserted wherever a session can run, not only where it was fixed.
    await type(page, 'def f():');
    await type(page, '    return 41');
    await type(page, '');
    await type(page, 'f()');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('41');
    expect(await cmdScreen(page)).not.toContain('IndentationError');

    // exit() ends the interpreter and hands back the SHELL — it does not close
    // the window, which would throw away the shell session with it.
    await type(page, 'exit()');
    // Back in ~/Projects, not at home: the shell was never moved, so restoring
    // a hardcoded `momad@xp:~` would have been a lie about where it is.
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('momad@xp:~/Projects$');
    await expect(page.locator('#work-space .window')).toHaveCount(1);

    // The runtime is released rather than parked in the background.
    await expect(
        page.locator('iframe[title="Python runtime (isolated)"]'),
    ).toHaveCount(0);

    // And the shell is genuinely usable again.
    await type(page, 'echo back-in-the-shell');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('back-in-the-shell');
});

/** The line the cursor is on — i.e. what history recall just put there. */
async function lastLine(page: Page): Promise<string> {
    const text = await cmdScreen(page);
    const lines = text
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((l) => l.trim().length > 0);
    return lines[lines.length - 1] ?? '';
}

/**
 * `/c` — the read-only portfolio filesystem, built before the first prompt.
 *
 * Shipped inside the `init` payload rather than as a later message precisely
 * so this is true at the first prompt: a message cannot arrive before `ready`,
 * because `ready` is how the host learns the runtime exists.
 */
test('/c is mounted, readable, and read-only @online', async ({ page }) => {
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openPython(page);
    await expect
        .poll(async () => cmdScreen(page), { timeout: 120_000 })
        .toContain('Python 3.13');

    // The session STARTS here — no cd, no imports, nothing typed first.
    await type(page, 'import os; print("CWD", os.getcwd())');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('CWD /c');

    // Emscripten's own /tmp is gone, so `/` is the portfolio and not a
    // half-real machine root.
    await type(page, 'print("ROOT", sorted(os.listdir("/")))');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain("'c'");
    expect(await cmdScreen(page)).not.toContain("'tmp'");

    // Plain open(), relative to the working directory, no await, no imports.
    await type(
        page,
        'print("READ", open("Experience/Printerpix — AI Engineer.txt").read()[:20])',
    );
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('READ AI Engineer');

    // Read-only fails LOUDLY. This is honesty, not a security boundary —
    // MEMFS is the worker's own memory — but a silent no-op would be worse
    // than either.
    await type(
        page,
        'try:\n    open("Experience/x.txt","w")\nexcept PermissionError:\n    print("DENIED")',
    );
    await type(page, '');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('DENIED');

    // The outbox is writable, and empty in a fresh profile — the mirror is
    // synthesised from profile.json and never reads the drive, so a returning
    // visitor's saved files are visible to CMD's `ls` but not to Python until
    // they save again.
    await type(page, 'print("OUTBOX", os.listdir("My Documents/Python"))');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('OUTBOX []');
});

/**
 * A forged `save` flood, HERMETICALLY — no Pyodide, no CDN.
 *
 * This is the most important assertion in the feature and it deliberately does
 * NOT go through Python. Pyodide exposes `js.postMessage`, so hostile code
 * never has to touch the filesystem: it posts straight at the host. The
 * writable directory is ergonomics; the message channel is the boundary. And
 * putting the one test that proves the boundary behind a 5 MB CDN download is
 * how it gets skipped the first time it flakes.
 *
 * What it must survive: `desktop.svelte` persists the whole drive on a 1000 ms
 * debounce that it re-arms on EVERY store notification, so an accepted flood
 * would mean the drive is never written to IndexedDB while the app still looks
 * alive.
 */
test('a forged save flood cannot fill the drive or wedge the app', async ({
    page,
}) => {
    await page.route(PYODIDE_GLOB, (route) => route.abort());
    await bootToDesktop(page);
    await openPython(page);

    const frame = await sandboxFrame(page);

    // 500 saves as fast as the thread allows, straight at the host.
    await frame.evaluate(() => {
        for (let i = 0; i < 500; i++) {
            window.parent.postMessage(
                {
                    kind: 'save',
                    files: [{ name: `f${String(i)}.py`, text: 'x' }],
                },
                '*',
            );
        }
    });
    await page.waitForTimeout(3000);

    // The app is still responsive — a starved main thread fails this.
    await expect(page.locator('#work-space .window')).toHaveCount(1);
    await expect(page.locator('.xterm')).toHaveCount(1);

    // And the drive was still WRITTEN. This is the failure the rate gate
    // exists for: desktop.svelte re-arms its 1000 ms whole-drive persist on
    // every store notification, so an accepted flood means IndexedDB is never
    // updated while everything still looks fine.
    const saved: number | null = await page.evaluate(
        () =>
            new Promise<number | null>((resolve) => {
                const open_db = indexedDB.open('keyval-store');
                open_db.onerror = () => resolve(null);
                open_db.onsuccess = () => {
                    const db = open_db.result;
                    const read = db
                        .transaction('keyval', 'readonly')
                        .objectStore('keyval')
                        .get('hard_drive');
                    read.onerror = () => {
                        resolve(null);
                        db.close();
                    };
                    read.onsuccess = () => {
                        const drive: unknown = read.result;
                        db.close();
                        if (typeof drive !== 'object' || drive === null) {
                            resolve(null);
                            return;
                        }
                        const folder: unknown = (
                            drive as Record<string, unknown>
                        )['xpFolderPythonScripts01'];
                        if (typeof folder !== 'object' || folder === null) {
                            resolve(null);
                            return;
                        }
                        const children = (folder as Record<string, unknown>)
                            .children;
                        resolve(
                            Array.isArray(children) ? children.length : null,
                        );
                    };
                };
            }),
    );

    // The drive reached IndexedDB at all...
    expect(saved).not.toBeNull();
    // ...and the 500 forged saves became EXACTLY ONE file. A same-tick burst
    // gets one through the gate and every other message is refused, so this
    // is an exact number rather than a loose bound that would hold for any
    // interval at all.
    expect(saved).toBe(1);
});

/**
 * The whole point of the feature: a script written in Python is still there
 * after the session ends.
 */
test('a saved script persists, updates in place, and CMD can read it @online', async ({
    page,
}) => {
    test.setTimeout(240_000);
    await bootToDesktop(page);
    await openPython(page);
    await expect
        .poll(async () => cmdScreen(page), { timeout: 120_000 })
        .toContain('Python 3.13');

    // Plain open(), no new API.
    await type(
        page,
        'open("My Documents/Python/fib.py","w").write("print(1)"); print("W1")',
    );
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('W1');

    // Rewrite the SAME name. The gate admits one save every 2 s, so give it
    // a beat, then confirm there is exactly ONE file — not fib 2.py.
    await page.waitForTimeout(2500);
    await type(
        page,
        'open("My Documents/Python/fib.py","w").write("print(2)"); print("W2")',
    );
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('W2');
    await page.waitForTimeout(1500);

    // Read it back through CMD — a completely different code path, and the
    // one a visitor tries first.
    await type(page, 'exit()');
    await page.waitForTimeout(1000);
    await openCmd(page);
    await cmdType(page, 'ls "My Documents/Python"');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 20_000 })
        .toContain('fib.py');
    // Exactly one file: iterating on a script must not leave a trail.
    expect((await cmdScreen(page)).match(/fib/g)?.length).toBe(1);

    await cmdType(page, 'cat "My Documents/Python/fib.py"');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 20_000 })
        .toContain('print(2)');
    // The FIRST version is gone — save_file overwrote in place.
    expect(await cmdScreen(page)).not.toContain('print(1)');
});

/**
 * Output from the runtime cannot scribble the terminal.
 *
 * Measured before this landed: `print("\x1b[2J\x1b[H…")` wiped the
 * scrollback, taking earlier output with it. Colour survives on purpose —
 * `theme.ts` records the 16-colour palette as load-bearing because Pyodide's
 * tracebacks are ANSI-coloured.
 */
test('Python output cannot clear the screen, but keeps its colour @online', async ({
    page,
}) => {
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openPython(page);
    await expect
        .poll(async () => cmdScreen(page), { timeout: 120_000 })
        .toContain('Python 3.13');

    await type(page, 'print("MARKER-BEFORE")');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('MARKER-BEFORE');

    await type(page, String.raw`print("\x1b[2J\x1b[H\x1b[1;3rSCRIBBLED")`);
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('SCRIBBLED');

    // The half that matters: earlier output is still there.
    expect(await cmdScreen(page)).toContain('MARKER-BEFORE');

    // And a traceback is still red — the feature the strip-everything
    // alternative would have destroyed.
    await type(page, '1/0');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('ZeroDivisionError');
    const red = await page
        .locator('.xterm-rows')
        .last()
        .evaluate((root) =>
            Array.from(root.querySelectorAll('span'))
                .map((s) => getComputedStyle(s).color)
                .join(' '),
        );
    expect(red).toContain('rgb(');
});

/**
 * A statement that goes quiet says so, rather than looking dead.
 *
 * NOT a watchdog: measured, a busy worker leaves the page at a full 60 fps
 * with the desktop interactive, so nothing is hanging. The visitor just has no
 * way to know Ctrl+C exists.
 */
test('a long-running statement tells you Ctrl+C exists @online', async ({
    page,
}) => {
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openPython(page);
    await expect
        .poll(async () => cmdScreen(page), { timeout: 120_000 })
        .toContain('Python 3.13');

    await type(page, 'while True: pass');
    // The blank line is required: a compound statement is INCOMPLETE on one
    // line, exactly as in CPython's REPL, so without it nothing executes and
    // there is nothing to be busy about. Wait for the continuation prompt
    // before sending it — typing both back to back races the terminal and the
    // block never submits.
    await expect
        .poll(async () => cmdScreen(page), { timeout: 20_000 })
        .toContain('...');
    await type(page, '');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('press Ctrl+C to stop it');

    // The page is fine throughout — that is why this is a hint and not a kill.
    await expect(page.locator('#start-menu-btn')).toBeVisible();

    await page.locator('.xterm-helper-textarea').last().click();
    await page.keyboard.press('Control+C');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 120_000 })
        .toContain('Python 3.13');
});

test('the shell and the interpreter keep separate line histories @online', async ({
    page,
}) => {
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openCmd(page);

    await type(page, 'echo shell-line');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('shell-line');

    await type(page, 'python');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 120_000 })
        .toContain('Python 3.13');

    // Asserted on the CURRENT INPUT LINE, never on the whole screen. The
    // commands typed earlier are still in the scrollback, so a `toContain`
    // over everything matches them and passes no matter what Up-arrow did —
    // which is exactly how a shared-history regression slipped through this
    // test on its first draft.
    await page.locator('.xterm-helper-textarea').last().click();
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);
    // A fresh interpreter has no history at all, so Up-arrow recalls NOTHING.
    // Sharing the shell's ring would offer `python` here.
    expect(await lastLine(page)).toBe('>>>');

    await type(page, 'x = 41');
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowUp');
    await expect
        .poll(async () => lastLine(page), { timeout: 10_000 })
        .toBe('>>> x = 41');

    // Ctrl+C abandons the recalled line without running it.
    await page.keyboard.press('Control+c');
    await type(page, 'exit()');
    await expect
        .poll(async () => cmdScreen(page), { timeout: 30_000 })
        .toContain('momad@xp:~$');

    // The shell's own ring survived, and holds only shell lines: two steps back
    // is `echo shell-line`. A shared ring would have `x = 41` and `exit()`
    // stacked on top, so two steps back would land on `x = 41`.
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    expect(await lastLine(page)).toBe('momad@xp:~$ python');
    await page.keyboard.press('ArrowUp');
    await expect
        .poll(async () => lastLine(page), { timeout: 10_000 })
        .toBe('momad@xp:~$ echo shell-line');
});
