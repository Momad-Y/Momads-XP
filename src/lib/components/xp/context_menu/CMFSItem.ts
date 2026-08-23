import {
    queueProgram,
    clipboard,
    selectingItems,
    wallpaper,
    hardDrive,
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
import {
    plan_delete,
    delete_prompt_icon,
    delete_prompt_message,
} from '../../../delete_prompt';
import { required } from '../../../types';
import { scoped_ids } from '../../../selection';
import type { ContextMenuSpec, FSItemOriginator } from '../../../types';

export const make = ({
    originator,
}: {
    type: string;
    originator: FSItemOriginator;
}): ContextMenuSpec => {
    /**
     * What this menu is allowed to touch. `selectingItems` is ONE global store
     * shared by the desktop and every Explorer window, so acting on it raw
     * deleted/moved items belonging to another surface — whose highlight is
     * focus-gated and therefore invisible. Falls back to the right-clicked
     * item alone when the opener did not tell us what it is showing.
     */
    const in_scope = (): string[] =>
        scoped_ids(get(selectingItems), originator.visible_ids, [
            originator.item.id,
        ]);
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
                originator.item.parent != recycle_bin_id &&
                originator.item.storage_type != 'fake'
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
                              disabled: in_scope().length == 0,
                              action: () => {
                                  fs.cut(in_scope());
                              },
                          },
                      ]),
                ...(originator.item.type == 'drive' ||
                originator.item.type == 'removable_storage'
                    ? []
                    : [
                          {
                              name: 'Copy',
                              disabled: in_scope().length == 0,
                              action: () => {
                                  fs.copy(in_scope());
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
                ...(originator.item.parent != recycle_bin_id &&
                originator.item.parent != null &&
                originator.item.ext != '.lnk'
                    ? [
                          {
                              name: 'Create Shortcut',
                              action: () => {
                                  fs.create_shortcut(
                                      originator.item.id,
                                      required(
                                          originator.item.parent,
                                          'parent of ' + originator.item.id,
                                      ),
                                  );
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
                                  const data = get(hardDrive) ?? {};
                                  // One shared, unit-tested decision (see
                                  // src/lib/delete_prompt.ts). This used to
                                  // apply ONE recycle-vs-permanent verdict to
                                  // the whole batch and skip no protected
                                  // items, so a selection spanning the Recycle
                                  // Bin and the desktop destroyed the live file
                                  // outright.
                                  const plan = plan_delete(
                                      in_scope(),
                                      (id) => data[id],
                                      (id) => protected_items.includes(id),
                                      recycle_bin_id,
                                  );
                                  if (plan.ids.length === 0) return;

                                  const yes_action = () => {
                                      for (const id of plan.ids) {
                                          // Re-check per item at CONFIRM time,
                                          // like my_computer.delete_selected
                                          // does. The plan is frozen when the
                                          // menu opens and executed when OK is
                                          // clicked, so another window can
                                          // delete the item in between —
                                          // clone_fs/del_fs then `required()`
                                          // it and THROW, which pre-empted
                                          // dialog.destroy() and left the
                                          // confirmation stuck on screen.
                                          if (get(hardDrive)?.[id] == null)
                                              continue;
                                          if (!plan.permanent_ids.has(id)) {
                                              fs.clone_fs(
                                                  id,
                                                  recycle_bin_id,
                                                  null,
                                              );
                                          }
                                          fs.del_fs(id);
                                      }
                                  };

                                  void confirm_delete({
                                      node_ref:
                                          originator.my_computer_instance
                                              ?.window?.node_ref ||
                                          document.body,
                                      title: 'Confirm Delete File',
                                      icon: delete_prompt_icon(
                                          plan.all_permanent,
                                      ),
                                      message: delete_prompt_message(
                                          plan.first_name,
                                          plan.ids.length,
                                          plan.all_permanent,
                                      ),
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

type DialogHandle = {
    destroy: () => void;
};

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
                // destroy() in `finally`: any throw inside yes_action used to
                // skip it and wedge the confirmation permanently open.
                try {
                    yes_action();
                } finally {
                    dialog.destroy();
                }
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
