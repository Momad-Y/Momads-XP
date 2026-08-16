import { queueProgram, clipboard } from '../../../store';
import { get } from 'svelte/store';
import * as fs from '../../../fs';
import type { ContextMenuSpec, FolderOriginator } from '../../../types';

export const make = ({
    originator,
}: {
    type: string;
    originator: FolderOriginator;
}): ContextMenuSpec => {
    return {
        required_width: 180 + 20,
        required_height: 27 * 6 + 20,
        menu: [
            [
                // {
                //     name: 'Sort By',
                //     items: [
                //         ...sort_menu_items.map(item => {
                //             return {
                //                 ...item,
                //                 check: item.value == get(hardDrive)[originator.id].sort_option,
                //                 action: () => {
                //                     hardDrive.update(data => {
                //                         data[originator.id].sort_option = item.value;
                //                         return data;
                //                     })
                //                 }
                //             }
                //         }),
                //         null,
                //         ...sort_order_menu_items.map(item => {
                //             return {
                //                 ...item,
                //                 check: item.value == get(hardDrive)[originator.id].sort_order,
                //                 action: () => {
                //                     hardDrive.update(data => {
                //                         data[originator.id].sort_order = item.value;
                //                         return data;
                //                     })
                //                 }
                //             }
                //         }),
                //     ]
                // },
                {
                    name: 'Refresh',
                    action: () => {
                        const nodes = document.querySelectorAll('.fs-item');
                        for (const node of nodes) {
                            node.classList.add('animate-blink');
                        }
                        setTimeout(() => {
                            for (const node of nodes) {
                                node.classList.remove('animate-blink');
                            }
                        }, 1000);
                    },
                },
            ],
            [
                {
                    name: 'Paste',
                    disabled: get(clipboard).length == 0,
                    action: () => {
                        fs.paste(originator.id);
                    },
                },
                {
                    name: 'Paste Shortcut',
                    disabled: true,
                },
            ],
            [
                {
                    name: 'New',
                    items: [
                        {
                            name: 'Folder',
                            icon: '/images/xp/icons/FolderClosed.png',
                            action: () => {
                                void fs.new_fs_item(
                                    'folder',
                                    '',
                                    'New Folder',
                                    originator.id,
                                );
                            },
                        },
                        {
                            name: 'Shortcut',
                            icon: '/images/xp/icons/Shortcutoverlay.png',
                        },
                        {
                            name: 'Briefcase',
                            icon: '/images/xp/icons/Briefcase.png',
                        },
                        {
                            name: 'Bitmap Image',
                            icon: '/images/xp/icons/Bitmap.png',
                            action: () => {
                                void fs.new_fs_item(
                                    'file',
                                    '.bmp',
                                    'New Bitmap Image',
                                    originator.id,
                                );
                            },
                        },
                        {
                            name: 'Text Document',
                            icon: '/images/xp/icons/TXT.png',
                            action: () => {
                                void fs.new_fs_item(
                                    'file',
                                    '.txt',
                                    'New Text Document',
                                    originator.id,
                                );
                            },
                        },
                        {
                            name: 'Wave Sound',
                            icon: '/images/xp/icons/WMV.png',
                            action: () => {
                                void fs.new_fs_item(
                                    'file',
                                    '.wav',
                                    'New Sound',
                                    originator.id,
                                );
                            },
                        },
                        {
                            name: 'Compressed (zipped) Folder',
                            icon: '/images/xp/icons/Zipfolder.png',
                        },
                    ],
                },
            ],
            [
                {
                    name: 'Properties',
                    action: () => {
                        queueProgram.set({
                            name: 'Display Properties',
                            icon: 'DisplayProperties.png',
                            path: './programs/display_properties.svelte',
                        });
                    },
                },
            ],
        ],
    };
};
