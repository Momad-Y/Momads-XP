import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `CMDesktop` imports `fs`, which imports `finder`, whose derived store calls
 * `required()` on the drive AT IMPORT TIME — so merely importing this module in
 * Node throws before a single assertion runs. Mocked rather than worked around
 * by seeding a fake drive: none of the entries under test touch the
 * filesystem, and the same `vi.mock` shape already covers
 * `$env/dynamic/private` for the API routes.
 */
vi.mock('../../../fs', () => ({
    paste: vi.fn(),
    new_fs_item: vi.fn(),
}));

import { get } from 'svelte/store';
import { make } from './CMDesktop';
import { queueProgram } from '../../../store';
import { find_app } from '../../../app_registry';
import type { MenuItem } from '../../../types';

function menu_items(): MenuItem[] {
    return make({ type: 'Desktop', originator: { id: 'desktop' } }).menu.flat();
}

function find_item(name: string): MenuItem | undefined {
    return menu_items().find((item) => item.name === name);
}

describe('the desktop context menu', () => {
    beforeEach(() => {
        queueProgram.set(null);
    });

    it('offers Command Prompt', () => {
        expect(find_item('Command Prompt')).toBeDefined();
    });

    it('launches a REGISTERED app, not a path that only looks right', () => {
        // The failure this guards is silent: `launch_inner` resolves the path
        // through `find_app`, so a typo here opens nothing at all and the only
        // symptom is a right-click that appears to do nothing.
        // `void`: the action's declared return type is not `void`, and an
        // unawaited call trips `no-floating-promises`. Nothing here returns a
        // real promise — the launch is a store write.
        void find_item('Command Prompt')?.action?.();

        const queued = get(queueProgram);
        expect(queued?.path).toBe('./programs/cmd.svelte');
        expect(find_app(queued?.path)).toBeDefined();
        expect(queued?.name).toBe('Command Prompt');
        expect(queued?.icon).toBe('/images/xp/icons/CommandPrompt.png');
    });

    it('sits in its own group, directly above Properties', () => {
        // Grouped with Refresh it would mix a view action with a launch; the
        // separator is what makes it read as its own thing, and Properties
        // stays last as it does throughout XP.
        const groups = make({
            type: 'Desktop',
            originator: { id: 'desktop' },
        }).menu;
        const names = groups.map((g) => g.map((i) => i.name));

        const cmd_group = names.findIndex((g) => g.includes('Command Prompt'));
        const props_group = names.findIndex((g) => g.includes('Properties'));
        expect(cmd_group).toBeGreaterThanOrEqual(0);
        expect(props_group).toBe(cmd_group + 1);
        expect(names[cmd_group]).toEqual(['Command Prompt']);
    });

    it('leaves room for the extra row when flipping near a screen edge', () => {
        // `required_height` is what ContextMenu.svelte uses to decide whether
        // the menu opens upward. Adding a row without bumping it clips the
        // bottom item against the taskbar.
        const spec = make({ type: 'Desktop', originator: { id: 'desktop' } });
        const rows = spec.menu.reduce((n, group) => n + group.length, 0);
        // One row of slack over the item count, plus 20px — the convention this
        // file already followed at five items (27 * 6 + 20). The slack covers
        // the group separators. Asserting only `27 * rows` does not
        // discriminate: at six items it holds for the UNBUMPED value too, which
        // is how a first draft of this test passed against exactly the
        // regression it was written to catch.
        expect(spec.required_height).toBeGreaterThanOrEqual(
            27 * (rows + 1) + 20,
        );
    });
});
