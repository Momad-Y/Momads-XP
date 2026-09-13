import { describe, it, expect } from 'vitest';
import {
    truncate_name,
    other_items_suffix,
    is_permanent_delete,
    plan_delete,
    delete_prompt_icon,
    delete_prompt_message,
} from './delete_prompt';

const BIN = 'aEF1hjqok52tpJPsNeXMGP';

describe('truncate_name', () => {
    it('leaves short names alone', () => {
        expect(truncate_name('report.txt')).toBe('report.txt');
    });

    it('truncates at 70 characters with an ellipsis', () => {
        const long = 'a'.repeat(80) + '.txt';
        expect(truncate_name(long)).toBe('a'.repeat(70) + '...');
    });

    it('does not truncate a name of exactly 70 characters', () => {
        const exact = 'b'.repeat(70);
        expect(truncate_name(exact)).toBe(exact);
    });
});

describe('other_items_suffix', () => {
    it('says nothing for a single item', () => {
        expect(other_items_suffix(1)).toBe('');
    });

    it('is singular for two items', () => {
        expect(other_items_suffix(2)).toBe(' and 1 other item');
    });

    it('is plural beyond two', () => {
        expect(other_items_suffix(5)).toBe(' and 4 other items');
    });

    it('treats an empty batch as no suffix', () => {
        expect(other_items_suffix(0)).toBe('');
    });
});

describe('is_permanent_delete', () => {
    /** A drive shaped `bin > binned-folder > nested`, plus a live folder. */
    const drive: Record<string, { parent?: string }> = {
        [BIN]: {},
        'binned-folder': { parent: BIN },
        nested: { parent: 'binned-folder' },
        deeper: { parent: 'nested' },
        'live-folder': { parent: 'my-documents' },
        'my-documents': {},
    };
    const lookup = (id: string) => drive[id];

    it('is permanent only inside the Recycle Bin', () => {
        expect(is_permanent_delete(BIN, BIN, lookup)).toBe(true);
        expect(is_permanent_delete('live-folder', BIN, lookup)).toBe(false);
    });

    it('treats a missing parent as not-permanent', () => {
        expect(is_permanent_delete(null, BIN, lookup)).toBe(false);
        expect(is_permanent_delete(undefined, BIN, lookup)).toBe(false);
    });

    /*
     * A recycled folder's children keep pointing at THAT FOLDER, not at the
     * bin. Comparing only the immediate parent therefore said "not in the bin"
     * for everything nested inside one, and deleting such an item recycled it
     * a SECOND time — cloning it back to the top of the bin, where it arrived
     * with no restore breadcrumbs and could never be put back.
     */
    it('is permanent for an item nested inside a binned folder', () => {
        expect(is_permanent_delete('binned-folder', BIN, lookup)).toBe(true);
        expect(is_permanent_delete('nested', BIN, lookup)).toBe(true);
    });

    it('walks all the way up, not just one level', () => {
        expect(is_permanent_delete('deeper', BIN, lookup)).toBe(true);
    });

    it('survives a drive whose parents form a cycle', () => {
        const cyclic: Record<string, { parent?: string }> = {
            a: { parent: 'b' },
            b: { parent: 'a' },
        };
        expect(is_permanent_delete('a', BIN, (id) => cyclic[id])).toBe(false);
    });
});

describe('delete_prompt_icon', () => {
    it('uses the delete-confirmation icon when permanent', () => {
        expect(delete_prompt_icon(true)).toContain('DeleteConfirmation');
    });

    it('uses the recycle-bin icon otherwise', () => {
        expect(delete_prompt_icon(false)).toContain('RecycleBin');
    });
});

describe('plan_delete', () => {
    const drive: Record<string, { name: string; parent?: string }> = {
        live: { name: 'live.txt', parent: 'desktop' },
        binned: { name: 'binned.txt', parent: BIN },
        locked: { name: 'entry.txt', parent: 'folder' },
    };
    const lookup = (id: string) => drive[id];
    const guarded = (id: string) => id === 'locked';

    it('keeps only deletable, existing items', () => {
        const plan = plan_delete(
            ['live', 'locked', 'ghost', 'binned'],
            lookup,
            guarded,
            BIN,
        );
        expect(plan.ids).toEqual(['live', 'binned']);
    });

    it('leads the prompt with the first item it will actually delete', () => {
        expect(
            plan_delete(['locked', 'live'], lookup, guarded, BIN).first_name,
        ).toBe('live.txt');
    });

    // the CRITICAL bug: a mixed batch must NOT be called permanent
    it('is only all_permanent when every item is already binned', () => {
        expect(
            plan_delete(['binned'], lookup, guarded, BIN).all_permanent,
        ).toBe(true);
        expect(
            plan_delete(['binned', 'live'], lookup, guarded, BIN).all_permanent,
        ).toBe(false);
        expect(plan_delete(['live'], lookup, guarded, BIN).all_permanent).toBe(
            false,
        );
    });

    it('marks permanence per item, so a mixed batch recycles the live one', () => {
        const plan = plan_delete(['binned', 'live'], lookup, guarded, BIN);
        expect(plan.permanent_ids.has('binned')).toBe(true);
        expect(plan.permanent_ids.has('live')).toBe(false);
    });

    it('an empty or fully-protected selection deletes nothing', () => {
        expect(plan_delete([], lookup, guarded, BIN).ids).toEqual([]);
        expect(plan_delete([], lookup, guarded, BIN).all_permanent).toBe(false);
        expect(plan_delete(['locked'], lookup, guarded, BIN).ids).toEqual([]);
    });
});

describe('delete_prompt_message', () => {
    it('offers the Recycle Bin for a normal single delete', () => {
        expect(delete_prompt_message('notes.txt', 1, false)).toBe(
            'Do you want to move notes.txt to the Recycle Bin?',
        );
    });

    it('warns about permanence inside the bin', () => {
        expect(delete_prompt_message('notes.txt', 1, true)).toBe(
            "Do you want to permanently delete notes.txt? This action can't be undone?",
        );
    });

    it('counts the other items in a batch', () => {
        expect(delete_prompt_message('a.txt', 3, false)).toBe(
            'Do you want to move a.txt and 2 other items to the Recycle Bin?',
        );
    });

    it('truncates a long name inside the message', () => {
        const long = 'z'.repeat(90) + '.txt';
        expect(delete_prompt_message(long, 1, false)).toContain(
            'z'.repeat(70) + '...',
        );
    });

    // The bug this module exists to prevent: a batch containing any live item
    // must never be described as a permanent delete.
    it('never promises permanence unless the whole batch is already binned', () => {
        expect(delete_prompt_message('live.txt', 2, false)).toContain(
            'Recycle Bin',
        );
        expect(delete_prompt_message('live.txt', 2, false)).not.toContain(
            'permanently',
        );
    });
});
