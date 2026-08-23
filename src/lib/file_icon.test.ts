import { describe, it, expect } from 'vitest';
import { file_icon_url } from './file_icon';
import { recycle_bin_id } from './system';
import type { VfsItem } from './types';

function item(over: Partial<VfsItem> & { id: string }): VfsItem {
    return {
        type: 'file',
        name: over.id,
        basename: over.id,
        ext: '',
        children: [],
        date_created: 0,
        date_modified: 0,
        sort_option: 0,
        sort_order: 0,
        ...over,
    };
}

describe('file_icon_url', () => {
    it('prefers the item’s own icon', () => {
        expect(
            file_icon_url(item({ id: 'a', icon: '/images/xp/icons/Foo.png' })),
        ).toBe('url(/images/xp/icons/Foo.png)');
    });

    it('falls back to the registered icon for the extension', () => {
        expect(file_icon_url(item({ id: 'b', ext: '.mp3' }))).toBe(
            'url(/images/xp/icons/MPC_audio.png)',
        );
    });

    it('matches the extension case-insensitively, like the open path does', () => {
        expect(file_icon_url(item({ id: 'c', ext: '.MP3' }))).toBe(
            'url(/images/xp/icons/MPC_audio.png)',
        );
    });

    it('gives the Recycle Bin its icon (the branch only one copy used to have)', () => {
        expect(
            file_icon_url(item({ id: recycle_bin_id, type: 'folder' })),
        ).toBe('url(/images/xp/icons/RecycleBinempty.png)');
    });

    it('returns null when there is nothing to show, so callers can default', () => {
        expect(file_icon_url(item({ id: 'd', ext: '.zzz' }))).toBeNull();
        expect(file_icon_url(null)).toBeNull();
        expect(file_icon_url(undefined)).toBeNull();
    });

    it('treats an empty icon string as absent', () => {
        expect(
            file_icon_url(item({ id: 'e', icon: '', ext: '.zzz' })),
        ).toBeNull();
    });
});
