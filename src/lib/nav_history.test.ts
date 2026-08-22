import { describe, it, expect } from 'vitest';
import {
    can_go_back,
    can_go_forward,
    current_entry,
    go_to,
    push_entry,
    replace_entry,
} from './nav_history';
import type { NavState } from './nav_history';

const start: NavState = { entries: ['about:home'], index: 0 };

describe('push_entry', () => {
    it('appends and moves the cursor', () => {
        const s = push_entry(start, 'https://a.com');
        expect(s.entries).toEqual(['about:home', 'https://a.com']);
        expect(s.index).toBe(1);
    });

    it('truncates forward history', () => {
        let s = push_entry(start, 'https://a.com');
        s = push_entry(s, 'https://b.com');
        s = go_to(s, 0);
        s = push_entry(s, 'https://c.com');
        expect(s.entries).toEqual(['about:home', 'https://c.com']);
        expect(s.index).toBe(1);
    });

    it('does not add a step for the page already on screen', () => {
        const s = push_entry(start, 'about:home');
        expect(s).toBe(start);
    });

    it('never mutates the state it was given', () => {
        const s = push_entry(start, 'https://a.com');
        expect(start.entries).toEqual(['about:home']);
        expect(s.entries).not.toBe(start.entries);
    });
});

describe('replace_entry', () => {
    it('swaps the current entry without adding a step', () => {
        const s = replace_entry(
            { entries: ['about:home', 'https://google.com'], index: 1 },
            'https://www.google.com/',
        );
        expect(s.entries).toEqual(['about:home', 'https://www.google.com/']);
        expect(s.index).toBe(1);
    });

    it('leaves entries ahead of the cursor alone', () => {
        const s = replace_entry(
            { entries: ['a', 'b', 'c'], index: 1 },
            'b-final',
        );
        expect(s.entries).toEqual(['a', 'b-final', 'c']);
    });

    it('is a no-op when the URL already matches', () => {
        const state: NavState = { entries: ['a', 'b'], index: 1 };
        expect(replace_entry(state, 'b')).toBe(state);
    });

    it('ignores an out-of-range cursor rather than corrupting the trail', () => {
        const bad: NavState = { entries: [], index: 0 };
        expect(replace_entry(bad, 'x')).toBe(bad);
    });
});

/**
 * The reported bug, end to end: visiting a redirecting site and pressing Back.
 * With `push_entry` on the redirect this loop never terminates — which is
 * exactly what "it stays on the site" looked like.
 */
describe('Back on a site that redirects', () => {
    it('leaves the site when the redirect REPLACES', () => {
        let s = push_entry(start, 'https://google.com'); // user types it
        s = replace_entry(s, 'https://www.google.com/'); // proxy followed a 301
        expect(s.entries).toEqual(['about:home', 'https://www.google.com/']);

        expect(can_go_back(s)).toBe(true);
        s = go_to(s, s.index - 1);
        expect(current_entry(s)).toBe('about:home');
    });

    it('is trapped on the site when the redirect APPENDS (the old behaviour)', () => {
        let s = push_entry(start, 'https://google.com');
        s = push_entry(s, 'https://www.google.com/'); // the bug
        expect(s.index).toBe(2);

        // Back lands on the URL that redirects …
        s = go_to(s, s.index - 1);
        expect(current_entry(s)).toBe('https://google.com');
        // … which redirects again and re-appends, putting the user right back
        s = push_entry(s, 'https://www.google.com/');
        expect(current_entry(s)).toBe('https://www.google.com/');
        expect(can_go_back(s)).toBe(true); // forever
    });
});

describe('go_to / can_go_*', () => {
    const three: NavState = { entries: ['a', 'b', 'c'], index: 1 };

    it('moves within range', () => {
        expect(go_to(three, 2).index).toBe(2);
        expect(go_to(three, 0).index).toBe(0);
    });

    it('ignores out-of-range and no-op moves', () => {
        expect(go_to(three, -1)).toBe(three);
        expect(go_to(three, 3)).toBe(three);
        expect(go_to(three, 1)).toBe(three);
    });

    it('reports the ends of the trail', () => {
        expect(can_go_back({ entries: ['a'], index: 0 })).toBe(false);
        expect(can_go_forward({ entries: ['a'], index: 0 })).toBe(false);
        expect(can_go_back(three)).toBe(true);
        expect(can_go_forward(three)).toBe(true);
    });

    it('current_entry is null for a malformed state', () => {
        expect(current_entry({ entries: [], index: 0 })).toBeNull();
    });
});
