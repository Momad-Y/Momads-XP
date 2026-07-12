import { describe, expect, it } from 'vitest';
import { decideMode } from './mobile';

describe('decideMode (§4.6 breakpoint table)', () => {
    it('>=1024px width is the full desktop, any orientation', () => {
        expect(decideMode(1280, 800)).toBe('desktop');
        expect(decideMode(1024, 1366)).toBe('desktop'); // portrait tablet at the floor
        expect(decideMode(1024, 500)).toBe('desktop'); // boundary, landscape
    });

    it('<1024px portrait is the mobile portfolio', () => {
        expect(decideMode(390, 844)).toBe('mobile');
        expect(decideMode(1023, 1024)).toBe('mobile');
        expect(decideMode(500, 500)).toBe('mobile'); // square counts as portrait
    });

    it('<1024px landscape is the rotate prompt', () => {
        expect(decideMode(844, 390)).toBe('rotate');
        expect(decideMode(1023, 768)).toBe('rotate');
    });
});
