import type { ProgramDescriptor } from './types';
import {
    MY_DOCUMENTS_ID,
    PORTFOLIO_ENTRY_IDS,
    PORTFOLIO_FOLDER_IDS,
    PYTHON_FOLDER_ID,
} from './generated/vfs_ids';

export interface DefaultWallpaper {
    name: string;
    type: string;
    path: string;
    css: string;
}

export const default_wallpapers: DefaultWallpaper[] = [
    {
        name: 'Ascent',
        type: 'remote',
        path: '/images/xp/Ascent.jpg',
        css: 'url(/images/xp/Ascent.jpg)',
    },
    {
        name: 'Autumn',
        type: 'remote',
        path: '/images/xp/Autumn.jpg',
        css: 'url(/images/xp/Autumn.jpg)',
    },
    {
        name: 'Azul',
        type: 'remote',
        path: '/images/xp/Azul.jpg',
        css: 'url(/images/xp/Azul.jpg)',
    },
    {
        name: 'Bliss',
        type: 'remote',
        path: '/images/xp/Bliss.jpg',
        css: 'url(/images/xp/Bliss.jpg)',
    },
    {
        name: 'Follow',
        type: 'remote',
        path: '/images/xp/Follow.jpg',
        css: 'url(/images/xp/Follow.jpg)',
    },
    {
        name: 'Friend',
        type: 'remote',
        path: '/images/xp/Friend.jpg',
        css: 'url(/images/xp/Friend.jpg)',
    },
    {
        name: 'Moon flower',
        type: 'remote',
        path: '/images/xp/Moonflower.jpg',
        css: 'url(/images/xp/Moonflower.jpg)',
    },
    {
        name: 'Radiance',
        type: 'remote',
        path: '/images/xp/Radiance.jpg',
        css: 'url(/images/xp/Radiance.jpg)',
    },
    {
        name: 'Red moon desert',
        type: 'remote',
        path: '/images/xp/Redmoondesert.jpg',
        css: 'url(/images/xp/Redmoondesert.jpg)',
    },
    {
        name: 'Tulips',
        type: 'remote',
        path: '/images/xp/Tulips.jpg',
        css: 'url(/images/xp/Tulips.jpg)',
    },
    {
        name: 'Vortec space',
        type: 'remote',
        path: '/images/xp/Vortecspace.jpg',
        css: 'url(/images/xp/Vortecspace.jpg)',
    },
    {
        name: 'Wind',
        type: 'remote',
        path: '/images/xp/Wind.jpg',
        css: 'url(/images/xp/Wind.jpg)',
    },
];

export const SortOptions = Object.freeze({
    NONE: 0,
    NAME: 1,
    SIZE: 2,
    DATE_CREATED: 3,
    DATE_MODIFIED: 4,
});

export const SortOrders = Object.freeze({
    ASCENDING: 0,
    DESCENDING: 1,
});

export const my_music_id = 'tjhEdnks6c4wPBWcqyoWQz';
export const my_pictures_id = 'neRHxqN8SPnG1xrivxXxRq';

export const my_computer: string[] = [
    'cTbkbrM4qjwF3UfmCoFkEK', //c drive
    'ejq5mVcfZA2fzR1uwYUC6n', //d drive
    'o1owmZuXKQdXR5vFxaBBW3', //f removable storage
    // Phase 2 (spec D9): portfolio folders render first in the root view's
    // "Files Stored on This Computer" section (drives filter separately).
    ...PORTFOLIO_FOLDER_IDS,
    // Beside My Music and My Pictures, as XP has it — and so it inherits
    // `protected_items` through the spread below, like they do.
    MY_DOCUMENTS_ID,
    my_music_id, //my music
    my_pictures_id, //my pictures
];

export const recycle_bin_id = 'aEF1hjqok52tpJPsNeXMGP';

export const desktop_folder = 'nt1QdU9Sws26H26UNQZcQU';

export const wallpapers_folder = 'uZ7fBbvbzFvQgAmJZpVbEb';

export const bliss_wallpaper = 'w38WCkdn67K6JsvjdGug6y';

export const protected_items: string[] = [
    ...my_computer,
    recycle_bin_id,
    desktop_folder,
    wallpapers_folder,
    // Phase 2 (spec F8): portfolio entry files ARE the product — visitors
    // keep full delete/rename freedom over their own files only.
    ...PORTFOLIO_ENTRY_IDS,
    /**
     * The Python REPL's save folder.
     *
     * Protected because deleting it is UNRECOVERABLE, not merely
     * inconvenient: the host saves by this id, `new_fs_item_raw` throws on
     * `required(data[parent_id])` once it is gone, and `seed.ts`'s tombstone
     * pass infers "it was in your seed and is absent from your cache, so you
     * deleted it" and keeps it deleted through every future re-seed. One
     * right-click would end saving for that visitor permanently. Files INSIDE
     * it stay fully deletable.
     */
    PYTHON_FOLDER_ID,
];

export const hidden_items: string[] = [
    recycle_bin_id,
    desktop_folder,
    wallpapers_folder,
];

export const supported_wallpaper_filetypes: string[] = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
];

const image_viewer: ProgramDescriptor = {
    path: './programs/image_viewer.svelte',
    icon: '/images/xp/icons/WindowsPictureandFaxViewer.png',
    name: 'Image Viewer',
};

const paint_program: ProgramDescriptor = {
    path: './programs/paint.svelte',
    icon: '/images/xp/icons/Paint.png',
    name: 'Paint',
};
const music_player_program: ProgramDescriptor = {
    path: './programs/music_player.svelte',
    icon: '/images/xp/icons/WindowsMediaPlayer9.png',
    name: 'Windows Media Player',
};
const mpc_program: ProgramDescriptor = {
    path: './programs/media_player_classic.svelte',
    icon: '/images/xp/icons/MPC.png',
    name: 'Media Player Classic',
};
const ie_program: ProgramDescriptor = {
    path: './programs/internet_explorer.svelte',
    icon: '/images/xp/icons/InternetExplorer6.png',
    name: 'Microsoft Internet Explorer',
};

export const doctypes: Record<string, ProgramDescriptor[]> = {
    '.wav': [mpc_program],
    '.mp4': [mpc_program],
    // MPC stays the DEFAULT handler: it is the shipped double-click behaviour
    // for .mp3/.wav/.mp4, and changing it would regress every existing
    // Explorer double-click. The Music Player is the SECOND entry, which is
    // what makes it appear in the right-click "Open With" submenu
    // (CMFSItem renders that only when there are >= 2 handlers).
    '.mp3': [mpc_program, music_player_program],
    '.webp': [image_viewer],
    '.bmp': [image_viewer, paint_program],
    '.png': [image_viewer, paint_program],
    '.jpg': [image_viewer, paint_program],
    '.jpeg': [image_viewer, paint_program],
    '.gif': [image_viewer],
    '.html': [ie_program],
    '.url': [ie_program],
    '.pdf': [
        {
            path: './programs/pdf_viewer.svelte',
            icon: '/assets/icons/my-cv.png',
            name: 'PDF Viewer',
        },
    ],
    // Phase 2: seeded portfolio entries (portfolio_ref-stamped .txt files).
    '.txt': [
        {
            path: './programs/portfolio_viewer.svelte',
            icon: '/images/xp/icons/TXT.png',
            name: 'Portfolio Viewer',
        },
    ],
};

export const icons: Record<string, string> = {
    '.mp3': 'MPC_audio.png',
    '.wav': 'MPC_audio.png',
    '.mp4': 'MPC_video.png',
    '.ogg': 'MPC_video.png',
    '.webm': 'MPC_video.png',
    '.exe': 'ApplicationWindow.png',
    '.xml': 'XML.png',
    '.dll': 'DLL.png',
    '.rtf': 'RTF.png',
    '.tiff': 'TIFF.png',
    '.vbs': 'VBS.png',
    '.ttf': 'Font.png',
    '.bat': 'Bat.png',
    '.txt': 'TXT.png',
    '.jpg': 'JPG.png',
    '.jpeg': 'JPG.png',
    '.png': 'TIFF.png',
    '.webp': 'TIFF.png',
    '.bmp': 'Bitmap.png',
    // Adobe-style icon (owner asset); the inherited PDF.png is Foxit's
    // leftover branding from the base repo's pruned viewer
    '.pdf': 'AdobePDF.png',
    '.docx': 'DOC.png',
    '.epub': 'BOOK.png',
    '.azw3': 'BOOK.png',
    '.mobi': 'BOOK.png',
    '.html': 'URL.png',
    '.js': 'JavaScript.png',
    '.css': 'CSS.png',
    '.rar': 'RAR.png',
    '.zip': 'RAR.png',
    '.7z': 'RAR.png',
    '.tar': 'RAR.png',
    '.srt': 'SUB.png',
    '.vtt': 'SUB.png',
    '.gif': 'GIF.png',
    '.swf': 'SWF.png',
};

export const archive_exts: string[] = ['.rar', '.zip', '.7z', '.tar'];
export const previewable_exts: string[] = [
    '.jpeg',
    '.jpg',
    '.png',
    '.webp',
    '.bmp',
];
