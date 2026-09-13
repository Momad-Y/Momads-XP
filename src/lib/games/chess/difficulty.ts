export type Level = 'easy' | 'medium' | 'hard';

export interface EngineLimits {
    /** Stockfish's `Skill Level`, 0-20. */
    skill: number;
    /** Search depth cap, for latency rather than strength. */
    depth: number;
}

export const LEVELS: Level[] = ['easy', 'medium', 'hard'];

/**
 * `Skill Level` is the ONLY strength knob this build exposes.
 *
 * Verified by driving the shipped binary over UCI: it advertises
 * `option name Skill Level type spin default 20 min 0 max 20`, and neither
 * `UCI_Elo` nor `UCI_LimitStrength` appears at all — so limiting by rating is
 * not available here, whatever other Stockfish builds offer.
 *
 * Depth is capped separately, and for a different reason: even at skill 0 the
 * engine searches, and a portfolio visitor should not wait seconds for a
 * reply. Capping depth ALONE would not work as a difficulty control — a
 * depth-1 engine plays greedy, piece-hanging chess that reads as a bug rather
 * than as an easy opponent, which is why skill carries the strength and depth
 * carries the latency.
 */
export const LIMITS: Record<Level, EngineLimits> = {
    easy: { skill: 0, depth: 5 },
    medium: { skill: 5, depth: 8 },
    hard: { skill: 12, depth: 12 },
};

export const LEVEL_LABELS: Record<Level, string> = {
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
};

/** The exact commands the engine needs to answer one position. */
export function go_commands(level: Level, moves: readonly string[]): string[] {
    const limits = LIMITS[level];
    return [
        `setoption name Skill Level value ${String(limits.skill)}`,
        // `position startpos moves` with an empty list is malformed; Stockfish
        // answers it with silence rather than an error.
        moves.length === 0
            ? 'position startpos'
            : `position startpos moves ${moves.join(' ')}`,
        `go depth ${String(limits.depth)}`,
    ];
}
