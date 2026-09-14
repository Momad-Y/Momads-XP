import { describe, expect, it } from 'vitest';
import {
    BOUNCE,
    CARD_H,
    GRAVITY,
    launch,
    step_cascade,
    type Bouncer,
} from './cascade';

const bounds = { width: 700, height: 400 };
const at = (over: Partial<Bouncer> = {}): Bouncer => ({
    code: 'AS',
    x: 300,
    y: 0,
    vx: -3,
    vy: 0,
    ...over,
});

describe('win cascade physics', () => {
    it('accelerates downward and drifts left', () => {
        const [card] = step_cascade([at()], bounds);
        expect(card?.vy).toBeCloseTo(GRAVITY);
        expect(card?.y).toBeCloseTo(GRAVITY);
        expect(card?.x).toBeCloseTo(297);
    });

    it('bounces off the felt with energy lost, never through it', () => {
        // Falling fast, already at the floor.
        const floor = bounds.height - CARD_H;
        const [card] = step_cascade([at({ y: floor, vy: 20 })], bounds);
        expect(card?.y).toBe(floor); // never below
        expect(card?.vy).toBeLessThan(0); // heading back up
        expect(Math.abs(card?.vy ?? 0)).toBeLessThan(20 + GRAVITY); // slower
        expect(card?.vy).toBeCloseTo(-(20 + GRAVITY) * BOUNCE);
    });

    it('settles rather than bouncing forever', () => {
        // The whole point of BOUNCE < 1: a card that never lost energy would
        // keep the animation frame loop alive for the life of the window.
        let cards = [at({ y: bounds.height - CARD_H, vy: 30, vx: 0 })];
        let peak = Infinity;
        for (let i = 0; i < 400; i++) {
            cards = step_cascade(cards, bounds);
            const vy = cards[0]?.vy ?? 0;
            if (vy < 0) peak = Math.min(peak, vy);
        }
        expect(Math.abs(peak)).toBeLessThan(30);
    });

    it('drops cards once they leave the felt, so the loop can end', () => {
        expect(step_cascade([at({ x: -200 })], bounds)).toHaveLength(0);
        expect(
            step_cascade([at({ x: bounds.width + 200 })], bounds),
        ).toHaveLength(0);
        expect(step_cascade([at({ x: 10 })], bounds)).toHaveLength(1);
    });

    it('never mutates the cards it was given', () => {
        const cards = [at()];
        const before = JSON.stringify(cards);
        step_cascade(cards, bounds);
        expect(JSON.stringify(cards)).toBe(before);
    });

    it('launches from the top right, always moving left', () => {
        for (const r of [0, 0.5, 0.999]) {
            const card = launch('KH', bounds, () => r);
            expect(card.x).toBeLessThan(bounds.width);
            expect(card.x).toBeGreaterThan(bounds.width - 200);
            expect(card.vx).toBeLessThan(0);
            expect(card.vy).toBe(0);
            expect(card.code).toBe('KH');
        }
    });
});
