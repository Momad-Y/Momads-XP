import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * Back was unusable on any site that redirects. The proxy follows redirects
 * and the injected reporter announces where it LANDED, which the parent used
 * to append as a fresh history entry — so Back returned to the URL that
 * redirects, which redirected again and re-appended its destination. The user
 * never left the page. google.com -> www.google.com is the everyday case.
 *
 * `/api/browse` is stubbed so the redirect is deterministic and no network is
 * involved; the stub mimics exactly what the real proxy injects.
 */

const REQUESTED = 'https://google.com/';
const LANDED = 'https://www.google.com/';

/** The proxy's own injection, reduced to what this test needs. */
function proxied_page(landed: string, requested: string, body: string) {
    return `<html><head><base href="${landed}"><script>
      parent.postMessage({__momadxp:1,type:'navigated',url:${JSON.stringify(
          landed,
      )},requested:${JSON.stringify(requested)}},'*');
    <\/script></head><body>${body}</body></html>`;
}

/**
 * Only REQUESTED redirects. Everything else — the homepage included — answers
 * as itself. Redirecting every proxied page made the homepage's own address
 * equal to LANDED, so the Back assertion below compared a string to itself and
 * passed with the bug still in place.
 */
async function stub_browse(page: Page) {
    await page.route('**/api/browse**', async (route) => {
        const asked =
            new URL(route.request().url()).searchParams.get('url') ?? '';
        const landed = asked === REQUESTED ? LANDED : asked;
        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: proxied_page(landed, asked, `STUB PAGE FOR ${landed}`),
        });
    });
}

async function openIE(page: Page) {
    await bootToDesktop(page);
    await page
        .locator('#work-space p', { hasText: 'Internet Explorer' })
        .dblclick();
    const ie = page.locator('#work-space .window').first();
    await expect(ie).toBeVisible();
    await expect(ie.locator('input').first()).toHaveValue(/\S/);
    return ie;
}

test('Back leaves a site that redirected on the way in', async ({ page }) => {
    // every /api/browse call answers as if google.com 301'd to www.google.com
    await stub_browse(page);

    const ie = await openIE(page);
    const addr = ie.locator('input').first();
    const home = await addr.inputValue();

    await addr.click();
    await addr.fill(REQUESTED);
    await addr.press('Enter');

    // the address bar follows the redirect …
    await expect(addr).toHaveValue(LANDED, { timeout: 15000 });

    // … but the redirect is ONE step, so Back returns to the homepage rather
    // than to the URL that redirects
    // IE's Back RButton carries a title, not a tooltip_message
    await ie
        .locator('div.p-2', { has: page.getByText('Back', { exact: true }) })
        .first()
        .click();
    await expect(addr).toHaveValue(home, { timeout: 15000 });

    // and it stays there — the old bug re-appended on every attempt, so the
    // address bar snapped straight back to the site
    await page.waitForTimeout(1200);
    await expect(addr).toHaveValue(home);
});

test('a redirect does not pile up entries in the Back dropdown', async ({
    page,
}) => {
    await stub_browse(page);

    const ie = await openIE(page);
    const addr = ie.locator('input').first();
    await addr.click();
    await addr.fill(REQUESTED);
    await addr.press('Enter');
    await expect(addr).toHaveValue(LANDED, { timeout: 15000 });

    // one visit, one step back: the trail must not contain BOTH the URL that
    // was asked for and the one it landed on
    const arrow = ie
        .locator('div.p-2', { has: page.getByText('Back', { exact: true }) })
        .locator('div.w-\\[10px\\]');
    await arrow.click();
    const menu = ie.locator('div.absolute.z-30').first();
    await expect(menu).toBeVisible();
    await expect(menu.getByText(REQUESTED)).toHaveCount(0);
    await expect(menu.locator('div')).toHaveCount(1);
});

/*
 * NOT tested here: wiby's "surprise me" meta-refresh hop. `page.route` cannot
 * reach it — the fetch happens SERVER-side in /api/browse, so a spec written
 * this way silently hits the live internet and lands on a different random
 * page every run. It is covered deterministically in
 * src/routes/api/browse/server.test.ts, where `fetch` itself is stubbed.
 */
