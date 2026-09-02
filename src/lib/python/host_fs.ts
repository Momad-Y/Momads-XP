/**
 * The one path from the Python runtime into persistent storage.
 *
 * Owned by neither terminal component and imported by both, so the
 * security-critical half exists exactly once — `python.svelte` and `cmd.svelte`
 * already share `repl.ts` for the same reason.
 *
 * Everything here assumes the caller is hostile. It always is: the code that
 * sends these messages is typed by a stranger, and Pyodide exposes
 * `js.postMessage`, so a save can arrive without any file ever being written
 * in `/c`. The writable directory is ergonomics; this module is the boundary.
 */
import { get } from 'svelte/store';
import { del } from 'idb-keyval';
import { hardDrive } from '../store';
import { new_fs_item_raw, save_file } from '../fs';
import { PYTHON_FOLDER_ID } from '../generated/vfs_ids';
import {
    LIMITS,
    normalise_name,
    reject_reason,
    rejection_text,
    SaveGate,
} from './save_limits';
import type { SaveRequest } from './save_limits';
import type { HardDrive } from '../types';

export interface SaveOutcome {
    /** Lines to print on stderr, before the next prompt. */
    lines: string[];
    /** The budget is spent — the caller must terminate the runtime. */
    terminate: boolean;
}

/**
 * Find the existing file by NAME, derived from the drive每 time.
 *
 * Deliberately not a remembered `Map<name, id>`. That map loses data on four
 * ordinary gestures: `exit()` then `python`, or a reload, empties it so the
 * next save of `main.py` creates `main 2.py`; deleting the file in Explorer
 * leaves a dead id, and `save_file` RETURNS SILENTLY for a missing item
 * (`fs.ts:479-482`), discarding every later save while reporting success; and
 * renaming it means the next save overwrites the file the visitor renamed to
 * keep. Deriving from the drive survives all four.
 */
function existing_id(drive: HardDrive, name: string): string | null {
    const folder = drive[PYTHON_FOLDER_ID];
    if (folder == null) return null;
    for (const child_id of folder.children) {
        if (drive[child_id]?.name === name) return child_id;
    }
    return null;
}

function child_count(drive: HardDrive): number {
    return drive[PYTHON_FOLDER_ID]?.children.length ?? 0;
}

/** The normalised name, used for both the VFS item and the File object. */
function name_of(file: SaveRequest): string {
    return normalise_name(file.name);
}

/** Icon for a saved script, so it does not render as an executable. */
function icon_for(name: string): string {
    return name.endsWith('.py')
        ? '/images/xp/icons/ScriptComponent.png'
        : '/images/xp/icons/TXT.png';
}

export function create_save_gate(): SaveGate {
    return new SaveGate();
}

/**
 * Persist what the runtime asked for, refusing anything it should not have.
 *
 * Returns the lines to show and whether to kill the runtime. Errors are
 * reported as text rather than raised in Python: by the time the host sees a
 * save the visitor's `open()` has already returned, and no message can raise
 * into a call that has finished. One statement late is the best available, and
 * silence is the only unacceptable option.
 */
export async function apply_save(
    message: { files: SaveRequest[] },
    gate: SaveGate,
): Promise<SaveOutcome> {
    const lines: string[] = [];

    // Refused BEFORE the store is touched. `desktop.svelte` re-arms a 1000 ms
    // whole-drive persist on every notification, so work done here is what
    // starves it.
    if (!gate.allow(Date.now())) {
        return {
            lines: gate.exhausted()
                ? [
                      'xp: save limit reached for this interpreter — restart Python to continue',
                  ]
                : ['xp: saving too fast — one file every 2 seconds'],
            terminate: gate.exhausted(),
        };
    }

    for (const file of message.files) {
        const drive = get(hardDrive);
        if (drive == null) {
            lines.push('xp: the filesystem is still starting up');
            break;
        }

        const reason = reject_reason(file);
        if (reason != null) {
            lines.push(rejection_text(file.name, reason));
            continue;
        }

        const name = normalise_name(file.name);
        // A `File`, not a bare `Blob`: `new_fs_item_raw`'s draft type wants
        // one, and Explorer reads `lastModified` off it.
        const blob = new File([file.text], name_of(file), {
            type: 'text/plain',
        });
        const found = existing_id(drive, name);

        if (found != null) {
            // Overwrite in place, so iterating on a script does not leave a
            // trail of `main 2.py`, `main 3.py` to the file cap.
            //
            // `save_file` mints a fresh blob key and never deletes the old
            // one, so the previous bytes are freed here — otherwise every
            // re-save orphans up to 256 KB that Explorer cannot show.
            const previous = drive[found]?.url;
            await save_file(found, blob);
            if (previous != null && previous !== get(hardDrive)?.[found]?.url) {
                await del(previous);
            }
            continue;
        }

        if (child_count(drive) >= LIMITS.max_files) {
            lines.push(
                `xp: '${file.name}' not saved — the Python folder is full (${String(LIMITS.max_files)} files)`,
            );
            continue;
        }

        await new_fs_item_raw(
            {
                type: 'file',
                name,
                basename: name.slice(0, name.lastIndexOf('.')) || name,
                ext: name.slice(name.lastIndexOf('.')),
                icon: icon_for(name),
                authored: true,
                file: blob,
            },
            PYTHON_FOLDER_ID,
        );
    }

    return { lines, terminate: false };
}
