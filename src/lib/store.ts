import { writable } from 'svelte/store';
import type {
    ContextMenuRequest,
    HardDrive,
    ProgramInstance,
    ProgramLaunchRequest,
} from './types';

export const queueProgram = writable<ProgramLaunchRequest | null>({});
export const runningPrograms = writable<ProgramInstance[]>([]);

export const selectingItems = writable<string[]>([]);
export const contextMenu = writable<ContextMenuRequest | null>(null);
export const zIndex = writable<number>(0);

/** VFS id of the current wallpaper item (inside the wallpapers folder). */
export const wallpaper = writable<string | null>(null);

export const systemVolume = writable<number>(1);

/** `null` until starting.svelte seeds it from IndexedDB / hard_drive.json. */
export const hardDrive = writable<HardDrive | null>(null);
export const clipboard = writable<string[]>([]);
export const clipboard_op = writable<'copy' | 'cut'>('copy');
export const queueCommand = writable<'shutdown' | 'restart' | null>(null);
export const crtEffect = writable<boolean>(false);
