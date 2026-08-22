<svelte:options accessors={true} />

<script lang="ts">
    import { unmount } from 'svelte';
    import { required } from '../../types';
    import type { DialogButton, MountedComponent } from '../../types';

    import TitleBar from './TitleBar.svelte';
    import Button from './Button.svelte';

    export let get_self: () => MountedComponent | null = () => null;
    export let title = '';
    export let message = '';
    export let icon = '';
    export let buttons: DialogButton[] = [];
    export let button_align = 'right'; //center, right

    export function destroy() {
        void unmount(required(get_self(), 'dialog instance'));
    }

    let node_ref: HTMLDivElement | undefined = undefined;

    /**
     * XP: Escape IS Cancel on a dialog. Without this the key fell straight
     * through to whatever window listener was underneath, so Escape left the
     * dialog open and mutated the window BEHIND it.
     *
     * Only the topmost dialog responds — dialogs stack (a delete confirmation
     * can open over the File Transfer guide), and every one of them mounts its
     * own listener.
     */
    /**
     * Where a dialog sits in the STACK, not in the document.
     *
     * Each dialog mounts into its own window's node, and windows stack purely
     * by CSS `z-index` — `Window.svelte` raises one by bumping that number and
     * never reorders the DOM. So "last in document order" meant "belongs to
     * the most recently CREATED window", which is not the same thing at all:
     * Escape cancelled a confirmation buried behind the one on screen.
     *
     * A dialog mounted outside any window (CMFSItem puts the desktop's delete
     * confirmation into document.body, no_association into #desktop) carries
     * its own z-index of 100000 and therefore paints above every window.
     */
    function stacking_rank(el: Element): number {
        const owner = el.closest('.window');
        if (owner == null) return Number.MAX_SAFE_INTEGER;
        const z = Number.parseInt(getComputedStyle(owner).zIndex, 10);
        return Number.isNaN(z) ? 0 : z;
    }

    function on_keydown(event: KeyboardEvent) {
        if (event.key !== 'Escape' || node_ref == null) return;
        const open_dialogs = [...document.querySelectorAll('.dialog')];
        const mine = stacking_rank(node_ref);
        // strictly greater: a tie means two dialogs in the same window, where
        // document order IS the stacking order, so the last one still wins
        if (open_dialogs.some((d) => stacking_rank(d) > mine)) return;
        const tied = open_dialogs.filter((d) => stacking_rank(d) === mine);
        if (tied[tied.length - 1] !== node_ref) return;
        event.preventDefault();
        event.stopPropagation();
        const cancel = buttons.find((b) => b.name === 'Cancel');
        if (cancel?.action != null) cancel.action();
        else destroy();
    }
</script>

<svelte:window on:keydown={on_keydown} />

<div
    bind:this={node_ref}
    class="dialog absolute inset-0 bg-slate-50/10 rounded-t-lg"
    style:z-index="100000"
    on:click|self={(e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        target.querySelector('div')?.classList.add('animate-blink');
        setTimeout(() => {
            target.querySelector('div')?.classList.remove('animate-blink');
        }, 400);
    }}
>
    <div
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col"
        style:width="400px"
        style:height="150px"
    >
        <TitleBar
            options={{ title: title, maximize_btn: false, minimize_btn: false }}
            on_click_close={destroy}
        ></TitleBar>
        <div
            class="grow p-2 bg-xp-yellow overflow-hidden flex flex-col justify-between border-t-0 border-2 border-blue-600"
        >
            <div class="grow flex flex-row text-[11px] p-2 text-slate-800">
                {#if icon.length > 0}
                    <div
                        class="w-8 h-8 mr-4 shrink-0 bg-contain"
                        style:background-image="url({icon})"
                    ></div>
                {/if}
                <div>
                    {message}
                </div>
            </div>
            <div
                class="flex flex-row pb-1 items-center {button_align == 'center'
                    ? 'justify-center'
                    : 'justify-end'}"
            >
                <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
                {#each buttons as button}
                    <Button
                        title={button.name}
                        on_click={button.action}
                        focus={button.focus}
                        style="margin-left:7px;margin-right:7px;"
                    ></Button>
                {/each}
            </div>
        </div>
    </div>
</div>
