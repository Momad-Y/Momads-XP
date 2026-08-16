/**
 * Shared Favorites — one list backing both Internet Explorer's Favorites
 * sidebar/menu and My Computer's Favorites menu (XP keeps a single Favorites
 * shell folder). Seeded from profile.social on first run; persisted to
 * localStorage so additions survive reloads.
 */
import { writable } from 'svelte/store';
import { profile } from './profile';
import { doctypes } from './system';
import type { HardDrive } from './types';

export interface Favorite {
    name: string;
    /**
     * Web address for a page favourite. For a FOLDER favourite this holds the
     * XP-style path (e.g. `C:\Experience`) purely for display — `fs_id` is what
     * actually gets opened.
     */
    url: string;
    /**
     * Set when the favourite points at something in the VFS — a folder OR a
     * file — rather than a web page. XP keeps one Favorites list for both
     * Explorer and IE, so the two kinds live side by side and each app opens
     * whichever it can.
     */
    fs_id?: string;
}

/** A favourite that points into the file system rather than at a web page. */
export function is_shell_favorite(fav: Favorite): boolean {
    return typeof fav.fs_id === 'string' && fav.fs_id !== '';
}

/**
 * The icon a favourite should show, resolved from the live drive so a FILE
 * gets its own icon rather than a folder glyph. Shared by the Explorer menu,
 * the IE menu and the Organize dialog — they previously each hardcoded this
 * and drifted apart.
 */
export function favorite_icon(
    fav: Favorite,
    drive: HardDrive | null | undefined,
): string {
    if (!is_shell_favorite(fav) || fav.fs_id == null) {
        return '/images/xp/icons/URL.png';
    }
    const item = drive?.[fav.fs_id];
    if (item?.icon != null && item.icon !== '') return item.icon;
    if (item?.type === 'file') {
        // fall back to the extension's registered handler icon
        const handlers = doctypes[item.ext.toLowerCase()];
        const handler_icon = handlers?.[0]?.icon;
        if (handler_icon != null && handler_icon !== '') return handler_icon;
        return '/images/xp/icons/Default.png';
    }
    return '/images/xp/icons/FolderClosed.png';
}

const STORAGE_KEY = 'xp_favorites';

/** Validate one persisted entry. */
export function is_favorite(value: unknown): value is Favorite {
    return (
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        'url' in value &&
        typeof value.name === 'string' &&
        typeof value.url === 'string'
    );
}

function seed_from_profile(): Favorite[] {
    return profile.social.map((s) => ({ name: s.platform, url: s.url }));
}

function load(): Favorite[] {
    if (typeof localStorage === 'undefined') return seed_from_profile();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) {
        const seeded = seed_from_profile();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
        return seeded;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(is_favorite) : [];
    } catch {
        return [];
    }
}

export const favorites = writable<Favorite[]>(load());

favorites.subscribe((list) => {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
});

export function add_favorite(fav: Favorite): void {
    if (fav.name.trim() === '' || fav.url.trim() === '') return;
    favorites.update((list) =>
        // a shell item is identified by its id (two items can share a display
        // path after a rename); a page is identified by its address
        list.some((f) =>
            is_shell_favorite(fav) ? f.fs_id === fav.fs_id : f.url === fav.url,
        )
            ? list
            : [...list, fav],
    );
}

export function remove_favorite(index: number): void {
    favorites.update((list) => list.filter((_, i) => i !== index));
}

/** Organize Favorites → Rename. Blank names are ignored rather than stored. */
export function rename_favorite(index: number, name: string): void {
    const trimmed = name.trim();
    if (trimmed === '') return;
    favorites.update((list) =>
        list.map((f, i) => (i === index ? { ...f, name: trimmed } : f)),
    );
}

/** Order matters in XP's Favorites menu, so Organize can reorder. */
export function move_favorite(index: number, delta: number): void {
    favorites.update((list) => {
        const target = index + delta;
        if (index < 0 || index >= list.length) return list;
        if (target < 0 || target >= list.length) return list;
        const next = [...list];
        const moved = next[index];
        const other = next[target];
        if (moved == null || other == null) return list;
        next[index] = other;
        next[target] = moved;
        return next;
    });
}
