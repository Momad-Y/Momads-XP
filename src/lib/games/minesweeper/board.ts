import type { Preset } from './difficulty';

export type CellState = 'hidden' | 'revealed' | 'flagged';
export type Status = 'ready' | 'playing' | 'won' | 'lost';

export interface Cell {
    mine: boolean;
    /** Mines in the eight surrounding cells. Meaningless until mines exist. */
    adjacent: number;
    state: CellState;
}

export interface Board {
    cols: number;
    rows: number;
    mines: number;
    /** Row-major, length `cols * rows`. */
    cells: readonly Cell[];
    status: Status;
    revealed_count: number;
}

/**
 * Every function here returns a NEW board and never mutates its argument
 * (`coding-style.md`). The component depends on that: it reassigns its
 * `board` variable to invalidate, and a mutating update would make the
 * reassignment look redundant right up until something else held a reference.
 */

const over = (status: Status): boolean => status === 'won' || status === 'lost';

export function new_board(preset: Preset): Board {
    return {
        cols: preset.cols,
        rows: preset.rows,
        mines: preset.mines,
        cells: Array.from({ length: preset.cols * preset.rows }, () => ({
            mine: false,
            adjacent: 0,
            state: 'hidden',
        })),
        status: 'ready',
        revealed_count: 0,
    };
}

/** Indices of the up-to-eight cells touching `index`. */
export function neighbours(board: Board, index: number): number[] {
    const x = index % board.cols;
    const y = Math.floor(index / board.cols);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= board.cols || ny >= board.rows) {
                continue;
            }
            out.push(ny * board.cols + nx);
        }
    }
    return out;
}

/**
 * Place the mines, excluding `safe` (spec D5).
 *
 * XP's guarantee is that the FIRST CLICK is never a mine — not that it opens
 * an area, which is Windows 7's rule. Excluding the eight neighbours too would
 * change Expert's density noticeably, so only `safe` itself is excluded.
 */
function place_mines(board: Board, safe: number, rng: () => number): Board {
    const candidates: number[] = [];
    for (let i = 0; i < board.cells.length; i++) {
        if (i !== safe) candidates.push(i);
    }
    // Partial Fisher-Yates: shuffle only as far as we need to draw.
    const wanted = Math.min(board.mines, candidates.length);
    for (let i = 0; i < wanted; i++) {
        const j = i + Math.floor(rng() * (candidates.length - i));
        const a = candidates[i];
        const b = candidates[Math.min(j, candidates.length - 1)];
        if (a == null || b == null) continue;
        candidates[i] = b;
        candidates[Math.min(j, candidates.length - 1)] = a;
    }
    const mined = new Set(candidates.slice(0, wanted));

    const cells: Cell[] = board.cells.map((cell, i) => ({
        ...cell,
        mine: mined.has(i),
    }));
    const placed: Board = { ...board, cells };
    return {
        ...placed,
        cells: cells.map((cell, i) => ({
            ...cell,
            adjacent: neighbours(placed, i).filter(
                (n) => cells[n]?.mine === true,
            ).length,
        })),
    };
}

export function reveal(
    board: Board,
    index: number,
    rng: () => number = Math.random,
): Board {
    if (over(board.status)) return board;
    const target = board.cells[index];
    if (target == null) return board;
    if (target.state !== 'hidden') return board;

    const seeded =
        board.status === 'ready'
            ? { ...place_mines(board, index, rng), status: 'playing' as Status }
            : board;

    if (seeded.cells[index]?.mine === true) {
        return {
            ...seeded,
            status: 'lost',
            cells: seeded.cells.map((cell) =>
                cell.mine ? { ...cell, state: 'revealed' } : cell,
            ),
        };
    }

    // Explicit stack, not recursion: Expert is 480 cells and an empty region
    // can span most of them.
    const cells = [...seeded.cells];
    const stack = [index];
    let revealed = seeded.revealed_count;
    while (stack.length > 0) {
        const at = stack.pop();
        if (at == null) continue;
        const cell = cells[at];
        if (cell == null || cell.state !== 'hidden') continue;
        cells[at] = { ...cell, state: 'revealed' };
        revealed += 1;
        if (cell.adjacent === 0) {
            for (const n of neighbours(seeded, at)) {
                if (cells[n]?.state === 'hidden') stack.push(n);
            }
        }
    }

    const safe_total = seeded.cols * seeded.rows - seeded.mines;
    return {
        ...seeded,
        cells,
        revealed_count: revealed,
        status: revealed >= safe_total ? 'won' : seeded.status,
    };
}

export function toggle_flag(board: Board, index: number): Board {
    if (over(board.status)) return board;
    const cell = board.cells[index];
    if (cell == null || cell.state === 'revealed') return board;
    const cells = [...board.cells];
    cells[index] = {
        ...cell,
        state: cell.state === 'flagged' ? 'hidden' : 'flagged',
    };
    return { ...board, cells };
}

/** May go negative, exactly as XP's counter does. */
export function flags_left(board: Board): number {
    return (
        board.mines - board.cells.filter((c) => c.state === 'flagged').length
    );
}
