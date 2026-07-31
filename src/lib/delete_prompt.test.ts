import { describe, it, expect } from 'vitest';
import {
    truncate_name,
    other_items_suffix,
    is_permanent_delete,
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
    it('is permanent only inside the Recycle Bin', () => {
        expect(is_permanent_delete(BIN, BIN)).toBe(true);
        expect(is_permanent_delete('some-folder', BIN)).toBe(false);
    });

    it('treats a missing parent as not-permanent', () => {
        expect(is_permanent_delete(null, BIN)).toBe(false);
        expect(is_permanent_delete(undefined, BIN)).toBe(false);
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
