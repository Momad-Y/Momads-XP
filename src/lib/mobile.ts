/**
 * Viewport-mode decision (§4.6 breakpoint summary):
 *
 * | Viewport  | Orientation | Experience                      |
 * | --------- | ----------- | ------------------------------- |
 * | >= 1024px | Any         | Full XP desktop                 |
 * | <  1024px | Portrait    | Simplified mobile portfolio     |
 * | <  1024px | Landscape   | Prompt to rotate or use desktop |
 *
 * Pure — decided once at load in +page.svelte (design decision 8: mode
 * locking; a booted desktop never live-switches).
 */

export type ViewMode = 'desktop' | 'mobile' | 'rotate';

export const DESKTOP_MIN_WIDTH = 1024;

export function decideMode(width: number, height: number): ViewMode {
    if (width >= DESKTOP_MIN_WIDTH) return 'desktop';
    return height >= width ? 'mobile' : 'rotate';
}
