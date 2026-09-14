/**
 * Central app registry (SPECIFICATION.md §6.3).
 *
 * WHY THIS EXISTS: `work_space.svelte`'s `launch()` is a 20-branch if-chain on
 * a path string, and it has **no `else`** — a mistyped path is a silent no-op
 * with no window, no console error and no failing test. Adding an app also
 * means remembering five things inside its branch (`exec_path`, the
 * `runningPrograms.update`, singleton membership, props shape, the dynamic
 * import), and the existing branches are NOT uniform: `display_properties`,
 * `properties`, `disk_properties` and `copier` omit the taskbar registration
 * entirely. "A rule applied at one call site while its siblings are left
 * alone" is this repo's most-repeated defect, now at eight instances.
 *
 * §6.3 has always mandated this file. Phase 3 introduces it for the three new
 * apps only; the existing 20 branches are untouched, and finishing the
 * migration is Phase 6 work. Two mechanisms coexist until then — deliberately,
 * because migrating every shipped launch path inside a feature phase is a far
 * larger regression surface than the feature itself.
 *
 * THIS IS A TRANSLATION LAYER, not a redefinition. None of §6.3's field names
 * exist in the code: `types.ts` has `min_width`/`min_height`/`width`/`height`
 * (snake_case scalars), there is no `minSize`, no `defaultSize`, and no
 * `singleton` field anywhere — singleton is currently a path-string array in
 * `work_space.svelte`. `to_window_options()` below is the whole mapping, in
 * one place, so the two vocabularies cannot drift silently.
 */
import type { Component } from 'svelte';
import type { ProgramInstance, VfsItem, WindowOptions } from './types';
import { TERMINAL_MIN_HEIGHT, TERMINAL_MIN_WIDTH } from './term/theme';
import { PRESETS, window_size } from './games/minesweeper/difficulty';

/**
 * The props every program component accepts. Mirrors what the inherited
 * `launch()` branches already pass; declared here so the registry is typed
 * rather than `any`-shaped (`no-explicit-any` is an error over `src/`).
 */
export interface ProgramProps {
    id: string;
    parentNode?: HTMLElement;
    fs_item?: VfsItem;
    exec_path?: string;
    get_self?: () => ProgramInstance | null;
    options?: WindowOptions;
}

/** A mountable program: props in, `ProgramInstance` exports out. */
export type ProgramComponent = Component<ProgramProps, ProgramInstance>;

export interface AppDefinition {
    /** Stable id. Distinct from `path`, which doubles as the window-rect key. */
    id: string;
    /**
     * The `./programs/*.svelte` specifier. This IS the launch key and also the
     * idb key window rects persist under (`WindowOptions.exec_path`), so it
     * cannot be replaced by `id` without silently resetting every saved rect.
     */
    path: string;
    title: string;
    icon: string;
    /** Lazy import — keeps each app out of the entry bundle. */
    component: () => Promise<{ default: ProgramComponent }>;
    default_size?: { width: number; height: number };
    min_size?: { width: number; height: number };
    /**
     * Only one instance may exist; launching again raises the open one.
     * Read by `focus_existing()`, so it is real behaviour rather than a field
     * that merely type-checks.
     */
    singleton?: boolean;
    /**
     * Register in `runningPrograms` (taskbar button, z-order, and the desktop's
     * `a_window_is_focused` guard). Defaults to true — omitting it is what
     * four of the inherited branches got wrong, and the desktop's Ctrl+C guard
     * depends on it.
     */
    taskbar?: boolean;
    /**
     * Window chrome. These exist because `to_window_options()` below hardcoded
     * `resizable: true` and the object it returns REPLACES the component's own
     * `options` default wholesale (see the comment on that function), so a
     * registered app had no way to be anything else. That blocked Minesweeper,
     * which is a fixed-size window in XP, and DOOM, which is 4:3.
     *
     * All three are optional and the defaults reproduce the previous output
     * exactly — `app_registry.test.ts` asserts that for every shipped app.
     */
    resizable?: boolean;
    aspect_ratio?: number;
    maximize_btn?: boolean;
}

/**
 * Phase 3 apps. Rows are added by each app's own task (T4b), never here, so a
 * registry entry and the component it points at land in the same commit —
 * `svelte-check` resolves dynamic import specifiers, so a row for a file that
 * does not exist yet is a build error.
 */
export const APP_REGISTRY: readonly AppDefinition[] = [
    {
        id: 'cmd',
        path: './programs/cmd.svelte',
        title: 'momad@xp:~',
        icon: '/images/xp/icons/CommandPrompt.png',
        component: () => import('../routes/xp/programs/cmd.svelte'),
        default_size: { width: 720, height: 460 },
        min_size: { width: TERMINAL_MIN_WIDTH, height: TERMINAL_MIN_HEIGHT },
        // Multi-instance on purpose: a second terminal is cheap and genuinely
        // useful, unlike the Python REPL which owns a multi-megabyte runtime.
        singleton: false,
    },
    {
        id: 'python',
        path: './programs/python.svelte',
        title: 'Python',
        // Python.png ships in the icon set and was unused; the Start Menu
        // passed the generic ApplicationWindow.png. §3.2 asks for "Python
        // branding" and the right icon was simply never wired up.
        icon: '/images/xp/icons/Python.png',
        component: () => import('../routes/xp/programs/python.svelte'),
        default_size: { width: 720, height: 460 },
        min_size: { width: TERMINAL_MIN_WIDTH, height: TERMINAL_MIN_HEIGHT },
        // SINGLETON, unlike CMD. Each instance owns its own Pyodide runtime:
        // ~5 MB over the wire plus a full CPython heap, so three Start-Menu
        // clicks is a tab kill on a mid-range phone.
        singleton: true,
    },
    {
        id: 'music_player',
        path: './programs/music_player.svelte',
        title: 'Windows Media Player',
        icon: '/images/xp/icons/WindowsMediaPlayer9.png',
        component: () => import('../routes/xp/programs/music_player.svelte'),
        default_size: { width: 480, height: 470 },
        min_size: { width: 400, height: 460 },
        // SINGLETON: it owns the audio output and the visualiser's
        // AudioContext. Two copies would talk over each other, and XP's own
        // Media Player is single-instance.
        singleton: true,
    },
    {
        id: 'minesweeper',
        path: './programs/minesweeper.svelte',
        title: 'Minesweeper',
        icon: '/assets/icons/minesweeper.png',
        component: () => import('../routes/xp/programs/minesweeper.svelte'),
        /*
         * `default_size` IS LOAD-BEARING, and omitting it is not a style
         * choice. `work_space.svelte` mounts a registered app with an explicit
         * `options` prop from `to_window_options()`, and Svelte replaces a
         * component's own default wholesale rather than merging — so
         * `minesweeper.svelte`'s `options` default never runs on this path.
         * Without these two lines the window gets no width or height at all,
         * `Window.svelte` skips its clamp because both are null, and the
         * template renders `style:width="undefinedpx"`: invalid CSS, dropped
         * silently, leaving the window to shrink-wrap its grid.
         *
         * Imported from the game's own module so the board geometry has one
         * source of truth; the component reassigns `options` from the same
         * helper when the difficulty changes.
         */
        default_size: window_size(PRESETS.beginner),
        min_size: window_size(PRESETS.beginner),
        // Fixed, like XP's — the window snaps to the board rather than being
        // dragged. Also what keeps jQuery UI's resizable from attaching and
        // fighting the `style:width` binding (Window.svelte:179).
        resizable: false,
        maximize_btn: false,
        // Multi-instance: pure DOM, owns no runtime. Contrast Chess and DOOM.
        singleton: false,
    },
    {
        id: 'solitaire',
        path: './programs/solitaire.svelte',
        title: 'Solitaire',
        icon: '/assets/icons/solitaire.png',
        component: () => import('../routes/xp/programs/solitaire.svelte'),
        default_size: { width: 700, height: 520 },
        min_size: { width: 620, height: 470 },
        // Multi-instance, same reasoning as Minesweeper: pure DOM.
        singleton: false,
    },
    {
        id: 'chess',
        path: './programs/chess.svelte',
        title: 'Chess',
        icon: '/assets/icons/chess.png',
        component: () => import('../routes/xp/programs/chess.svelte'),
        // Sized to the content: 352px board plus controls, status and the
        // move list. 620 left a third of the window empty.
        default_size: { width: 460, height: 516 },
        min_size: { width: 400, height: 440 },
        /*
         * SINGLETON, unlike Minesweeper and Solitaire. Each instance owns a
         * Stockfish worker and its WASM heap — the same reasoning as Python's
         * above, not Minesweeper's.
         */
        singleton: true,
    },
    {
        id: 'doom',
        path: './programs/doom.svelte',
        title: 'DOOM',
        icon: '/assets/icons/doom.png',
        component: () => import('../routes/xp/programs/doom.svelte'),
        default_size: { width: 640, height: 512 },
        min_size: { width: 320, height: 280 },
        // DOS video is 4:3; a stretched frame looks wrong, and this is the
        // reason `aspect_ratio` exists on AppDefinition at all.
        aspect_ratio: 4 / 3,
        /*
         * SINGLETON: each instance is a full x86 emulator plus its WASM heap
         * and an AudioContext. Two would contend for CPU with nothing gained.
         */
        singleton: true,
    },
];

export function find_app(path: string | undefined): AppDefinition | undefined {
    if (path == null) return undefined;
    return APP_REGISTRY.find((a) => a.path === path);
}

/**
 * Map an `AppDefinition` onto the shape `Window.svelte` actually consumes.
 *
 * For a REGISTERED app this object REPLACES the component's own `options`
 * default wholesale — Svelte does not merge a passed prop with its default.
 * So everything Window.svelte needs must be produced here. The components do
 * still declare a default (it is what they use when mounted outside the
 * registry path), and an earlier version of this comment claimed they did not,
 * which is what hid the missing `id` from review.
 */
export function to_window_options(
    app: AppDefinition,
    /**
     * The instance id. NOT optional in practice — `Window.svelte` needs it for
     * three separate behaviours and silently degrades all three without it:
     *   - `program-id={options.id}` (Window.svelte) is how `click_outside`
     *     excludes the window's own taskbar tile; absent, clicking that tile
     *     makes the window lose focus.
     *   - the minimize animation targets `.program-tile[program-id="…"]`;
     *     absent, it matches nothing and the window flies to the page centre.
     *   - `calc_nudges` compares `el.options.id != options.id`; with both
     *     undefined that is false, so no sibling is found and two windows land
     *     PIXEL-IDENTICAL instead of cascading.
     * Measured: two Command Prompts both opened at top:155px left:280px.
     */
    id: string,
): WindowOptions {
    const options: WindowOptions = {
        id,
        title: app.title,
        icon: app.icon,
        exec_path: app.path,
        // Registry apps are resizable unless they say otherwise. The
        // components cannot declare this themselves — this object replaces
        // their `options` default wholesale.
        resizable: app.resizable ?? true,
    };
    if (app.default_size != null) {
        options.width = app.default_size.width;
        options.height = app.default_size.height;
    }
    if (app.min_size != null) {
        options.min_width = app.min_size.width;
        options.min_height = app.min_size.height;
    }
    // Set only when asked, for the same reason the size keys are: emitting
    // `aspect_ratio: undefined` would override a default with undefined
    // rather than leaving it alone.
    if (app.aspect_ratio != null) options.aspect_ratio = app.aspect_ratio;
    if (app.maximize_btn != null) options.maximize_btn = app.maximize_btn;
    return options;
}

/** Registered singleton paths, for `work_space`'s `focus_existing()`. */
export function singleton_paths(): string[] {
    return APP_REGISTRY.filter((a) => a.singleton === true).map((a) => a.path);
}
