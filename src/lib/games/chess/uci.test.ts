import { describe, expect, it } from 'vitest';
import { LIMITS, go_commands, LEVELS } from './difficulty';
import { is_readyok, is_uciok, parse_bestmove, to_uci } from './uci';

describe('chess difficulty', () => {
    it('maps three levels to increasing strength', () => {
        expect(LIMITS.easy.skill).toBeLessThan(LIMITS.medium.skill);
        expect(LIMITS.medium.skill).toBeLessThan(LIMITS.hard.skill);
        expect(LIMITS.easy.depth).toBeLessThanOrEqual(LIMITS.hard.depth);
    });

    it('keeps skill inside the range the engine advertises', () => {
        /*
         * Verified against the shipped binary by driving it over UCI:
         *   option name Skill Level type spin default 20 min 0 max 20
         * Stockfish ignores an out-of-range setoption silently, so a value of
         * 30 would not error — difficulty would simply stop doing anything.
         */
        for (const level of LEVELS) {
            expect(LIMITS[level].skill).toBeGreaterThanOrEqual(0);
            expect(LIMITS[level].skill).toBeLessThanOrEqual(20);
            expect(LIMITS[level].depth).toBeGreaterThan(0);
        }
    });

    it('builds the command sequence for a position', () => {
        expect(go_commands('easy', ['e2e4', 'e7e5'])).toEqual([
            `setoption name Skill Level value ${String(LIMITS.easy.skill)}`,
            'position startpos moves e2e4 e7e5',
            `go depth ${String(LIMITS.easy.depth)}`,
        ]);
    });

    it('omits the moves suffix from the opening position', () => {
        // `position startpos moves` with nothing after it is malformed, and
        // Stockfish answers it with silence rather than an error.
        expect(go_commands('hard', [])[1]).toBe('position startpos');
    });
});

describe('uci parsing', () => {
    it('reads a plain bestmove', () => {
        expect(parse_bestmove('bestmove e7e6 ponder b1c3')).toEqual({
            from: 'e7',
            to: 'e6',
        });
    });

    it('reads a promotion', () => {
        expect(parse_bestmove('bestmove a7a8q')).toEqual({
            from: 'a7',
            to: 'a8',
            promotion: 'q',
        });
    });

    it('returns null for info lines and for (none)', () => {
        // `bestmove (none)` is what a mated or stalemated engine answers.
        expect(parse_bestmove('info depth 6 score cp 21 pv e2e4')).toBeNull();
        expect(parse_bestmove('bestmove (none)')).toBeNull();
        expect(parse_bestmove('')).toBeNull();
    });

    it('recognises the handshake lines exactly', () => {
        expect(is_uciok('uciok')).toBe(true);
        expect(is_readyok('readyok')).toBe(true);
        expect(is_uciok('id name Stockfish 2019-08-15 Multi-Variant')).toBe(
            false,
        );
        expect(is_readyok('uciok')).toBe(false);

        /*
         * These are the cases that pin EXACT matching rather than `includes`.
         * A substring test would resolve the handshake on any line that merely
         * mentions the token — an `info string` echo, or two lines arriving
         * concatenated — and the engine would then be sent `position`/`go`
         * before it had finished announcing its options.
         */
        expect(is_uciok('uciok extra')).toBe(false);
        expect(is_uciok('info string uciok')).toBe(false);
        expect(is_readyok('readyok now')).toBe(false);
        // ...while surrounding whitespace is still tolerated.
        expect(is_uciok('  uciok\r')).toBe(true);
    });

    it('renders a chess.js move as a UCI token', () => {
        expect(to_uci({ from: 'e2', to: 'e4' })).toBe('e2e4');
        expect(to_uci({ from: 'a7', to: 'a8', promotion: 'q' })).toBe('a7a8q');
    });
});
