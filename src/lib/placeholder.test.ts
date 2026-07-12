import { describe, expect, it } from 'vitest';
import { placeholder_display } from './placeholder';

describe('placeholder_display', () => {
    it('uses basename + icon for VFS .exe items', () => {
        expect(
            placeholder_display({
                basename: 'About Me',
                name: 'About Me.exe',
                icon: '/assets/icons/about-me.png',
            }),
        ).toEqual({ name: 'About Me', icon: '/assets/icons/about-me.png' });
    });

    it('falls back to name for start-menu literals', () => {
        expect(
            placeholder_display({
                name: 'Command Prompt',
                icon: '/images/xp/icons/CommandPrompt.png',
            }),
        ).toEqual({
            name: 'Command Prompt',
            icon: '/images/xp/icons/CommandPrompt.png',
        });
    });

    it('has safe defaults when nothing is passed', () => {
        expect(placeholder_display(undefined)).toEqual({
            name: 'This program',
            icon: '/images/xp/icons/ApplicationWindow.png',
        });
    });
});
