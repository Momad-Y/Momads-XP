import type { ProgramDescriptor } from './types';

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
    '.mp3': [mpc_program],
    '.webp': [image_viewer],
    '.bmp': [image_viewer, paint_program],
    '.png': [image_viewer, paint_program],
    '.jpg': [image_viewer, paint_program],
    '.jpeg': [image_viewer, paint_program],
    '.gif': [image_viewer],
    '.html': [ie_program],
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
    '.pdf': 'PDF.png',
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
