import { describe, expect, it, vi } from 'vitest';
import { is_object_url, resolve_preview } from './preview';

/**
 * The thumbnail loader used to call `fs.get_url` bare inside a
 * `void load_preview()`. `get_url` `required()`s the idb payload, so an item
 * whose bytes are missing threw, and the throw became an unhandled promise
 * rejection: a red console error with no visible consequence, masking real
 * ones. These pin the tolerance that replaced it.
 */

describe('resolve_preview', () => {
    it('returns the resolved url', async () => {
        const get_url = vi.fn(() => Promise.resolve('/images/thing.png'));
        await expect(resolve_preview('id', get_url)).resolves.toBe(
            '/images/thing.png',
        );
    });

    it('returns null without calling the resolver when there is no id', async () => {
        const get_url = vi.fn(() => Promise.resolve('nope'));
        await expect(resolve_preview(null, get_url)).resolves.toBeNull();
        expect(get_url).not.toHaveBeenCalled();
    });

    it('returns null when the resolver has nothing (a `fake` item)', async () => {
        await expect(
            resolve_preview('id', () => Promise.resolve(undefined)),
        ).resolves.toBeNull();
    });

    /* The reported bug: `Missing required value: file payload of <id>`. */
    it('returns null instead of rejecting when the bytes are gone', async () => {
        const get_url = () =>
            Promise.reject(new Error('Missing required value: file payload'));
        await expect(resolve_preview('id', get_url)).resolves.toBeNull();
    });

    it('does not reject when the resolver throws synchronously', async () => {
        const get_url = () => {
            throw new Error('boom');
        };
        await expect(resolve_preview('id', get_url)).resolves.toBeNull();
    });
});

describe('is_object_url', () => {
    /*
     * `get_url` returns the item's own path for a `remote` file and a fresh
     * object URL for a local one; only the second is ours to revoke, and
     * leaving it unrevoked leaks the blob for the lifetime of the page.
     */
    it('is true only for a blob url', () => {
        expect(is_object_url('blob:http://localhost/abc')).toBe(true);
        expect(is_object_url('/audio/music/x.mp3')).toBe(false);
        expect(is_object_url('https://example.com/a.png')).toBe(false);
        expect(is_object_url(null)).toBe(false);
    });
});
