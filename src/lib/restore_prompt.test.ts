import { describe, expect, it } from 'vitest';
import { needs_restore_prompt, restore_prompt_message } from './restore_prompt';

/**
 * Restore has one case it cannot honour: an entry recycled before breadcrumbs
 * shipped, whose origin is unrecoverable. It lands on the Desktop, and that
 * has to be said rather than done quietly — a file deleted from a folder
 * reappearing somewhere else reads as a bug even though nothing was lost.
 */

describe('needs_restore_prompt', () => {
    const known = (id: string) => id.startsWith('known');

    it('does not ask when every entry knows where it belongs', () => {
        expect(needs_restore_prompt(['known-1', 'known-2'], known)).toBe(false);
    });

    it('asks when an entry has no recoverable origin', () => {
        expect(needs_restore_prompt(['legacy-1'], known)).toBe(true);
    });

    /*
     * A mixed batch asks, because it cannot be honoured exactly: part of it
     * goes home and the rest does not.
     */
    it('asks when only some of the batch is placeable', () => {
        expect(needs_restore_prompt(['known-1', 'legacy-1'], known)).toBe(true);
    });

    it('does not ask about nothing', () => {
        expect(needs_restore_prompt([], known)).toBe(false);
    });
});

describe('restore_prompt_message', () => {
    it('names the file and where it will go', () => {
        const message = restore_prompt_message('notes.txt', 1);
        expect(message).toContain('notes.txt');
        expect(message).toContain('cannot determine the original location');
        expect(message).toContain('Desktop');
    });

    /* The same counting rule the delete prompt uses — one shared source. */
    it('counts the rest of the batch, XP style', () => {
        expect(restore_prompt_message('notes.txt', 2)).toContain(
            'and 1 other item',
        );
        expect(restore_prompt_message('notes.txt', 4)).toContain(
            'and 3 other items',
        );
    });

    it('truncates a very long name rather than stretching the box', () => {
        const long = 'x'.repeat(200);
        const message = restore_prompt_message(long, 1);
        expect(message).toContain('...');
        expect(message).not.toContain(long);
    });
});
