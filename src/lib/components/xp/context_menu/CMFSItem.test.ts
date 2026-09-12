import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The right-click Delete had never been unit tested, and carried the same
 * per-batch recycle-vs-permanent bug that destroyed a live file through the
 * File menu. `mount` and the Dialog component are mocked so the action can run
 * headlessly and its buttons can be invoked.
 */
interface DialogButton {
    name: string;
    action: () => void;
}
interface DialogProps {
    title?: string;
    message?: string;
    icon?: string;
    buttons?: DialogButton[];
}

const mounted = vi.hoisted(() => ({
    calls: [] as { props: DialogProps }[],
}));

vi.mock('svelte', () => ({
    mount: (_component: unknown, opts: { props: DialogProps }) => {
        mounted.calls.push({ props: opts.props });
        return { destroy: () => undefined };
    },
}));
vi.mock('../Dialog.svelte', () => ({ default: {} }));

import { hardDrive, selectingItems } from '../../../store';
import { recycle_bin_id } from '../../../system';
import type { HardDrive, VfsItem, FSItemOriginator } from '../../../types';

function node(id: string, parent: string): VfsItem {
    return {
        id,
        type: 'file',
        name: id + '.txt',
        basename: id,
        ext: '.txt',
        children: [],
        parent,
        date_created: 0,
        date_modified: 0,
        sort_option: 0,
        sort_order: 0,
    };
}

const DESKTOP = 'nt1QdU9Sws26H26UNQZcQU';
const live = node('live', DESKTOP);
const binned = node('binned', recycle_bin_id);

const drive: HardDrive = {
    live,
    binned,
    [DESKTOP]: { ...node(DESKTOP, 'root'), type: 'folder', children: ['live'] },
};

// finder.ts snapshots the drive at MODULE level, so the store must be seeded
// before anything in that import chain loads.
hardDrive.set(structuredClone(drive));
const { make } = await import('./CMFSItem');
const fs = await import('../../../fs');

// NOTE: no default value — `undefined` must reach the menu as a genuinely
// absent scope, and a default parameter would silently replace it.
function originator_for(
    item: VfsItem,
    visible_ids: string[] | undefined,
): FSItemOriginator {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the menu only reads these fields; the node_ref avoids the `|| document.body` fallback, which has no meaning under the node test environment
    return {
        item,
        type: item.type,
        open: vi.fn(),
        rename: vi.fn(),
        // What the opening surface is showing. Real callers always populate
        // this; the default here mirrors a window showing both fixtures.
        visible_ids,
        my_computer_instance: { window: { node_ref: {} } },
    } as unknown as FSItemOriginator;
}

/**
 * Runs the Delete entry and returns what the confirm dialog was given.
 * `confirm_delete` is async (it dynamically imports Dialog), so the mount only
 * happens once the microtask queue drains.
 */
async function run_delete_scoped(
    item: VfsItem,
    visible_ids: string[] | undefined,
): Promise<DialogProps | undefined> {
    const spec = make({
        type: 'FSItem',
        originator: originator_for(item, visible_ids),
    });
    const entry = spec.menu.flat().find((m) => m.name === 'Delete');
    expect(entry).toBeDefined();
    void entry?.action?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return mounted.calls.at(-1)?.props;
}

/** The normal case: the surface is showing both fixtures. */
async function run_delete(item: VfsItem): Promise<DialogProps | undefined> {
    return run_delete_scoped(item, ['live', 'binned']);
}

const ok_of = (props: DialogProps | undefined) =>
    props?.buttons?.find((b) => b.name === 'OK');
const cancel_of = (props: DialogProps | undefined) =>
    props?.buttons?.find((b) => b.name === 'Cancel');

beforeEach(() => {
    mounted.calls.length = 0;
    hardDrive.set(structuredClone(drive));
    vi.restoreAllMocks();
});

describe('right-click Delete', () => {
    it('offers the Recycle Bin for a live item', async () => {
        selectingItems.set(['live']);
        const props = await run_delete(live);
        expect(props?.message).toContain('Recycle Bin');
        expect(props?.message).not.toContain('permanently');
    });

    it('warns about permanence for an item already in the bin', async () => {
        selectingItems.set(['binned']);
        const props = await run_delete(binned);
        expect(props?.message).toContain('permanently');
    });

    // The CRITICAL regression: a batch spanning the bin and the desktop used
    // to be called permanent, and destroyed the live file outright.
    it('never calls a mixed batch permanent, and recycles the live item', async () => {
        selectingItems.set(['binned', 'live']);
        const props = await run_delete(binned);
        expect(props?.message).toContain('Recycle Bin');
        expect(props?.message).not.toContain('permanently');

        // Recycling is `recycle_fs` now, not a raw clone-then-delete: it is
        // the one place the restore breadcrumbs get written, so a delete
        // surface that still cloned by hand would fill the bin with items
        // Restore could not put back.
        const recycle = vi.spyOn(fs, 'recycle_fs').mockImplementation(() => {
            /* no-op */
        });
        const del = vi.spyOn(fs, 'del_fs').mockImplementation(() => {
            /* no-op */
        });
        ok_of(props)?.action();

        // the live one is recycled; the binned one is destroyed outright
        expect(recycle.mock.calls.map((c) => c[0])).toEqual(['live']);
        expect(del.mock.calls.map((c) => c[0])).toEqual(['binned']);
    });

    it('skips ids that are not in the drive', async () => {
        selectingItems.set(['live', 'ghost']);
        const props = await run_delete(live);
        const recycle = vi.spyOn(fs, 'recycle_fs').mockImplementation(() => {
            /* no-op */
        });
        const del = vi.spyOn(fs, 'del_fs').mockImplementation(() => {
            /* no-op */
        });
        ok_of(props)?.action();
        expect(recycle.mock.calls.map((c) => c[0])).toEqual(['live']);
        expect(del).not.toHaveBeenCalled();
    });

    it('Cancel deletes nothing', async () => {
        selectingItems.set(['live']);
        const props = await run_delete(live);
        const del = vi.spyOn(fs, 'del_fs').mockImplementation(() => {
            /* no-op */
        });
        const recycle = vi.spyOn(fs, 'recycle_fs').mockImplementation(() => {
            /* no-op */
        });
        cancel_of(props)?.action();
        expect(del).not.toHaveBeenCalled();
        expect(recycle).not.toHaveBeenCalled();
    });
});

describe('right-click Delete is scoped to the surface that opened it', () => {
    // `selectingItems` is ONE global store shared by the desktop and every
    // Explorer window, and the victim's highlight is focus-gated — so before
    // this, right-clicking Delete in window B silently destroyed an item
    // selected in window A that rendered no selection at all.
    it('ignores a selection the opening surface is not showing', async () => {
        selectingItems.set(['binned', 'live']);
        // this surface shows only `binned`; `live` belongs to another window
        const props = await run_delete_scoped(binned, ['binned']);
        expect(props?.message).toContain('permanently');
        expect(props?.message).toContain('binned.txt');

        const recycle = vi.spyOn(fs, 'recycle_fs').mockImplementation(() => {
            /* no-op */
        });
        const del = vi.spyOn(fs, 'del_fs').mockImplementation(() => {
            /* no-op */
        });
        ok_of(props)?.action();
        expect(del.mock.calls.map((c) => c[0])).toEqual(['binned']);
        expect(recycle).not.toHaveBeenCalled();
        recycle.mockRestore();
        del.mockRestore();
    });

    it('fails CLOSED on an unknown scope: acts on the clicked item alone', async () => {
        selectingItems.set(['binned', 'live']);
        const props = await run_delete_scoped(live, undefined);
        expect(props?.message).toContain('live.txt');

        const recycle = vi.spyOn(fs, 'recycle_fs').mockImplementation(() => {
            /* no-op */
        });
        const del = vi.spyOn(fs, 'del_fs').mockImplementation(() => {
            /* no-op */
        });
        ok_of(props)?.action();
        expect(recycle.mock.calls.map((c) => c[0])).toEqual(['live']);
        expect(del).not.toHaveBeenCalled();
        recycle.mockRestore();
        del.mockRestore();
    });
});

describe('right-click Restore', () => {
    const entry_for = (item: VfsItem, visible_ids: string[] | undefined) =>
        make({
            type: 'FSItem',
            originator: originator_for(item, visible_ids),
        })
            .menu.flat()
            .find((m) => m.name === 'Restore');

    it('is offered for an item in the bin', () => {
        expect(entry_for(binned, ['binned'])).toBeDefined();
    });

    it('is NOT offered for a live item', () => {
        expect(entry_for(live, ['live'])).toBeUndefined();
    });

    it('restores every selected bin item', () => {
        selectingItems.set(['binned']);
        const restore = vi
            .spyOn(fs, 'restore_fs')
            .mockImplementation(() => undefined);
        void entry_for(binned, ['binned'])?.action?.();
        expect(restore.mock.calls.map((c) => c[0])).toEqual(['binned']);
    });

    /*
     * A selection can span surfaces — `selectingItems` is one global store —
     * so an id that is not actually in the bin must not be "restored", which
     * would clone a live item to wherever its breadcrumbs pointed.
     */
    it('ignores selected ids that are not in the bin', () => {
        selectingItems.set(['binned', 'live']);
        const restore = vi
            .spyOn(fs, 'restore_fs')
            .mockImplementation(() => undefined);
        void entry_for(binned, ['binned', 'live'])?.action?.();
        expect(restore.mock.calls.map((c) => c[0])).toEqual(['binned']);
    });
});
