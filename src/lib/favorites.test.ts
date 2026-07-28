import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

// Deterministic localStorage for the module under test.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
        store.set(k, v);
    },
    removeItem: (k: string) => {
        store.delete(k);
    },
    clear: () => {
        store.clear();
    },
});

let mod: typeof import('./favorites');

beforeEach(async () => {
    store.clear();
    vi.resetModules();
    mod = await import('./favorites');
});

describe('favorites store', () => {
    it('seeds from profile.social on first load', () => {
        const list = get(mod.favorites);
        expect(list.length).toBeGreaterThanOrEqual(1);
        expect(list.map((f) => f.name)).toContain('GitHub');
        // persisted for next time
        expect(store.get('xp_favorites')).toBeTruthy();
    });

    it('add_favorite appends and dedupes by url', () => {
        mod.add_favorite({ name: 'Test', url: 'https://example.com' });
        expect(
            get(mod.favorites).some((f) => f.url === 'https://example.com'),
        ).toBe(true);
        const before = get(mod.favorites).length;
        mod.add_favorite({ name: 'Test again', url: 'https://example.com' });
        expect(get(mod.favorites).length).toBe(before);
    });

    it('add_favorite ignores empty name or url', () => {
        const before = get(mod.favorites).length;
        mod.add_favorite({ name: '', url: 'https://x.com' });
        mod.add_favorite({ name: 'x', url: '  ' });
        expect(get(mod.favorites).length).toBe(before);
    });

    it('remove_favorite drops by index and persists', () => {
        const first = get(mod.favorites)[0];
        mod.remove_favorite(0);
        expect(get(mod.favorites).some((f) => f.url === first?.url)).toBe(
            false,
        );
        const persisted: unknown = JSON.parse(
            store.get('xp_favorites') ?? '[]',
        );
        expect(Array.isArray(persisted)).toBe(true);
    });

    it('is_favorite validates shape', () => {
        expect(mod.is_favorite({ name: 'a', url: 'b' })).toBe(true);
        expect(mod.is_favorite({ name: 'a' })).toBe(false);
        expect(mod.is_favorite(null)).toBe(false);
        expect(mod.is_favorite({ name: 1, url: 'b' })).toBe(false);
    });
});
