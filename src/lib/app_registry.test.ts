import { describe, it, expect } from 'vitest';
import {
    APP_REGISTRY,
    find_app,
    singleton_paths,
    to_window_options,
} from './app_registry';
import type { AppDefinition } from './app_registry';

const app = (over: Partial<AppDefinition> = {}): AppDefinition => ({
    id: 'demo',
    path: './programs/demo.svelte',
    title: 'Demo',
    icon: '/images/xp/icons/Default.png',
    component: () => Promise.reject(new Error('not used in this test')),
    ...over,
});

describe('APP_REGISTRY', () => {
    it('has unique ids and unique paths', () => {
        // `path` doubles as the idb key window rects persist under
        // (WindowOptions.exec_path), so a duplicate would make two apps share
        // one saved rect — and a duplicate id would make find_app ambiguous.
        const ids = APP_REGISTRY.map((a) => a.id);
        const paths = APP_REGISTRY.map((a) => a.path);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(paths).size).toBe(paths.length);
    });

    it('every path points at a programs/ specifier', () => {
        for (const a of APP_REGISTRY) {
            expect(a.path).toMatch(/^\.\/programs\/[a-z_]+\.svelte$/);
        }
    });

    it('every app declares a non-empty title and icon', () => {
        // The registry is the sole source of window chrome for registered
        // apps — the components deliberately declare no `options` default —
        // so a blank title here ships a blank title bar.
        for (const a of APP_REGISTRY) {
            expect(a.title.length).toBeGreaterThan(0);
            expect(a.icon.length).toBeGreaterThan(0);
        }
    });
});

describe('find_app', () => {
    it('returns undefined for an unknown or absent path', () => {
        expect(find_app('./programs/nope.svelte')).toBeUndefined();
        expect(find_app(undefined)).toBeUndefined();
    });
});

describe('to_window_options', () => {
    it('maps §6.3 names onto the snake_case fields Window.svelte consumes', () => {
        // The whole point of the translation layer: §6.3 speaks
        // defaultSize/minSize, types.ts speaks width/height/min_width, and
        // nothing else in the codebase bridges them.
        const options = to_window_options(
            app({
                default_size: { width: 640, height: 480 },
                min_size: { width: 320, height: 240 },
            }),
            'inst-1',
        );
        expect(options).toEqual({
            id: 'inst-1',
            title: 'Demo',
            icon: '/images/xp/icons/Default.png',
            exec_path: './programs/demo.svelte',
            resizable: true,
            width: 640,
            height: 480,
            min_width: 320,
            min_height: 240,
        });
    });

    it('carries the INSTANCE id, which Window.svelte needs for three things', () => {
        // `program-id` (taskbar focus exclusion), the minimize animation
        // target, and calc_nudges' sibling comparison. With it undefined, two
        // windows of the same app land pixel-identical instead of cascading —
        // measured before this was fixed.
        expect(to_window_options(app(), 'abc123').id).toBe('abc123');
    });

    it('sets exec_path to the path, never the id', () => {
        // exec_path is the idb key for window-rect persistence. Using `id`
        // here would silently reset every saved rect.
        const options = to_window_options(app({ id: 'not-a-path' }), 'inst-2');
        expect(options.exec_path).toBe('./programs/demo.svelte');
    });

    it('omits size keys entirely when the app declares none', () => {
        // Emitting `width: undefined` would override a component/Window
        // default with undefined rather than leaving it alone.
        const options = to_window_options(app(), 'inst-3');
        expect('width' in options).toBe(false);
        expect('min_width' in options).toBe(false);
    });

    it('defaults resizable to true, so every shipped app is unchanged', () => {
        // The passthrough below is additive. If it ever changes the output for
        // an app that does not ask, it has broken a shipped window.
        for (const existing of APP_REGISTRY) {
            expect(
                to_window_options(existing, 'i1').resizable,
                `${existing.id} changed shape`,
            ).toBe(true);
        }
    });

    it('lets an app opt out of resizing', () => {
        // Minesweeper. XP's is a fixed window that snaps to the board, and
        // `Window.svelte:179` only skips jQuery UI's resizable — which writes
        // inline width/height itself, fighting the `style:width` binding —
        // when this is false.
        expect(
            to_window_options(app({ resizable: false }), 'i1').resizable,
        ).toBe(false);
    });

    it('passes aspect_ratio and maximize_btn through only when set', () => {
        const plain = to_window_options(app(), 'i1');
        expect('aspect_ratio' in plain).toBe(false);
        expect('maximize_btn' in plain).toBe(false);

        // DOOM: DOS video is 4:3, and a stretched frame looks wrong.
        const doom = to_window_options(
            app({ aspect_ratio: 4 / 3, maximize_btn: false }),
            'i2',
        );
        expect(doom.aspect_ratio).toBeCloseTo(4 / 3);
        expect(doom.maximize_btn).toBe(false);
    });
});

describe('singleton_paths', () => {
    it('lists only apps that opted in', () => {
        // Guards the failure this registry exists to prevent: a `singleton`
        // field that type-checks and does nothing because no consumer reads
        // it. work_space's focus_existing() spreads this list.
        const paths = singleton_paths();
        for (const p of paths) {
            const found = APP_REGISTRY.find((a) => a.path === p);
            expect(found?.singleton).toBe(true);
        }
        expect(paths.length).toBe(
            APP_REGISTRY.filter((a) => a.singleton === true).length,
        );
    });
});

describe('component loaders', () => {
    it('every registered app has a callable lazy loader', async () => {
        // Calling it is what proves the specifier is at least syntactically
        // reachable and the field is a function rather than a value someone
        // forgot to wrap. RESOLUTION cannot be asserted here: vitest runs in
        // Node with no Svelte plugin, so importing a `.svelte` module fails by
        // design — that half is covered by e2e actually opening the app.
        for (const a of APP_REGISTRY) {
            const pending = a.component();
            expect(pending).toBeInstanceOf(Promise);
            await pending.catch(() => undefined);
        }
    });

    it('registers CMD as multi-instance', async () => {
        // A second terminal is cheap and useful; the Python REPL will be a
        // singleton because it owns a multi-megabyte runtime. Asserting the
        // difference keeps `singleton` from silently defaulting either way.
        const cmd = find_app('./programs/cmd.svelte');
        expect(cmd).toBeDefined();
        expect(cmd?.singleton).toBe(false);
        await Promise.resolve();
    });
});
