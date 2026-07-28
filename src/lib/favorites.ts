/**
 * Shared Favorites — one list backing both Internet Explorer's Favorites
 * sidebar/menu and My Computer's Favorites menu (XP keeps a single Favorites
 * shell folder). Seeded from profile.social on first run; persisted to
 * localStorage so additions survive reloads.
 */
import { writable } from 'svelte/store';
import { profile } from './profile';

export interface Favorite {
    name: string;
    url: string;
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
        list.some((f) => f.url === fav.url) ? list : [...list, fav],
    );
}

export function remove_favorite(index: number): void {
    favorites.update((list) => list.filter((_, i) => i !== index));
}
