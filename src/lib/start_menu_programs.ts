/**
 * What All Programs lists — and, just as importantly, what it deliberately
 * does not.
 *
 * WHY THIS IS NOT INLINE IN `start_menu.svelte` ANY MORE: the video player was
 * missing from it for as long as the video player has existed, and nothing
 * could have noticed. A list written inside a component is a list nobody can
 * test. Out here, `start_menu_programs.test.ts` walks
 * `src/routes/xp/programs/` and fails if a component is neither listed below
 * nor explained in `NOT_PROGRAMS` — so the next program somebody adds cannot
 * quietly fail to appear, and every omission is a decision somebody wrote down.
 *
 * THE RULE for what belongs here: a program is something a visitor can open
 * and USE with no file — it brings its own front door. A file handler is not a
 * program. `image_viewer` is the clearest case: launched with nothing it hits
 * `required(fs_item, 'image viewer fs item')` and throws, so listing it would
 * put an entry in the menu that crashes. Media Player Classic is the opposite
 * — it opens on its own "Open files..." panel — which is exactly why its
 * absence was a bug.
 */
import type { VfsItem } from './types';

/** One All Programs entry. A subset of the start menu's own item shape. */
export interface ProgramEntry {
    name: string;
    icon: string;
    path?: string;
    fs_item?: Partial<VfsItem>;
    /** CSS `top` offset of the level-2 flyout. */
    top?: string;
    items?: ProgramEntry[];
}

/**
 * Named placeholder launch: the literal `fs_item` carries name + icon for
 * `placeholder.svelte`'s window chrome.
 */
const placeholder_entry = (name: string, icon: string): ProgramEntry => ({
    name,
    icon,
    path: './programs/placeholder.svelte',
    fs_item: { name, icon },
});

export const ALL_PROGRAMS: ProgramEntry[] = [
    {
        name: 'My Computer',
        icon: '/images/xp/icons/MyComputer.png',
        path: './programs/my_computer.svelte',
    },
    {
        name: 'About Me',
        icon: '/assets/icons/about-me.png',
        path: './programs/about_me.svelte',
    },
    {
        name: 'My CV',
        icon: '/assets/icons/my-cv.png',
        // no fs_item: the viewer falls back to profile.meta.resumePdf
        // (a partial fs_item would throw in full_vfs_item)
        path: './programs/pdf_viewer.svelte',
    },
    {
        name: 'Internet Explorer',
        icon: '/images/xp/icons/InternetExplorer6.png',
        path: './programs/internet_explorer.svelte',
    },
    {
        name: 'Contact Me',
        icon: '/assets/icons/contact-me.png',
        path: './programs/contact_me.svelte',
    },
    {
        name: 'Command Prompt',
        icon: '/images/xp/icons/CommandPrompt.png',
        path: './programs/cmd.svelte',
    },
    {
        name: 'Python',
        icon: '/images/xp/icons/Python.png',
        path: './programs/python.svelte',
    },
    {
        name: 'Paint',
        icon: '/images/xp/icons/Paint.png',
        path: './programs/paint.svelte',
    },
    {
        name: 'Music Player',
        icon: '/images/xp/icons/WindowsMediaPlayer9.png',
        path: './programs/music_player.svelte',
    },
    {
        // Named as it is everywhere else it appears — Open With, its own title
        // bar — rather than "Video Player". One program, one name.
        name: 'Media Player Classic',
        icon: '/images/xp/icons/MPC.png',
        path: './programs/media_player_classic.svelte',
    },
    {
        name: 'Games',
        icon: '/images/xp/icons/StartMenuPrograms.png',
        top: '-40px',
        items: [
            placeholder_entry('Minesweeper', '/assets/icons/minesweeper.png'),
            placeholder_entry('Solitaire', '/assets/icons/solitaire.png'),
            placeholder_entry('Chess', '/assets/icons/chess.png'),
            placeholder_entry('DOOM', '/assets/icons/doom.png'),
        ],
    },
];

/**
 * Components under `programs/` that are NOT programs, and why.
 *
 * Every one of these opens from somewhere specific — a file, a property
 * sheet, a menu command — and would be useless or broken launched cold from a
 * menu. The test uses this as the allow-list: a new component in that folder
 * that appears in neither place fails the build, which is the whole point.
 */
export const NOT_PROGRAMS: Readonly<Record<string, string>> = {
    'add_to_favorites.svelte': "dialog — Internet Explorer's Favorites menu",
    'copier.svelte': 'progress window for a drag-and-drop file copy',
    'disk_properties.svelte': "property sheet — a drive's right-click menu",
    'display_properties.svelte':
        'control panel applet — right-click the desktop ▸ Properties',
    'folder_options.svelte':
        "control panel applet — Explorer's Tools ▸ Folder Options",
    'image_viewer.svelte':
        'file handler for images; `required(fs_item)` throws with no file, so a menu entry would crash',
    'internet_options.svelte':
        "control panel applet — Internet Explorer's Tools menu",
    'organize_favorites.svelte': "dialog — Internet Explorer's Favorites menu",
    'portfolio_viewer.svelte': 'file handler for .txt and .py',
    'properties.svelte': "property sheet — a file's right-click menu",
    'source_viewer.svelte': "Internet Explorer's View ▸ Source",
    'system_properties.svelte':
        'control panel applet — My Computer ▸ Properties',
    'volume_adjust.svelte': 'tray applet — the taskbar speaker icon',
    'zip.svelte': 'file handler for .zip archives',
};

/** Every `./programs/*.svelte` path the menu can launch, submenus included. */
export function launchable_paths(
    entries: readonly ProgramEntry[] = ALL_PROGRAMS,
): string[] {
    const out: string[] = [];
    for (const entry of entries) {
        if (entry.path != null) out.push(entry.path);
        if (entry.items != null) out.push(...launchable_paths(entry.items));
    }
    return out;
}
