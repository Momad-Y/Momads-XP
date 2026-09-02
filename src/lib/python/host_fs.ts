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
    /**
     * Names the runtime should stop offering: saved, or refused for a reason
     * retrying cannot fix. Anything absent is retried after the next
     * statement.
     */
    settled: string[];
}

/**
 * Find the existing file by NAME, derived from the drive every time.
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
        const child = drive[child_id];
        // Type-checked: a FOLDER named `main.py` (Explorer > New > Folder) would
        // otherwise be handed to `save_file`, which stamps `url` and
        // `storage_type` onto it and leaves an item that is both.
        if (child?.type === 'file' && child.name === name) return child_id;
    }
    return null;
}

/** KB, matching `new_fs_item_raw`'s own rounding. */
function update_size(id: string, bytes: number): void {
    hardDrive.update((drive) => {
        const item = drive?.[id];
        if (item != null) item.size = Math.ceil(bytes / 1024);
        return drive;
    });
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

/**
 * ONE gate per tab, not per window.
 *
 * The resource it protects is global: `desktop.svelte` persists the WHOLE
 * drive on a 1000 ms debounce that it re-arms on every store notification. A
 * gate per terminal meant three Command Prompts — a shipped, tested,
 * multi-instance behaviour — could each save at the permitted rate, keep that
 * debounce re-armed for ever, and the drive would never reach IndexedDB while
 * the app still looked alive. No hostile code required.
 */
const gate = new SaveGate();

/** The tab's gate. A parameter only so tests can inject a fresh one. */
export function save_gate(): SaveGate {
    return gate;
}

/** Called when the runtime is terminated, so a restart really does continue. */
export function reset_save_gate(): void {
    gate.reset();
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
    const settled: string[] = [];

    // Refused BEFORE the store is touched. `desktop.svelte` re-arms a 1000 ms
    // whole-drive persist on every notification, so work done here is what
    // starves it.
    if (!gate.allow(Date.now())) {
        // Terminate ONCE. The gate deliberately stays exhausted afterwards:
        // resetting it here would hand a flood a fresh budget every time we
        // killed the runtime, so it would cycle — terminate, reset, one more
        // file, terminate — instead of stopping. Only ending the session
        // deliberately clears it.
        //
        // And once claimed we fall silent, because a line per refused message
        // is one unthrottled terminal write per forged message, on the UI
        // thread.
        const terminate = gate.claim_termination();
        const lines = gate.exhausted()
            ? terminate
                ? ['xp: save limit reached — restarting the interpreter']
                : []
            : ['xp: saving too fast — retrying in a moment'];
        // NOTHING settles: every file here is offered again next statement.
        return { lines, terminate, settled: [] };
    }

    for (const file of message.files) {
        const drive = get(hardDrive);
        if (drive == null) {
            // Not settled: this one is worth retrying once seeding finishes.
            lines.push('xp: the filesystem is still starting up');
            break;
        }

        const reason = reject_reason(file);
        if (reason != null) {
            // Settled: retrying an illegal name or an oversized file would
            // print the same refusal every statement, for ever.
            lines.push(rejection_text(file.name, reason));
            settled.push(file.name);
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
            // `save_file` does not touch `size`, so a script grown from 1 KB
            // to 200 KB would show 1 KB in Explorer and in `cat`'s fallback
            // for ever.
            update_size(found, blob.size);
            if (previous != null && previous !== get(hardDrive)?.[found]?.url) {
                await del(previous);
            }
            settled.push(file.name);
            continue;
        }

        if (child_count(drive) >= LIMITS.max_files) {
            lines.push(
                `xp: '${file.name}' not saved — the Python folder is full (${String(LIMITS.max_files)} files)`,
            );
            settled.push(file.name);
            continue;
        }

        // `lastIndexOf` is -1 for a dotless name, and `slice(-1)` is the LAST
        // CHARACTER — so `README` was stored as `READMe` with ext "e", never
        // matched again, and duplicated on every save to the file cap.
        const dot = name.lastIndexOf('.');
        const has_ext = dot > 0;
        await new_fs_item_raw(
            {
                type: 'file',
                name,
                basename: has_ext ? name.slice(0, dot) : name,
                ext: has_ext ? name.slice(dot) : '',
                icon: icon_for(name),
                authored: true,
                file: blob,
            },
            PYTHON_FOLDER_ID,
        );
        settled.push(file.name);
    }

    return { lines, terminate: false, settled };
}
