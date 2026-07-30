<svelte:options accessors={true} />

<script lang="ts">
    import { onMount } from 'svelte';
    import TitleBar from './TitleBar.svelte';
    import * as utils from '../../utils';
    const { click_outside } = utils;
    import { get, set } from 'idb-keyval';
    import { zIndex, runningPrograms } from '../../store';
    import { required } from '../../types';
    import type { WindowOptions } from '../../types';
    import { next_cascade_position } from '../../cascade';

    interface WindowRect {
        top: number;
        left: number;
        width: number;
        height: number;
    }

    export let options: WindowOptions = {};

    let titlebar: {
        update_icon: (icon: string) => void;
        update_title: (title: string) => void;
    };
    export let node_ref: HTMLElement | undefined = undefined;

    /** The window's root element; only valid after mount (bind:this). */
    function win(): HTMLElement {
        return required(node_ref, 'window element');
    }
    let saved_position: Partial<WindowRect>;
    export let maximized: boolean | undefined = undefined;
    export let minimized: boolean | undefined = undefined;
    let translateX = '';
    let translateY = '';
    let animation_enabled = false;

    export let on_focused: () => void = () => {};

    export let z_index = 0;

    onMount(async () => {
        if (options.exec_path != null) {
            const saved = await get<WindowRect>(options.exec_path);
            if (saved) {
                const rect = {
                    top: saved.top,
                    left: saved.left,
                    width: saved.width,
                    height: saved.height,
                };
                const workspace = required(
                    document.querySelector<HTMLElement>('#work-space'),
                    'work-space element',
                );
                const nudge = calc_nudges(rect);
                rect.top = rect.top + nudge.top;
                rect.left = rect.left + nudge.left;

                // Clamp instead of trusting the stored rect: legacy rects
                // were captured via getBoundingClientRect (transform- and
                // viewport-sensitive) and could restore with a negative top —
                // title-bar buttons off-screen — or a size larger than the
                // current workspace (Phase 2 fix batch).
                rect.width = Math.min(rect.width, workspace.offsetWidth);
                rect.height = Math.min(rect.height, workspace.offsetHeight);
                rect.top = Math.max(
                    0,
                    Math.min(rect.top, workspace.offsetHeight - rect.height),
                );
                rect.left = Math.max(
                    0,
                    Math.min(rect.left, workspace.offsetWidth - rect.width),
                );
                options.top = rect.top;
                options.left = rect.left;
                options.width = rect.width;
                options.height = rect.height;
            }
        }

        const parent = required(win().parentElement, 'window parent element');
        // Programs declare desktop-sized defaults (e.g. pdf_viewer 640×720);
        // on short/narrow workspaces cap them so the chrome stays reachable.
        // The min_* caps matter too: CSS min-height wins over the height cap,
        // so a non-resizable dialog with min_height > workspace would clip its
        // buttons off the bottom otherwise (red-team #5).
        options.min_height = Math.min(
            options.min_height ?? 0,
            parent.offsetHeight,
        );
        options.min_width = Math.min(
            options.min_width ?? 0,
            parent.offsetWidth,
        );
        if (options.height != null) {
            options.height = Math.max(
                Math.min(options.height, parent.offsetHeight),
                options.min_height,
            );
        }
        if (options.width != null) {
            options.width = Math.max(
                Math.min(options.width, parent.offsetWidth),
                options.min_width,
            );
        }
        if (
            options.top == null &&
            options.left == null &&
            window.innerWidth < 640 &&
            options.mobile_maximize !== false
        ) {
            // mobile: open maximized when no saved position
            options.top = 0;
            options.left = 0;
            options.width = parent.offsetWidth;
            options.height = parent.offsetHeight;
            // clamp min-width/height so CSS doesn't override the maximized size
            options.min_width = Math.min(
                options.min_width || 0,
                parent.offsetWidth,
            );
            options.min_height = Math.min(
                options.min_height || 0,
                parent.offsetHeight,
            );
            maximized = true;
        } else {
            if (options.top == null && options.left == null) {
                // no saved rect, no program-specified position → cascade (§4.1)
                const position = next_cascade_position({
                    win_width: win().offsetWidth,
                    win_height: win().offsetHeight,
                    workspace_width: parent.offsetWidth,
                    workspace_height: parent.offsetHeight,
                });
                options.top = position.top;
                options.left = position.left;
            } else {
                if (options.top == null) {
                    options.top =
                        (parent.offsetHeight - win().offsetHeight) / 2;
                }
                if (options.left == null) {
                    options.left = (parent.offsetWidth - win().offsetWidth) / 2;
                }
            }
        }
        set_position({
            top: options.top,
            left: options.left,
            width: options.width,
            height: options.height,
        });

        if (options.resizable == null) {
            options.resizable = true;
        }
        if (options.draggable == null) {
            options.draggable = true;
        }

        setup_gestures();
        zIndex.update((value) => value + 1);
        z_index = $zIndex;

        win().style.removeProperty('opacity');
        setTimeout(() => {
            animation_enabled = true;
        }, 500);
    });

    export let on_click_close: () => void = () => {};

    export let on_click_maximize: () => void = () => {
        if (!options.resizable) return;
        minimized = false;
        if (maximized) {
            set_position(saved_position);
            maximized = false;
        } else {
            // let rect = utils.relative_rect(node_ref.parentNode.getBoundingClientRect(), node_ref.getBoundingClientRect());
            // console.log(rect);
            const el = win();
            saved_position = {
                top: el.offsetTop,
                left: el.offsetLeft,
                width: el.offsetWidth,
                height: el.offsetHeight,
            };
            const parent = required(el.parentElement, 'window parent element');
            set_position({
                top: 0,
                left: 0,
                width: parent.offsetWidth,
                height: parent.offsetHeight,
            });
            maximized = true;
        }
        focus();
    };

    export let on_click_minimize: () => void = () => {
        const window_center = get_center_point(win().getBoundingClientRect());
        const tile_center = get_center_point(
            document
                .querySelector(
                    `.program-tile[program-id="${String(options.id)}"]`,
                )
                ?.getBoundingClientRect(),
        );

        translateX = `translateX(${String(tile_center.x - window_center.x)}px)`;
        translateY = `translateY(${String(tile_center.y - window_center.y)}px)`;
        console.log(`${translateX} ${translateY} scale(0.1)`);

        minimized = true;
        loose_focus();
    };

    export function restore() {
        if (minimized) {
            minimized = false;
        } else if (maximized) {
            on_click_maximize();
        }
        focus();
    }

    export function focus() {
        if (z_index != $zIndex) {
            zIndex.update((value) => value + 1);
            z_index = $zIndex;
            on_focused();
        }
    }

    export function loose_focus() {
        if (z_index == $zIndex) {
            console.log('loose focus');
            zIndex.update((value) => value + 1);
        }
    }

    function calc_nudges({ top, left, width, height }: WindowRect) {
        const existing_window = $runningPrograms.findLast((el) => {
            return (
                el.options.id != options.id &&
                el.options.exec_path == options.exec_path
            );
        });
        if (existing_window == null) return { top: 0, left: 0 };

        const pad = 10;
        const nudges: [number, number][] = [
            [pad, pad],
            [pad, -pad],
            [-pad, pad],
            [-pad, -pad],
            [0, 0],
        ];
        const workspace = required(
            document.querySelector<HTMLElement>('#work-space'),
            'work-space element',
        );
        for (const nudge of nudges) {
            if (
                top + nudge[0] >= 0 &&
                left + nudge[1] >= 0 &&
                top + height + nudge[0] <= workspace.offsetHeight &&
                left + width + nudge[1] <= workspace.offsetWidth
            ) {
                return { top: nudge[0], left: nudge[1] };
            }
        }
        return { top: 0, left: 0 };
    }

    function get_center_point(rect: DOMRect | undefined) {
        if (rect == null) {
            return {
                x: document.body.offsetWidth * 0.5,
                y: document.body.offsetHeight * 0.5,
            };
        }
        return { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.5 };
    }

    export function set_position({
        top,
        left,
        width,
        height,
    }: Partial<WindowRect>) {
        const el = win();
        el.style.top = `${String(top)}px`;
        el.style.left = `${String(left)}px`;
        el.style.width = `${String(width)}px`;
        el.style.height = `${String(height)}px`;

        if (options.exec_path) {
            void set(options.exec_path, current_rect());
        }
    }

    /**
     * Workspace-relative rect via offset* — unlike getBoundingClientRect,
     * immune to in-flight open/minimize transforms, which could persist a
     * corrupted (e.g. negative-top) rect.
     */
    function current_rect(): WindowRect {
        const el = win();
        return {
            top: el.offsetTop,
            left: el.offsetLeft,
            width: el.offsetWidth,
            height: el.offsetHeight,
        };
    }

    function setup_gestures() {
        const el = win();
        if (options.draggable) {
            jQuery(el).draggable({
                containment: 'parent',
                handle: '.titlebar',
                stop: async () => {
                    if (options.exec_path) {
                        await set(options.exec_path, current_rect());
                    }
                },
            });
        }

        if (options.resizable) {
            jQuery(el).resizable({
                minWidth: options.min_width,
                minHeight: options.min_height,
                aspectRatio: options.aspect_ratio,
                containment: 'parent',
                handles: 'all',
                classes: {
                    'ui-resizable-se':
                        'ui-icon ui-icon-gripsmall-diagonal-se opacity-0',
                },
                start: () => {
                    const iframe = el.querySelector('iframe');
                    if (iframe) {
                        iframe.style.pointerEvents = 'none';
                    }
                },
                stop: async () => {
                    if (options.exec_path) {
                        await set(options.exec_path, current_rect());
                    }
                    const iframe = el.querySelector('iframe');
                    if (iframe) {
                        iframe.style.removeProperty('pointer-events');
                    }
                },
            });
        }
    }

    export function update_icon(icon: string) {
        titlebar.update_icon(icon);
    }

    export function update_title(title: string) {
        runningPrograms.update((values) => {
            const program = values.find((el) => el.options.id == options.id);
            if (program != null) {
                program.options.title = title;
            }

            return values;
        });
        titlebar.update_title(title);
    }

    export function show_toast({
        theme = 'dark',
        message,
    }: {
        theme?: string;
        message: string;
    }) {
        const toast = document.createElement('div');
        toast.style.position = 'absolute';
        toast.style.transform = 'translate(-50%)';
        toast.style.left = '50%';
        toast.style.top = '50%';
        toast.style.padding = '10px';
        toast.innerText = message;
        toast.style.borderRadius = '7px';
        toast.style.opacity = '1';
        toast.style.fontSize = '12px';
        toast.style.minHeight = '30px';
        toast.style.minWidth = '70px';
        toast.style.zIndex = '99999';
        if (theme == 'dark') {
            toast.style.backgroundColor = '#0f172a';
            toast.style.border = '1px solid #f1f5f9';
            toast.style.color = '#f8fafc';
        } else {
            toast.style.backgroundColor = '#f1f5f9';
            toast.style.border = '1px solid #1e293b';
            toast.style.color = '#0f172a';
        }
        win().append(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
</script>

<div
    on:mousedown={focus}
    use:click_outside
    on:click_outside={loose_focus}
    bind:this={node_ref}
    style="
    opacity:0;
    position: absolute;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    padding: 0px;
    -webkit-font-smoothing: antialiased;"
    program-id={options.id}
    class="window absolute flex flex-col bg-xp-yellow {animation_enabled
        ? 'transition duration-300'
        : ''}  {minimized ? `opacity-0` : ''}"
    style:width="{options.width}px"
    style:height="{options.height}px"
    style:min-width="{options.min_width}px"
    style:min-height="{options.min_height}px"
    style:transform={minimized
        ? `${translateX} ${translateY} scale(0.1)`
        : 'none'}
    style:background={options.background}
    style:z-index={z_index}
    style:box-shadow={z_index < $zIndex
        ? 'var(--window-box-shadow-inactive)'
        : 'var(--window-box-shadow)'}
>
    <div class="shrink-0">
        <TitleBar
            bind:this={titlebar}
            {options}
            inactive={z_index < $zIndex}
            {maximized}
            {on_click_close}
            {on_click_maximize}
            {on_click_minimize}
        ></TitleBar>
    </div>

    <div class="grow shrink-0 relative shadow-xl">
        <slot name="content"></slot>
    </div>
</div>
