import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/**
 * Boot → login-card click → welcome splash → interactive desktop.
 *
 * The welcome splash overlays the whole desktop (z-50) for ~2.1s: visibility
 * checks on the taskbar pass while clicks would still land on the overlay,
 * so this explicitly waits for the overlay to unmount.
 *
 * By default the boot WAIT is skipped through the app's own affordance — the
 * boot screen skips on any click or keypress once the VFS seed has landed
 * (`starting.svelte`). That is a real user gesture, not a test-only hook.
 *
 * Why: boot sleeps 3s and then loops up to 7 more waiting on assets, so every
 * test paid 3–10s before doing anything. That cost is serialised on CI, which
 * runs only 2 workers, so this is where the saving lands.
 *
 * It is NOT a flake fix. Skipping made local parallel runs slightly WORSE —
 * the sleep had been acting as accidental backpressure — and the suite still
 * flakes about one spec per two or three local runs at any worker count,
 * always passing in isolation. That tracks machine load, not this helper.
 *
 * Pass `{ skip: false }` in specs that exist to TEST the boot sequence itself.
 * Without that, nothing would cover the full startup a real visitor sees.
 */
export async function bootToDesktop(
    page: Page,
    { skip = true }: { skip?: boolean } = {},
): Promise<void> {
    await page.goto('/');

    if (skip) {
        // Wait for the point at which skipping is honoured, then skip. The
        // boot screen ignores the gesture until the seed has landed, so a
        // blind keypress would be a race.
        //
        // `.or(login card)` matters: if boot has already advanced past the
        // screen, waiting on an element that will never attach would hang for
        // the full timeout. Space is harmless at the login screen — its key
        // handlers are on the user card and the restart link, not the window.
        const skippable = page.locator(
            '#boot-screen[data-boot-skippable="true"]',
        );
        const login = page.locator('#login-user-card');
        await expect(skippable.or(login).first()).toBeAttached({
            timeout: 30_000,
        });
        await page.keyboard.press('Space');
    }

    // boot takes >=3s (aesthetic sleep) + asset preloading, then shows login
    await page.locator('#login-user-card').click({ timeout: 30_000 });
    await expect(page.locator('#start-menu-btn')).toBeVisible({
        timeout: 30_000,
    });
    await expect(page.locator('#welcome-overlay')).toHaveCount(0, {
        timeout: 10_000,
    });
}

/*
 * Owner content, read once from profile.json.
 *
 * Specs that assert on the seeded portfolio used to spell these out, so a CV
 * update turned into a dozen red E2Es and taught people to edit tests to match
 * — the opposite of what the assertions are for. What each spec is really
 * about is Explorer, CMD or Search behaviour on a name full of spaces and an
 * em dash, which the first experience entry supplies whatever it says.
 *
 * Read rather than imported: Playwright's loader needs an import attribute for
 * JSON that Vite supplies inside the app but the test runner does not.
 */
const profile_data = JSON.parse(
    readFileSync('src/lib/data/profile.json', 'utf8'),
) as {
    meta: { name: string };
    experience: { company: string; role: string }[];
    skills: Record<string, string[]>;
};

export const OWNER_NAME = profile_data.meta.name;
export const FIRST_SKILL_GROUP = Object.keys(profile_data.skills)[0] ?? '';

/** `Printerpix — Agentic AI Engineer`, as Explorer shows it without `.txt`. */
export const ENTRY_BASENAME = `${profile_data.experience[0]?.company ?? ''} — ${profile_data.experience[0]?.role ?? ''}`;
export const ENTRY_FILE = `${ENTRY_BASENAME}.txt`;
