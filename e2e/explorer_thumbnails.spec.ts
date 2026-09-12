import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { bootToDesktop } from './helpers';

/**
 * Image previews must fit the cell the view mode gives them.
 *
 * Explorer was the only one of `Previewable`'s four call sites that never
 * passed `size`, so every preview rendered at the component's 50px default in
 * all five modes: 50px inside a 32px cell in Icons (spilling 18px over the
 * filename — how this was reported), 50 inside 16 in List and Details
 * (bleeding across rows), 50 inside 48 in Tiles, and 50 inside 80 in
 * Thumbnails, the one mode whose entire purpose is a big preview. A wrapper
 * `<div>` carrying the cell size hid the mismatch from every unit test,
 * because nothing about it is testable without layout.
 *
 * So this measures. Per mode: the icon is square at the size XP uses, it
 * stays inside its item, and it really is the picture rather than a generic
 * .jpg icon at a coincidentally-correct size.
 */

/** XP's icon edge per view mode, in px. */
const ICON_PX = {
    Thumbnails: 80,
    Tiles: 48,
    Icons: 32,
    List: 16,
    Details: 16,
} as const;

interface DriveItem {
    name: string;
    parent?: string | null;
    children: string[];
    type: string;
    ext?: string;
    url?: string;
}

/**
 * The first `My Pictures` folder holding at least two previewable images,
 * found in the seed rather than named here: the portfolio galleries are
 * regenerated from `profile.json` whenever the CV changes, and a spec that
 * spelled out "Robotics Club - AASTMT — …" would go red on content edits that
 * have nothing to do with layout.
 */
function gallery_path(): string {
    const drive = JSON.parse(
        readFileSync('static/json/hard_drive.json', 'utf8'),
    ) as Record<string, DriveItem>;

    const path_of = (id: string): string[] => {
        const parts: string[] = [];
        let cur: DriveItem | undefined = drive[id];
        while (cur != null) {
            parts.unshift(cur.name);
            cur = cur.parent == null ? undefined : drive[cur.parent];
        }
        return parts;
    };

    for (const [id, item] of Object.entries(drive)) {
        if (item.type !== 'folder') continue;
        const images = item.children.filter((child) => {
            const kid = drive[child];
            return kid != null && (kid.ext === '.jpg' || kid.ext === '.png');
        });
        if (images.length < 2) continue;
        const parts = path_of(id);
        if (parts[1] !== 'My Pictures') continue;
        return `${parts[0]}\\${parts.slice(1).join('\\')}`;
    }
    throw new Error('the seed has no My Pictures gallery to measure');
}

async function open_gallery(page: Page): Promise<void> {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    const win = page.locator('#work-space .window').first();
    const addr = win.locator('input').first();
    await addr.click();
    await addr.fill(gallery_path());
    await win.getByRole('button', { name: 'Go' }).click();

    // the one-time File Transfer guide, on first folder entry
    const guide = win.locator('.dialog').getByText('OK');
    await expect(guide).toBeVisible({ timeout: 15000 });
    await guide.click();
    await expect(win.locator('[fs-id]').first()).toBeVisible({
        timeout: 15000,
    });
}

/** Every item's icon box, measured against the item that must contain it. */
async function measure(page: Page): Promise<
    {
        icon_w: number;
        icon_h: number;
        spill_right: number;
        spill_bottom: number;
        background: string;
    }[]
> {
    return await page
        .locator('#work-space .window')
        .first()
        .evaluate((root) =>
            [...root.querySelectorAll('[fs-id]')].map((el) => {
                const icon = el.firstElementChild;
                if (icon == null) throw new Error('item has no icon element');
                const i = icon.getBoundingClientRect();
                const c = el.getBoundingClientRect();
                return {
                    icon_w: Math.round(i.width),
                    icon_h: Math.round(i.height),
                    spill_right: Math.round(i.right - c.right),
                    spill_bottom: Math.round(i.bottom - c.bottom),
                    background: getComputedStyle(icon).backgroundImage,
                };
            }),
        );
}

async function set_view(page: Page, mode: string): Promise<void> {
    const win = page.locator('#work-space .window').first();
    await win.locator('[data-menu="View"]').first().click();
    await page.getByText(mode, { exact: true }).first().click();
    // the preview is loaded by an IntersectionObserver, then swapped in on
    // the Image's own onload — so the picture arrives a frame or two late
    await expect
        .poll(
            async () =>
                (await measure(page)).every((m) => m.icon_w === 0)
                    ? 'empty'
                    : 'laid out',
            { timeout: 10000 },
        )
        .toBe('laid out');
}

for (const [mode, px] of Object.entries(ICON_PX)) {
    test(`${mode} renders image previews at ${px}px, inside their cell`, async ({
        page,
    }) => {
        await open_gallery(page);
        await set_view(page, mode);

        const items = await measure(page);
        expect(items.length).toBeGreaterThan(1);

        for (const item of items) {
            expect(item.icon_w, `${mode}: icon width`).toBe(px);
            expect(item.icon_h, `${mode}: icon height`).toBe(px);
            // <= 0: the icon's right and bottom edges must not pass its item's
            expect(
                item.spill_right,
                `${mode}: icon spills right`,
            ).toBeLessThanOrEqual(0);
            expect(
                item.spill_bottom,
                `${mode}: icon spills over the label`,
            ).toBeLessThanOrEqual(0);
        }
    });
}

test('the preview is the picture itself, not a .jpg icon at the right size', async ({
    page,
}) => {
    await open_gallery(page);
    await set_view(page, 'Thumbnails');

    // Every item in the folder is a seeded portfolio image, which lives under
    // /assets/. A generic file-type icon would come from /images/xp/icons/,
    // so this fails if the previews never resolved at all.
    await expect
        .poll(
            async () =>
                (await measure(page)).filter((m) =>
                    m.background.includes('/assets/'),
                ).length,
            { timeout: 15000 },
        )
        .toBeGreaterThan(1);
});
