import { queueProgram, hardDrive } from '../../../store';
import { recycle_bin_id } from '../../../system';
import { get } from 'svelte/store';
import * as fs from '../../../fs';
import { required } from '../../../types';
import type { ContextMenuSpec } from '../../../types';

export const make = (): ContextMenuSpec => {
    //originator: a wrapped fs item, i.e, file, folder, drive
    // {item: item, open: fn(), my_computer_instance: obj}

    return {
        required_width: 180 + 20,
        required_height: 27 * 3 + 20,
        menu: [
            [
                {
                    name: 'Open',
                    action: () => {
                        const fs_item = required(get(hardDrive), 'hard drive')[
                            recycle_bin_id
                        ];
                        queueProgram.set({
                            path: './programs/my_computer.svelte',
                            fs_item: fs_item,
                        });
                    },
                    font: 'bold',
                },
            ],
            [
                {
                    name: 'Empty Recycle Bin',
                    action: () => {
                        const yes_action = () => {
                            const children = required(
                                required(get(hardDrive), 'hard drive')[
                                    recycle_bin_id
                                ],
                                `fs item ${recycle_bin_id}`,
                            ).children;
                            for (const id of [...children]) {
                                fs.del_fs(id);
                            }
                        };

                        void confirm_delete({
                            node_ref: document.body,
                            title: 'Confirm Delete File',
                            icon: '/images/xp/icons/DeleteConfirmation.png',
                            message:
                                'Do you want to permanently delete all files in the Recycle Bin? This action cannot be undone.',
                            yes_action: yes_action,
                            no_action: () => {
                                /* keep contents */
                            },
                        });
                    },
                },
                {
                    name: 'Properties',
                    action: () => {
                        // queueProgram.set({
                        //     path: './programs/properties.svelte',
                        //     fs_item: originator.item
                        // })
                    },
                },
            ],
        ],
    };
};

interface ConfirmDeleteOptions {
    node_ref: HTMLElement;
    title: string;
    message: string;
    icon: string;
    yes_action: () => void;
    no_action: () => void;
}

interface DialogHandle {
    destroy: () => void;
}

async function confirm_delete({
    node_ref,
    title,
    message,
    icon,
    yes_action,
    no_action,
}: ConfirmDeleteOptions): Promise<void> {
    const { mount } = await import('svelte');
    const Dialog = (await import('../Dialog.svelte')).default;
    const buttons = [
        {
            name: 'OK',
            action: () => {
                yes_action();
                dialog.destroy();
            },
            focus: true,
        },
        {
            name: 'Cancel',
            action: () => {
                no_action();
                dialog.destroy();
            },
        },
    ];
    const dialog: DialogHandle = mount(Dialog, {
        target: node_ref,
        props: {
            icon,
            title,
            message,
            buttons,
            get_self: () => dialog,
        },
    });
}
