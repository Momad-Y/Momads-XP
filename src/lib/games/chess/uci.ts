export interface BestMove {
    from: string;
    to: string;
    promotion?: string;
}

/** A chess.js move, narrowed to what UCI needs. */
export interface MoveLike {
    from: string;
    to: string;
    promotion?: string;
}

const BESTMOVE = /^bestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?/;

/**
 * Returns null for anything that is not a real move — including
 * `bestmove (none)`, which is what a mated or stalemated engine answers, and
 * every `info` line emitted during the search.
 */
export function parse_bestmove(line: string): BestMove | null {
    const match = BESTMOVE.exec(line.trim());
    if (match == null) return null;
    const [, from, to, promotion] = match;
    if (from == null || to == null) return null;
    return promotion == null ? { from, to } : { from, to, promotion };
}

// Exact matches. `line.includes('uciok')` would also fire on an id or option
// line that happened to mention it, resolving the handshake early.
export function is_uciok(line: string): boolean {
    return line.trim() === 'uciok';
}

export function is_readyok(line: string): boolean {
    return line.trim() === 'readyok';
}

/** chess.js speaks {from,to,promotion}; UCI wants them concatenated. */
export function to_uci(move: MoveLike): string {
    return `${move.from}${move.to}${move.promotion ?? ''}`;
}
