import { queueProgram, clipboard, hardDrive } from '../../../store';
import { recycle_bin_id, SortOptions, SortOrders } from '../../../system';
import { get } from 'svelte/store';
import * as fs from '../../../fs';
import { required } from '../../../types';
import type {
    ContextMenuSpec,
    FolderOriginator,
    MenuItem,
    VfsItem,
} from '../../../types';

export const make = ({
    originator,
}: {
    type: string;
    originator: FolderOriginator;
}): ContextMenuSpec => {
    const sort_menu_items: { name: string; value: number }[] = [
        { name: 'None', value: SortOptions.NONE },
        { name: 'Name', value: SortOptions.NAME },
        { name: 'Size', value: SortOptions.SIZE },
        { name: 'Date Created', value: SortOptions.DATE_CREATED },
        { name: 'Date Modified', value: SortOptions.DATE_MODIFIED },
    ];
    const sort_order_menu_items: { name: string; value: number }[] = [
        { name: 'Ascending', value: SortOrders.ASCENDING },
        { name: 'Descending', value: SortOrders.DESCENDING },
    ];

    /**
     * The folder this menu was opened on, or null if it has since been deleted
     * from another window. This is evaluated at menu-BUILD time for the Sort By
     * checkmarks, so a throwing lookup meant right-clicking empty space in a
     * window whose folder had just been deleted elsewhere produced no menu at
     * all — the exception escaped while the menu was being constructed.
     */
    const folder = (): VfsItem | null =>
        get(hardDrive)?.[originator.id] ?? null;

    return {
        required_width: 180 + 20,
        required_height: 27 * 6 + 20,
        menu: [
            [
                {
                    name: 'Sort By',
                    items: [
                        ...sort_menu_items.map((item): MenuItem => {
                            return {
                                ...item,
                                check: item.value == folder()?.sort_option,
                                action: () => {
                                    hardDrive.update((data) => {
                                        required(
                                            required(data, 'hard drive')[
                                                originator.id
                                            ],
                                            `fs item ${originator.id}`,
                                        ).sort_option = item.value;
                                        return data;
                                    });
                                },
                            };
                        }),
                        null,
                        ...sort_order_menu_items.map((item): MenuItem => {
                            return {
                                ...item,
                                check: item.value == folder()?.sort_order,
                                action: () => {
                                    hardDrive.update((data) => {
                                        required(
                                            required(data, 'hard drive')[
                                                originator.id
                                            ],
                                            `fs item ${originator.id}`,
                                        ).sort_order = item.value;
                                        return data;
                                    });
                                },
                            };
                        }),
                    ],
                },
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
                ...(originator.id != recycle_bin_id
                    ? [
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
                      ]
                    : []),
            ],
            [
                ...(originator.id != recycle_bin_id
                    ? [
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
                      ]
                    : []),
            ],
            [
                {
                    name: 'Properties',
                    action: () => {
                        const fs_item = folder();
                        if (fs_item == null) return; // deleted meanwhile
                        if (
                            fs_item.type == 'drive' ||
                            fs_item.type == 'removable_storage'
                        ) {
                            queueProgram.set({
                                path: './programs/disk_properties.svelte',
                                fs_item,
                            });
                        } else {
                            queueProgram.set({
                                path: './programs/properties.svelte',
                                fs_item,
                            });
                        }
                    },
                },
            ],
        ],
    };
};
