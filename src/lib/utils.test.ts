import { describe, it, expect } from 'vitest';
import * as utils from './utils';

describe('activate', () => {
    function press(key: string): { fired: number; prevented: number } {
        let fired = 0;
        let prevented = 0;
        const handler = utils.activate(() => {
            fired++;
        });
        handler({
            key,
            preventDefault: () => {
                prevented++;
            },
        });
        return { fired, prevented };
    }

    it('fires on Enter and Space, the two keys a button responds to', () => {
        expect(press('Enter').fired).toBe(1);
        expect(press(' ').fired).toBe(1);
    });

    it('swallows the default so Space does not scroll the list', () => {
        expect(press(' ').prevented).toBe(1);
    });

    it('ignores every other key, including Escape and Tab', () => {
        for (const key of ['Escape', 'Tab', 'a', 'ArrowDown', 'Spacebar']) {
            expect(press(key)).toEqual({ fired: 0, prevented: 0 });
        }
    });
});
