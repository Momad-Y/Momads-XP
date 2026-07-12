import type { ContextMenuSpec, ProgramInstance } from '../../../types';
import { required } from '../../../types';

export const make = ({
    originator,
}: {
    type: string;
    originator: ProgramInstance;
}): ContextMenuSpec => {
    //originator: program
    const win = required(originator.window, 'program window');
    return {
        required_width: 180 + 20,
        required_height: 27 * 4 + 20,
        menu: [
            [
                {
                    name: 'Minimize',
                    action: () => {
                        win.on_click_minimize();
                    },
                    disabled: win.minimized,
                    icon: '/images/xp/icons/tile_minimize.png',
                    icon_size: 10,
                    icon_type: 'monotone',
                },
                {
                    name: 'Restore',
                    action: () => {
                        win.restore();
                    },
                    disabled: !win.maximized && !win.minimized,
                    icon: '/images/xp/icons/tile_restore.png',
                    icon_size: 10,
                    icon_type: 'monotone',
                },
                {
                    name: 'Maximize',
                    action: () => {
                        win.on_click_maximize();
                    },
                    disabled: win.maximized || !win.options.resizable,
                    icon: '/images/xp/icons/tile_maximize.png',
                    icon_size: 10,
                    icon_type: 'monotone',
                },
                {
                    name: 'Close',
                    font: 'bold',
                    action: () => {
                        win.on_click_close();
                    },
                    icon: '/images/xp/icons/tile_close.png',
                    icon_size: 10,
                    icon_type: 'monotone',
                },
            ],
        ],
    };
};
