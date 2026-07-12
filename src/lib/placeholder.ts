import type { VfsItem } from './types';

export interface PlaceholderDisplay {
    name: string;
    icon: string;
}

const DEFAULT_ICON = '/images/xp/icons/ApplicationWindow.png';

/**
 * Derive the placeholder window's title + icon from whatever launch payload
 * arrived: a full VFS `.exe` item (desktop / Explorer double-click — prefer
 * `basename`, since `name` carries the `.exe` suffix), a start-menu literal
 * (`{ name, icon }`), or nothing.
 */
export function placeholder_display(
    item: Partial<VfsItem> | undefined,
): PlaceholderDisplay {
    return {
        name: item?.basename ?? item?.name ?? 'This program',
        icon: item?.icon ?? DEFAULT_ICON,
    };
}
