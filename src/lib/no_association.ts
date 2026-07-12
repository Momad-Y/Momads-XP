import { mount, unmount } from 'svelte';
import Dialog from './components/xp/Dialog.svelte';
import { required } from './types';
import type { MountedComponent } from './types';

/**
 * §9 Phase 1 exit criteria / Phase-0 red-team carry-over: double-clicking a
 * file with no associated program used to queue the pruned notepad.svelte
 * (a silent no-op). Show the XP "no association" dialog instead.
 */
export function show_no_association_dialog(filename: string): void {
    const target = required(
        document.querySelector('#desktop'),
        'desktop element',
    );
    const dialog: MountedComponent = mount(Dialog, {
        target,
        props: {
            title: filename,
            message:
                'Windows cannot open this file — no program is associated with it.',
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
