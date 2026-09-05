/**
 * Ambient declarations for the XP shell.
 *
 * - `svelteHTML` teaches svelte-check about the custom action events
 *   (`use:click_outside`, `use:long_press`, `use:double_tap`), the `tooltip`
 *   attribute read by the tooltip action, and the non-standard `fs-id` /
 *   `program-id` DOM hooks the inherited base uses instead of data-*.
 * - The globals below are loaded at runtime from <script> tags in
 *   app.html / desktop.svelte (jQuery UI, loadjs, panzoom), so they have no
 *   importable module types.
 */

declare namespace svelteHTML {
    interface HTMLAttributes {
        'on:click_outside'?: (event: CustomEvent) => void;
        'on:long_press'?: (
            event: CustomEvent<{ x: number; y: number }>,
        ) => void;
        'on:double_tap'?: (event: CustomEvent) => void;
        /** Message shown by the `tooltip` action. */
        tooltip?: string;
        /** VFS item id hook used by rubber-band selection / renaming. */
        'fs-id'?: string;
        /** Program instance id hook used by Window minimize animation. */
        'program-id'?: string;
    }
}

interface JQueryUiElement {
    draggable(options: {
        containment?: string;
        handle?: string;
        stop?: () => void | Promise<void>;
    }): void;
    resizable(options: {
        minWidth?: number;
        minHeight?: number;
        aspectRatio?: number;
        containment?: string;
        handles?: string;
        classes?: Record<string, string>;
        start?: () => void;
        stop?: () => void | Promise<void>;
    }): void;
}

interface PanzoomInstance {
    smoothZoom(x: number, y: number, scale: number): void;
}

declare const jQuery: (element: HTMLElement) => JQueryUiElement;

/** Global defined inline in app.html; fetches assets to warm the HTTP cache. */
declare function loadjs(assets: string[]): void;

declare const panzoom: (
    element: HTMLElement,
    options?: {
        filterKey?: (event: KeyboardEvent) => boolean | undefined;
    },
) => PanzoomInstance;

/** hash-sum ships no TypeScript declarations. */
declare module 'hash-sum' {
    export default function hash_sum(value: unknown): string;
}

/** is-valid-http-url ships no TypeScript declarations. */
declare module 'is-valid-http-url' {
    export default function isURL(value: string): boolean;
}

/**
 * svelte-range-slider-pips@2 ships no TypeScript declarations; this covers the
 * props/events volume_adjust.svelte actually uses.
 */
declare module 'svelte-range-slider-pips' {
    import type { SvelteComponent } from 'svelte';
    export default class RangeSlider extends SvelteComponent<
        {
            id?: string;
            step?: number;
            min?: number;
            max?: number;
            values?: number[];
            vertical?: boolean;
            springValues?: { stiffness: number; damping: number };
        },
        { change: CustomEvent<{ value: number }> },
        Record<string, never>
    > {}
}

interface Document {
    /** Vendor-prefixed fullscreen flags probed by media_player_classic. */
    webkitIsFullScreen?: boolean;
    mozFullScreen?: boolean;
    msFullscreenElement?: Element | null;
}

/** Hooks the bundled jspaint build (static/html/jspaint) exposes to paint.svelte. */
interface JSPaintSystemHooks {
    showSaveFileDialog?: (options: Record<string, unknown>) => Promise<void>;
    showOpenFileDialog?: (options: {
        formats?: unknown;
    }) => Promise<{ file: File; file_handle: File }>;
    writeBlobToHandle?: (
        save_file_handle: unknown,
        blob: Blob,
    ) => void | Promise<void>;
}

/**
 * Globals of the jspaint iframe's window (and callbacks paint.svelte assigns
 * onto it). Declared on Window because `iframe.contentWindow` is a plain
 * `Window` and the strict config forbids type assertions.
 */
interface Window {
    set_theme?: (theme: string) => void;
    open_in_new_window?: () => void | Promise<void>;
    open_empty_window?: () => void;
    open_from_file?: (file: File) => void;
    systemHooks?: JSPaintSystemHooks;
}
