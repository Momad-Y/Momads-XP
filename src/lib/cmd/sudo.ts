/**
 * `sudo` — the refusal, and its jokes.
 *
 * A pure module rather than an inline entry in `registry.ts`, following
 * `hack.ts`, `matrix.ts` and `complete.ts`: the branches are worth testing, and
 * the registry is already the longest file in the directory.
 *
 * EVERY line goes through the accent (`accent` / `dim_accent`), so the whole
 * command follows `color`. It used to be `warn`-yellow, which is a fixed ANSI
 * slot that `color` never touches — the one colour in the command set that
 * could not follow the accent was the one shouting the loudest.
 *
 * The user's name is always DERIVED from `profile.meta.shortName`. §3.2 requires
 * command output to be sourced from JSON and CLAUDE.md forbids hardcoded
 * personal content; the jokes are the shell's voice and may be literals.
 */
import { accent, dim_accent, wrap } from './format';

/** The classic, which every branch that refuses still opens with. */
const SUDOERS = (user: string) =>
    `${user} is not in the sudoers file. This incident will be reported.`;

/** Shells and switches that mean "give me a root prompt". */
const ROOT_SHELLS = ['su', 'bash', 'sh', '-i', '-s', 'zsh'];

/**
 * EVERY branch returns through here.
 *
 * Two of them used to build the same `accent` + `wrap` + `dim_accent` shape
 * inline, which is this repo's most repeated defect — one rule applied at
 * several call sites, each free to drift. It also meant a change to `say`
 * silently missed half the command: reverting the colours here left the `rm`
 * branch untouched, and the e2e that exists to catch exactly that reverted
 * colour scheme passed.
 */
function say(headline: string, aside: string): string[] {
    return [accent(headline), ...wrap(aside).map(dim_accent)];
}

/**
 * Run `sudo [args]`.
 *
 * Branches on the ARGUMENTS rather than on a call count: the command layer is
 * pure `(args, profile) => string[]` by design, so an escalating "I told you
 * once already" would need state the signature deliberately does not have.
 * Keying off what was actually typed keeps every branch reachable and testable.
 */
export function run_sudo(args: string[], user: string): string[] {
    // Lowercased for MATCHING only, and never echoed back — `echo` preserves
    // case on purpose, but an easter egg that only fires on exact
    // capitalisation is an easter egg nobody finds.
    const command = args.join(' ').trim().toLowerCase();
    const first = args[0]?.toLowerCase() ?? '';

    if (command.length === 0) {
        return say(
            'usage: sudo <command>',
            'Everyone tries `sudo make me a sandwich` eventually. You may as well get it over with.',
        );
    }

    // xkcd 149. The whole joke is that sudo makes it work, so this branch is
    // the one place the command does NOT refuse.
    if (command === 'make me a sandwich') {
        return say(
            'Okay.',
            'Made you a sandwich. It is not a real sandwich, on account of this not being a real computer. Enjoy it anyway.',
        );
    }

    if (first === 'sudo') {
        return say(
            'Yes. I heard you the first time.',
            'Saying it twice does not make you more of an administrator.',
        );
    }

    if (ROOT_SHELLS.includes(first)) {
        return say(
            'There is no root here.',
            'There is barely a filesystem. You are one tab away from closing the entire operating system, which is arguably more power than root.',
        );
    }

    if (first === 'rm') {
        return say(
            SUDOERS(user),
            'You also just tried to delete a website from inside the website. Bold. Circular. Denied.',
        );
    }

    return say(
        SUDOERS(user),
        `Reported to ${user}, who is regrettably also the only person who could do anything about it. They say they will look into it.`,
    );
}
