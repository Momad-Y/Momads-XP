import { describe, expect, it } from 'vitest';
import { key_code_for } from './keymap';

/*
 * These assert EXACT VALUES, and that is the entire point of the file.
 *
 * The previous version of this suite checked `toBeGreaterThan(0)` and "every
 * mapped key is distinct". Both of those passed against a table of DOS set-1
 * scancodes that js-dos discarded wholesale — DOOM ran its attract demo and
 * ignored every key a visitor pressed, and all three tests stayed green. A
 * lookup table's only interesting property is WHICH NUMBER comes out, so a
 * test that does not name the number cannot fail when the table is wrong.
 *
 * The numbers are GLFW key codes, which is what js-dos's `KBD_KEYS` enum is.
 */
describe('doom keymap', () => {
    it('maps the keys DOOM plays with to their GLFW codes', () => {
        // Movement.
        expect(key_code_for('ArrowUp')).toBe(265);
        expect(key_code_for('ArrowDown')).toBe(264);
        expect(key_code_for('ArrowLeft')).toBe(263);
        expect(key_code_for('ArrowRight')).toBe(262);
        // Fire, use, strafe, run.
        expect(key_code_for('ControlLeft')).toBe(341);
        expect(key_code_for('Space')).toBe(32);
        expect(key_code_for('AltLeft')).toBe(342);
        expect(key_code_for('ShiftLeft')).toBe(340);
        // Menu, confirm, automap.
        expect(key_code_for('Escape')).toBe(256);
        expect(key_code_for('Enter')).toBe(257);
        expect(key_code_for('Tab')).toBe(258);
        // Weapon select, and the y/n the quit prompt waits on.
        expect(key_code_for('Digit1')).toBe(49);
        expect(key_code_for('Digit5')).toBe(53);
        expect(key_code_for('KeyY')).toBe(89);
        expect(key_code_for('KeyN')).toBe(78);
    });

    it('numbers printable keys as ASCII', () => {
        // GLFW's printable range IS ASCII, so this is the property that makes
        // the letter and digit rows correct by construction rather than by
        // transcription. A table built from scancodes fails every line.
        for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
            expect(key_code_for(`Key${letter}`)).toBe(letter.charCodeAt(0));
        }
        for (let digit = 0; digit <= 9; digit++) {
            expect(key_code_for(`Digit${String(digit)}`)).toBe(
                String(digit).charCodeAt(0),
            );
        }
    });

    it('keeps every named key inside GLFW’s 256+ block', () => {
        // The bug that shipped put Escape at 1 and the arrows at 328-336 --
        // values that either mean nothing to js-dos or, worse, mean a keypad
        // key. Anything that is not a printable character must be >= 256.
        const named = [
            'Escape',
            'Enter',
            'Tab',
            'Backspace',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'ControlLeft',
            'ControlRight',
            'ShiftLeft',
            'ShiftRight',
            'AltLeft',
            'AltRight',
            'F1',
            'F12',
            'Home',
            'End',
        ];
        for (const code of named) {
            expect(key_code_for(code), `${code} out of range`).toBeGreaterThan(
                255,
            );
        }
    });

    it('returns 0 for keys it does not handle', () => {
        expect(key_code_for('F13')).toBe(0);
        expect(key_code_for('')).toBe(0);
        expect(key_code_for('MediaPlayPause')).toBe(0);
    });

    it('assigns a distinct code to every mapped key', () => {
        // A duplicate would make one key silently act as another. Kept from
        // the original suite -- it is a real invariant, it just was never
        // sufficient on its own.
        const codes = Object.keys({
            ArrowUp: 0,
            ArrowDown: 0,
            ArrowLeft: 0,
            ArrowRight: 0,
            ControlLeft: 0,
            Space: 0,
            Escape: 0,
            Enter: 0,
            ShiftLeft: 0,
            AltLeft: 0,
            Tab: 0,
        }).map(key_code_for);
        expect(new Set(codes).size).toBe(codes.length);
    });
});
