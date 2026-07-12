import { hardDrive } from './store';
import { my_computer } from './system';
import { get } from 'svelte/store';
import { required } from './types';
import type { HardDrive } from './types';

/** Snapshot the hard drive store, failing fast (as the untyped code did) if unseeded. */
function drive_snapshot(): HardDrive {
    return required(get(hardDrive), 'hard drive');
}

// Module-level snapshot taken on first import (after the boot screen has
// seeded the hard drive store), exactly as the untyped base code did.
const computer = my_computer.map((el) =>
    required(drive_snapshot()[el], `fs item ${el}`),
);
const drives = computer.filter(
    (item) => item.type == 'drive' || item.type == 'removable_storage',
);

export function to_url(id: string | null | undefined): string | null {
    if (id == null || drive_snapshot()[id] == null) return null;
    let url = '';
    let current_location = required(drive_snapshot()[id], `fs item ${id}`);
    url = current_location.name + '\\' + url;

    if (current_location.parent == null) return url;

    do {
        current_location = required(
            drive_snapshot()[current_location.parent],
            `fs item ${current_location.parent}`,
        );
        url = current_location.name + '\\' + url;

        console.log(current_location);
    } while (
        current_location.parent != null &&
        current_location.parent.length != 0
    );

    if (url[url.length - 1] == '\\') {
        url = url.slice(0, url.length - 1);
    }
    return url;
}

export function to_id_nocase(
    url: string | null | undefined,
): string | null | undefined {
    if (url == null || url.trim().length == 0) return null;

    const path_components = url
        .split('\\')
        .filter((item) => item.trim().length > 0)
        .map((item) => item.trim());
    if (path_components.length == 0) return null;

    const first_component = required(
        path_components[0],
        'first path component',
    );
    const drive = drives.find(
        (item) => item.name.toLowerCase() == first_component.toLowerCase(),
    );

    if (drive == null) return null;
    if (path_components.length == 1) return drive.id;

    let current_location = required(
        drive_snapshot()[drive.id],
        `fs item ${drive.id}`,
    );
    for (let i = 1; i < path_components.length; i++) {
        console.log(i);
        console.log(path_components[i]);
        const component = path_components[i];
        const next = [
            ...current_location.children.map((id) => drive_snapshot()[id]),
        ].find((item) => item?.name.toLowerCase() == component?.toLowerCase());
        console.log(next);
        if (next == null) return null;
        current_location = next;
        if (i == path_components.length - 1) return current_location.id;
    }
    return undefined;
}

export function to_id(
    url: string | null | undefined,
): string | null | undefined {
    if (url == null || url.trim().length == 0) return null;

    const path_components = url
        .split('\\')
        .filter((item) => item.trim().length > 0)
        .map((item) => item.trim());
    console.log(path_components);
    if (path_components.length == 0) return null;

    const drive = drives.find((item) => item.name == path_components[0]);

    if (drive == null) return null;
    if (path_components.length == 1) return drive.id;

    let current_location = required(
        drive_snapshot()[drive.id],
        `fs item ${drive.id}`,
    );
    for (let i = 1; i < path_components.length; i++) {
        console.log(i);
        console.log(path_components[i]);
        const component = path_components[i];
        const next = [
            ...current_location.children.map((id) => drive_snapshot()[id]),
        ].find((item) => item?.name == component);
        console.log(next);
        if (next == null) return null;
        current_location = next;
        if (i == path_components.length - 1) return current_location.id;
    }
    return undefined;
}
