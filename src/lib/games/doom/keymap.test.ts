import { describe, expect, it } from 'vitest';
import { scancode_for } from './keymap';

describe('doom keymap', () => {
    it('maps every key DOOM actually needs', () => {
        // Movement, strafe, fire, use, menu, and the weapon digits. A gap here
        // is a key the player presses and nothing happens.
        for (const code of [
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'ControlLeft',
            'Space',
            'Escape',
            'Enter',
            'ShiftLeft',
            'AltLeft',
            'Tab',
            'Digit1',
            'Digit5',
            'KeyY',
            'KeyN',
        ]) {
            expect(scancode_for(code), `${code} unmapped`).toBeGreaterThan(0);
        }
    });

    it('returns 0 for keys it does not handle', () => {
        expect(scancode_for('F13')).toBe(0);
        expect(scancode_for('')).toBe(0);
    });

    it('assigns a distinct scancode to every mapped key', () => {
        // A duplicate would make one key silently act as another.
        const codes = [
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'ControlLeft',
            'Space',
            'Escape',
            'Enter',
            'ShiftLeft',
            'AltLeft',
            'Tab',
        ].map(scancode_for);
        expect(new Set(codes).size).toBe(codes.length);
    });
});
