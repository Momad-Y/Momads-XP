<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import RButton from '../../../lib/components/xp/RButton.svelte';
    import Menu from '../../../lib/components/xp/Menu.svelte';
    import Dialog from '../../../lib/components/xp/Dialog.svelte';
    import { mount, unmount } from 'svelte';
    import { runningPrograms, zIndex } from '../../../lib/store';
    import { profile } from '../../../lib/profile';
    import { validate_contact_form } from '../../../lib/contact';
    import { required } from '../../../lib/types';
    import type {
        MenuBarEntry,
        MountedComponent,
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let exec_path: string | undefined = undefined;

    const linkedin = profile.social.find((s) => s.platform === 'LinkedIn');

    let show_status_bar = true;

    $: menu = [
        {
            name: 'File',
            items: [
                [
                    { name: 'New Message', action: reset },
                    {
                        name: 'Send Message',
                        action: () => {
                            void send();
                        },
                    },
                ],
                [
                    {
                        name: 'Close',
                        action: () => {
                            destroy();
                        },
                    },
                ],
            ],
        },
        {
            name: 'Edit',
            items: [
                [
                    {
                        name: 'Cut',
                        action: () => {
                            void clipboard_cut_copy(true);
                        },
                    },
                    {
                        name: 'Copy',
                        action: () => {
                            void clipboard_cut_copy(false);
                        },
                    },
                    {
                        name: 'Paste',
                        action: () => {
                            void clipboard_paste();
                        },
                    },
                ],
            ],
        },
        {
            name: 'View',
            items: [
                [
                    {
                        name: 'Status Bar',
                        check: show_status_bar,
                        action: () => {
                            show_status_bar = !show_status_bar;
                        },
                    },
                ],
            ],
        },
    ] satisfies MenuBarEntry[];

    let from_email = '';
    let subject = '';
    let message = '';
    /** Honeypot — hidden off-screen; humans never fill it. */
    let website = '';
    const opened_at = Date.now();
    let sending = false;

    function show_dialog(text: string) {
        const target = required(
            document.querySelector('#desktop'),
            'desktop element',
        );
        const dialog: MountedComponent = mount(Dialog, {
            target,
            props: {
                title: 'Contact Me',
                message: text,
                icon: '/images/xp/icons/Information.png',
                get_self: () => dialog,
                buttons: [
                    {
                        name: 'OK',
                        focus: true,
                        action: () => {
                            void unmount(dialog);
                        },
                    },
                ],
            },
        });
    }

    function reset() {
        from_email = '';
        subject = '';
        message = '';
    }

    /**
     * Toolbar Cut/Copy/Paste operate on the last-focused field (the toolbar
     * click itself blurs the field, but inputs keep their selection range).
     */
    type EditableField = HTMLInputElement | HTMLTextAreaElement;
    let last_field: EditableField | null = null;

    function track_focus(event: FocusEvent) {
        const target = event.currentTarget;
        if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement
        ) {
            last_field = target;
        }
    }

    function sync_field(el: EditableField) {
        // bind:value listens for input events — dispatch one so the Svelte
        // state follows the programmatic edit
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    async function clipboard_cut_copy(cut: boolean) {
        const el = last_field;
        if (el == null) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const selected = el.value.slice(start, end);
        if (selected === '') return;
        try {
            await navigator.clipboard.writeText(selected);
        } catch (error) {
            console.error('clipboard write failed', error);
            return;
        }
        if (cut && !el.readOnly) {
            el.value = el.value.slice(0, start) + el.value.slice(end);
            sync_field(el);
            el.focus();
            el.setSelectionRange(start, start);
        } else {
            el.focus();
            el.setSelectionRange(start, end);
        }
    }

    async function clipboard_paste() {
        const el = last_field;
        if (el == null || el.readOnly) return;
        let text: string;
        try {
            text = await navigator.clipboard.readText();
        } catch {
            // Firefox (and denied permissions) block programmatic reads
            show_dialog(
                'The browser blocked clipboard access — press Ctrl+V in the field instead.',
            );
            return;
        }
        if (text === '') return;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        el.value = el.value.slice(0, start) + text + el.value.slice(end);
        sync_field(el);
        el.focus();
        const caret = start + text.length;
        el.setSelectionRange(caret, caret);
    }

    async function send() {
        if (sending) return;
        const error = validate_contact_form({ from_email, subject, message });
        if (error != null) {
            show_dialog(error);
            return;
        }
        sending = true;
        try {
            const res = await fetch('/api/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from_email,
                    subject,
                    message,
                    website,
                    opened_at,
                }),
            });
            if (res.ok) {
                show_dialog('Message sent successfully.');
                reset();
            } else if (res.status === 429) {
                show_dialog(
                    'The mail server is busy. Please try again in a little while.',
                );
            } else if (res.status === 422) {
                show_dialog(
                    'That was fast! Please wait a moment and try sending again.',
                );
            } else {
                show_dialog(
                    'The message could not be sent. Please try again later.',
                );
            }
        } catch (error) {
            console.error('contact form send failed', error);
            show_dialog(
                'The message could not be sent. Please try again later.',
            );
        } finally {
            sending = false;
        }
    }

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'contact_me instance'));
    }

    export let options: WindowOptions = {
        title: 'Contact Me',
        icon: '/assets/icons/contact-me.png',
        id,
        exec_path,
        width: 640,
        height: 520,
        min_width: 480,
        min_height: 400,
    };
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0 flex flex-col bg-xp-yellow font-Tahoma"
    >
        <!-- menu bar: relative+z so dropdowns paint above the toolbar -->
        <div class="shrink-0 border-b border-stone-300 px-1 relative z-20">
            <Menu {menu} focused={window?.z_index === $zIndex} />
        </div>

        <!-- toolbar -->
        <div
            class="shrink-0 flex flex-row items-center gap-1 px-1 py-0.5 border-b border-stone-300"
        >
            <RButton
                title="Send Message"
                icon="/images/xp/icons/OutlookExpress.png"
                on_click={() => {
                    void send();
                }}
            />
            <RButton
                title="New Message"
                icon="/images/xp/icons/Email.png"
                on_click={reset}
            />
            <div class="w-px h-5 bg-stone-300 mx-1"></div>
            <RButton
                icon="/images/xp/icons/Cut.png"
                tooltip_message="Cut"
                on_click={() => {
                    void clipboard_cut_copy(true);
                }}
            />
            <RButton
                icon="/images/xp/icons/Copy.png"
                tooltip_message="Copy"
                on_click={() => {
                    void clipboard_cut_copy(false);
                }}
            />
            <RButton
                icon="/images/xp/icons/Paste.png"
                tooltip_message="Paste"
                on_click={() => {
                    void clipboard_paste();
                }}
            />
            <div class="w-px h-5 bg-stone-300 mx-1"></div>
            {#if linkedin}
                <!-- eslint-disable svelte/no-navigation-without-resolve -- external social URL, not an app route -->
                <a
                    href={linkedin.url}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <RButton
                        title="LinkedIn"
                        icon="/images/xp/icons/InternetExplorer6.png"
                    />
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {/if}
        </div>

        <!-- fields -->
        <div class="shrink-0 flex flex-col gap-1 px-3 py-2 text-[11px]">
            <label class="flex flex-row items-center">
                <span class="w-14 text-right pr-2 text-slate-800">To:</span>
                <input
                    class="grow h-[22px] px-1 border border-stone-400 bg-[#ece9d8] text-slate-600 outline-none"
                    type="text"
                    readonly
                    value="{profile.meta.name} <{profile.meta.email}>"
                    on:focus={track_focus}
                />
            </label>
            <label class="flex flex-row items-center">
                <span class="w-14 text-right pr-2 text-slate-800">From:</span>
                <input
                    class="grow h-[22px] px-1 border border-stone-400 bg-white outline-none"
                    type="email"
                    placeholder="Your email address"
                    bind:value={from_email}
                    on:focus={track_focus}
                />
            </label>
            <label class="flex flex-row items-center">
                <span class="w-14 text-right pr-2 text-slate-800">Subject:</span
                >
                <input
                    class="grow h-[22px] px-1 border border-stone-400 bg-white outline-none"
                    type="text"
                    placeholder="Subject of your message"
                    bind:value={subject}
                    on:focus={track_focus}
                />
            </label>
            <input
                name="website"
                tabindex="-1"
                autocomplete="off"
                aria-hidden="true"
                class="absolute -left-[9999px] top-0 h-0 w-0"
                bind:value={website}
            />
        </div>

        <!-- body -->
        <div class="grow px-3 pb-2 flex">
            <textarea
                class="grow resize-none p-2 border border-stone-400 bg-white text-[12px] outline-none"
                placeholder="Write your message here"
                bind:value={message}
                on:focus={track_focus}></textarea>
        </div>

        <!-- status bar -->
        {#if show_status_bar}
            <div
                class="shrink-0 px-3 py-1 border-t border-stone-300 text-[11px] text-slate-700"
            >
                Compose a message to Mohamed
            </div>
        {/if}
    </div>
</Window>
