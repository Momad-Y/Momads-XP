import { describe, it, expect } from 'vitest';
import { scoped_ids } from './selection';

describe('scoped_ids', () => {
    it('keeps only the ids the acting surface is showing', () => {
        expect(scoped_ids(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual([
            'b',
            'c',
        ]);
    });

    it('drops another window/desktop selection entirely', () => {
        // the cross-window delete: window B shows only 'notes'
        expect(scoped_ids(['desktop_icon', 'notes'], ['notes'])).toEqual([
            'notes',
        ]);
    });

    it('preserves the selection order, not the scope order', () => {
        expect(scoped_ids(['c', 'a'], ['a', 'b', 'c'])).toEqual(['c', 'a']);
    });

    it('returns empty when nothing selected is on show', () => {
        expect(scoped_ids(['x'], ['y'])).toEqual([]);
    });

    it('fails CLOSED on an unknown scope: falls back, never the raw selection', () => {
        expect(scoped_ids(['a', 'b'], null, ['b'])).toEqual(['b']);
        expect(scoped_ids(['a', 'b'], undefined, ['b'])).toEqual(['b']);
    });

    it('an unknown scope with no fallback yields nothing at all', () => {
        expect(scoped_ids(['a', 'b'], null)).toEqual([]);
    });

    it('does not mutate its inputs', () => {
        const selected = ['a', 'b'];
        const scope = ['a'];
        const out = scoped_ids(selected, scope);
        expect(selected).toEqual(['a', 'b']);
        expect(scope).toEqual(['a']);
        expect(out).not.toBe(selected);
    });

    it('handles an empty selection and an empty scope', () => {
        expect(scoped_ids([], ['a'])).toEqual([]);
        expect(scoped_ids(['a'], [])).toEqual([]);
    });
});
