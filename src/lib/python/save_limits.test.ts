import { describe, expect, it } from 'vitest';
import {
    byte_length,
    LIMITS,
    normalise_name,
    reject_reason,
    rejection_text,
    SaveGate,
} from './save_limits';

const ok = { name: 'main.py', text: 'print(1)' };

describe('reject_reason', () => {
    it('accepts an ordinary script', () => {
        expect(reject_reason(ok)).toBeNull();
    });

    it('rejects anything that could express a path', () => {
        for (const name of [
            '../escape.py',
            'a/b.py',
            'a\\b.py',
            '/abs.py',
            '..',
            '.',
        ]) {
            expect(reject_reason({ ...ok, name }), name).not.toBeNull();
        }
    });

    it('rejects a name with no basename, which would title a window blank', () => {
        expect(reject_reason({ ...ok, name: '.py' })).toBe('empty-basename');
    });

    it('rejects leading or trailing space', () => {
        expect(reject_reason({ ...ok, name: ' a.py' })).toBe('bad-name');
        expect(reject_reason({ ...ok, name: 'a.py ' })).toBe('bad-name');
    });

    it('cannot be smuggled past the anchor with a newline', () => {
        // JS `$` matches before a trailing newline in non-multiline mode for
        // some engines' dialects; this asserts ours does not accept it.
        expect(reject_reason({ ...ok, name: 'a.py\n' })).toBe('bad-name');
        expect(reject_reason({ ...ok, name: 'a.py\nb' })).toBe('bad-name');
    });

    it('measures UTF-8 bytes, not UTF-16 units', () => {
        // '好' is 1 unit but 3 bytes; counting units under-counts by 3x and
        // lets a 768 KB file through a 256 KB cap.
        const cjk = '好'.repeat(Math.ceil(LIMITS.max_bytes / 3));
        expect(cjk.length).toBeLessThan(LIMITS.max_bytes);
        expect(byte_length(cjk)).toBeGreaterThanOrEqual(LIMITS.max_bytes);
        expect(reject_reason({ ...ok, text: cjk })).toBe('too-large');
    });

    it('explains every rejection in words a visitor can act on', () => {
        for (const reason of [
            'bad-name',
            'reserved-name',
            'empty-basename',
            'too-large',
        ] as const) {
            expect(rejection_text('x.py', reason)).toContain('x.py');
            expect(rejection_text('x.py', reason).length).toBeGreaterThan(20);
        }
    });
});

describe('normalise_name', () => {
    it('lowercases the extension, as new_fs_item_raw does', () => {
        // Without this, NOTES.TXT saves as NOTES.txt, never matches on the
        // next lookup, and is re-created every statement until the file cap.
        expect(normalise_name('NOTES.TXT')).toBe('NOTES.txt');
        expect(normalise_name('Main.PY')).toBe('Main.py');
    });

    it('leaves a name with no extension, and a dotfile, alone', () => {
        expect(normalise_name('README')).toBe('README');
        expect(normalise_name('.bashrc')).toBe('.bashrc');
    });
});

describe('SaveGate', () => {
    it('permits one save, then refuses until the interval has passed', () => {
        // Faster than this and desktop.svelte's 1000ms whole-drive persist
        // debounce is re-armed forever, so the drive is never written while
        // the app still looks alive.
        const gate = new SaveGate();
        expect(gate.allow(0)).toBe(true);
        expect(gate.allow(500)).toBe(false);
        expect(gate.allow(LIMITS.min_interval_ms - 1)).toBe(false);
        expect(gate.allow(LIMITS.min_interval_ms)).toBe(true);
    });

    it('stops entirely at the lifetime budget', () => {
        const gate = new SaveGate();
        let now = 0;
        for (let i = 0; i < LIMITS.max_per_runtime; i++) {
            expect(gate.allow(now), `save ${String(i)}`).toBe(true);
            now += LIMITS.min_interval_ms;
        }
        expect(gate.exhausted()).toBe(true);
        expect(gate.allow(now + LIMITS.min_interval_ms)).toBe(false);
    });

    it('is not exhausted before the budget is spent', () => {
        const gate = new SaveGate();
        gate.allow(0);
        expect(gate.exhausted()).toBe(false);
    });

    it('resets, for a fresh runtime', () => {
        const gate = new SaveGate();
        gate.allow(0);
        gate.reset();
        expect(gate.allow(0)).toBe(true);
    });
});
