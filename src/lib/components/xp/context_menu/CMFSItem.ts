import {
    queueProgram,
    clipboard,
    selectingItems,
    wallpaper,
} from '../../../store';
import {
    recycle_bin_id,
    protected_items,
    wallpapers_folder,
    supported_wallpaper_filetypes,
    doctypes,
} from '../../../system';
import * as utils from '../../../utils';
import { get } from 'svelte/store';
import * as fs from '../../../fs';
import short from 'short-uuid';
import { saveAs } from 'file-saver';
import type { ContextMenuSpec, FSItemOriginator } from '../../../types';

export const make = ({
    originator,
}: {
    type: string;
    originator: FSItemOriginator;
}): ContextMenuSpec => {
    //originator: a wrapped fs item, i.e, file, folder, drive
    // {item: item, open: fn(), my_computer_instance: obj})

    const open_with_handlers = doctypes[originator.item.ext];

    return {
        required_width: 180 + 20,
        required_height: 27 * 11 + 20,
        menu: [
            [
                ...(originator.item.parent != recycle_bin_id
                    ? [
                          {
                              name: 'Open',
                              action: () => {
                                  originator.open(originator.item.id);
                              },
                              font: 'bold',
                          },
                          {
                              name: 'Explore',
                          },
                          {
                              name: 'Search...',
                              disabled: originator.type == 'file',
                          },
                      ]
                    : []),
                ...(originator.item.parent != recycle_bin_id &&
                open_with_handlers != null &&
                open_with_handlers.length >= 2
                    ? [
                          {
                              name: 'Open With',
                              items: open_with_handlers.map((el) => {
                                  return {
                                      name: el.name,
                                      icon: el.icon,
                                      action: () => {
                                          queueProgram.set({
                                              path: el.path,
                                              fs_item: originator.item,
                                          });
                                      },
                                  };
                              }),
                          },
                      ]
                    : []),
                ...(supported_wallpaper_filetypes.includes(originator.item.ext)
                    ? [
                          {
                              name: 'Set as Desktop Wallpaper',
                              action: () => {
                                  const new_id = short.generate();
                                  fs.clone_fs(
                                      originator.item.id,
                                      wallpapers_folder,
                                      new_id,
                                  );
                                  wallpaper.set(new_id);
                              },
                          },
                      ]
                    : []),
            ],
            [
                ...(['file', 'folder'].includes(originator.item.type) &&
                originator.item.parent != recycle_bin_id
                    ? [
                          {
                              name: 'Add to archive...',
                              icon: '/images/xp/icons/RAR.png',
                              action: () => {
                                  queueProgram.set({
                                      path: './programs/zip.svelte',
                                      fs_item: originator.item,
                                  });
                              },
                          },
                      ]
                    : []),
            ],
            [
                ...(originator.item.parent != recycle_bin_id
                    ? [
                          {
                              name: 'Send To',
                              items: [
                                  ...(originator.item.type == 'file' &&
                                  originator.item.storage_type != 'fake'
                                      ? [
                                            {
                                                name: 'Local Computer (Download)',
                                                icon: '/images/xp/icons/CopyingConflict.png',
                                                action: async () => {
                                                    const file =
                                                        await fs.get_file(
                                                            originator.item.id,
                                                        );
                                                    const download = new File(
                                                        [file],
                                                        originator.item.name,
                                                        {
                                                            type: String(
                                                                utils.ext_to_mime(
                                                                    originator
                                                                        .item
                                                                        .name,
                                                                ),
                                                            ),
                                                        },
                                                    );
                                                    saveAs(download);
                                                },
                                            },
                                        ]
                                      : []),
                                  {
                                      name: 'Compressed (Zipped) Folder',
                                      icon: '/images/xp/icons/Zipfolder.png',
                                      action: () => {
                                          queueProgram.set({
                                              path: './programs/zip.svelte',
                                              fs_item: originator.item,
                                          });
                                      },
                                  },
                                  {
                                      name: 'Desktop (create shortcut)',
                                      icon: '/images/xp/icons/Desktop.png',
                                  },
                                  {
                                      name: 'Mail Recipient',
                                      icon: '/images/xp/icons/Email.png',
                                  },
                                  {
                                      name: 'Floppy (A:)',
                                      icon: '/images/xp/icons/FloppyDisk.png',
                                  },
                              ],
                          },
                      ]
                    : []),
            ],
            [
                ...(protected_items.includes(originator.item.id)
                    ? []
                    : [
                          {
                              name: 'Cut',
                              disabled: get(selectingItems).length == 0,
                              action: () => {
                                  fs.cut();
                              },
                          },
                      ]),
                ...(originator.item.type == 'drive' ||
                originator.item.type == 'removable_storage'
                    ? []
                    : [
                          {
                              name: 'Copy',
                              disabled: get(selectingItems).length == 0,
                              action: () => {
                                  fs.copy();
                              },
                          },
                      ]),
                ...(originator.item.type != 'file' &&
                originator.item.parent != recycle_bin_id
                    ? [
                          {
                              name: 'Paste',
                              disabled: get(clipboard).length == 0,
                              action: () => {
                                  fs.paste(originator.item.id);
                              },
                          },
                      ]
                    : []),
            ],
            [
                ...(protected_items.includes(originator.item.id)
                    ? []
                    : [
                          {
                              name: 'Delete',
                              action: () => {
                                  const items = [...get(selectingItems)];
                                  console.log(items);

                                  const yes_action = () => {
                                      if (
                                          originator.item.parent ==
                                          recycle_bin_id
                                      ) {
                                          for (const id of items) {
                                              fs.del_fs(id);
                                          }
                                      } else {
                                          for (const id of items) {
                                              fs.clone_fs(
                                                  id,
                                                  recycle_bin_id,
                                                  null,
                                              );
                                              fs.del_fs(id);
                                          }
                                      }
                                  };
                                  const filename =
                                      originator.item.name.length > 70
                                          ? originator.item.name.slice(0, 70) +
                                            '...'
                                          : originator.item.name;

                                  let message: string;
                                  let plural = '';
                                  if (items.length == 1) {
                                      plural = '';
                                  } else if (items.length == 2) {
                                      plural = ' and 1 other item';
                                  } else if (items.length > 2) {
                                      plural = ` and ${String(items.length - 1)} other items`;
                                  }
                                  if (
                                      originator.item.parent == recycle_bin_id
                                  ) {
                                      message = `Do you want to permanently delete ${filename}${plural}? This action can't be undone?`;
                                  } else {
                                      message = `Do you want to move ${filename}${plural} to the Recycle Bin?`;
                                  }

                                  const icon =
                                      originator.item.parent == recycle_bin_id
                                          ? '/images/xp/icons/DeleteConfirmation.png'
                                          : '/images/xp/icons/RecycleBinempty.png';

                                  void confirm_delete({
                                      node_ref:
                                          originator.my_computer_instance
                                              ?.window.node_ref ||
                                          document.body,
                                      title: 'Confirm Delete File',
                                      icon,
                                      message,
                                      yes_action: yes_action,
                                      no_action: () => {
                                          /* keep the item */
                                      },
                                  });
                              },
                          },
                      ]),
                ...(protected_items.includes(originator.item.id) ||
                originator.item.parent == recycle_bin_id
                    ? []
                    : [
                          {
                              name: 'Rename',
                              action: () => {
                                  selectingItems.set([originator.item.id]);
                                  originator.rename();
                              },
                          },
                      ]),
            ],
            [
                {
                    name: 'Properties',
                    action: () => {
                        if (
                            originator.item.type == 'drive' ||
                            originator.item.type == 'removable_storage'
                        ) {
                            queueProgram.set({
                                path: './programs/disk_properties.svelte',
                                fs_item: originator.item,
                            });
                        } else {
                            queueProgram.set({
                                path: './programs/properties.svelte',
                                fs_item: originator.item,
                            });
                        }
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
