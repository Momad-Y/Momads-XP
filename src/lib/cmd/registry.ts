/**
 * The CMD command set (SPECIFICATION.md §3.2, Phase 3 core commands).
 *
 * Every command is a pure `(args, profile) => string[]`, so the whole surface
 * is unit-testable without a browser and stays inside the diff-coverage gate.
 * The `.svelte` component only wires these to xterm.
 *
 * §3.2 requires ALL output to be sourced from JSON, so nothing here hardcodes
 * personal content — not even `whoami`, which derives from
 * `profile.meta.shortName` rather than the literal the plan originally
 * specified.
 */
import type { Profile } from '../profile';
import { run_sudo } from './sudo';
import {
    BLANK,
    columns,
    dim,
    heading,
    indent,
    wrap,
    wrap_items,
} from './format';

export interface Command {
    name: string;
    /** One-line summary shown by `help`. */
    summary: string;
    /**
     * End the output with one blank line, separating a BLOCK from the next
     * prompt.
     *
     * Only the commands that print a block of portfolio content — `about`,
     * `skills`, `experience`, `projects`, `contact`, `social` — plus `help`,
     * which has the same dense multi-group shape. A real shell does not pad
     * after `whoami` or `date`, and doing it everywhere is what stopped this
     * feeling like cmd.
     *
     * A FLAG on the command rather than a list of names elsewhere: a name in a
     * separate set can be misspelled and silently do nothing, and this way
     * adding a command forces the choice. `execute` is still the only place
     * that applies it, which is the property that stopped the original drift.
     */
    blank_after?: boolean;
    run: (args: string[], profile: Profile) => string[];
}

/** Join blocks with exactly one blank line BETWEEN them, none trailing. */
function join_blocks(blocks: string[][]): string[] {
    return blocks.flatMap((block, i) => (i === 0 ? block : [BLANK, ...block]));
}

/**
 * `whoami`'s remark. Kept beside the command set rather than inline so the
 * prose is wrapped by the same formatter as every other paragraph in the
 * terminal and cannot drift past 72 columns.
 */
const WHOAMI_ASIDE =
    '...is whose computer this is. You, on the other hand, are a guest who ' +
    'arrived through a browser tab.';

function bio_lines(profile: Profile): string[] {
    return profile.about.bio.flatMap((para, i) => [
        ...wrap(para),
        ...(i < profile.about.bio.length - 1 ? [BLANK] : []),
    ]);
}

export const COMMANDS: readonly Command[] = [
    {
        name: 'help',
        summary: 'list available commands',
        blank_after: true,
        run: () => [
            heading("Momad's XP Terminal — available commands"),
            BLANK,
            ...columns(
                COMMANDS.filter((c) => c.name !== 'help').map(
                    (c) => [c.name, c.summary] as const,
                ),
            ).map((l) => `  ${l}`),
        ],
    },
    {
        name: 'about',
        summary: 'print bio',
        blank_after: true,
        run: (_args, profile) => [
            heading(`${profile.meta.name} — ${profile.meta.title}`),
            BLANK,
            ...bio_lines(profile),
        ],
    },
    {
        name: 'skills',
        summary: 'list skills by area',
        blank_after: true,
        run: (_args, profile) =>
            join_blocks(
                Object.entries(profile.skills).map(([group, items]) => [
                    heading(group),
                    ...indent(wrap_items(items, 68)),
                ]),
            ),
    },
    {
        name: 'experience',
        summary: 'print experience summary',
        blank_after: true,
        run: (_args, profile) =>
            join_blocks(
                profile.experience.map((job) => [
                    heading(`${job.role} @ ${job.company}`),
                    `  ${dim(`${job.period} · ${job.location}`)}`,
                    ...job.description.flatMap((d) => indent(wrap(d, 68))),
                ]),
            ),
    },
    {
        name: 'projects',
        summary: 'list projects',
        blank_after: true,
        run: (_args, profile) =>
            join_blocks(
                profile.projects.map((project) => [
                    heading(project.name),
                    ...indent(wrap(project.description, 68)),
                    ...indent(
                        wrap_items(project.tech, 68, ' · ').map((l) => dim(l)),
                    ),
                ]),
            ),
    },
    {
        name: 'contact',
        summary: 'show contact info',
        blank_after: true,
        run: (_args, profile) => [
            heading('Contact'),
            BLANK,
            ...columns([
                ['email', profile.meta.email],
                ['location', profile.meta.location],
                ...profile.social.map(
                    (s) => [s.platform.toLowerCase(), s.url] as const,
                ),
            ]).map((l) => `  ${l}`),
        ],
    },
    {
        name: 'social',
        summary: 'list social links',
        blank_after: true,
        run: (_args, profile) =>
            columns(
                profile.social.map((s) => [s.platform, s.url] as const),
            ).map((l) => `  ${l}`),
    },
    {
        name: 'whoami',
        summary: 'print the current user',
        // The NAME is derived, never a literal: §3.2 requires all output to come
        // from JSON, and CLAUDE.md forbids hardcoded personal content. The
        // aside underneath is the shell's own voice, which is why it can be a
        // literal — it says nothing about Momad.
        //
        // The first line stays exactly the bare username, so `whoami` still
        // ANSWERS before it jokes; the aside is dimmed to read as a remark
        // rather than as part of the reply.
        run: (_args, profile) => [
            profile.meta.shortName.toLowerCase(),
            ...wrap(WHOAMI_ASIDE).map(dim),
        ],
    },
    {
        name: 'uname',
        summary: 'print system information (-a for all)',
        run: (args, profile) => {
            const system = profile.systemProperties.general.system;
            const computer = profile.systemProperties.general.computer;
            if (!args.includes('-a')) return [system[0] ?? "Momad's XP"];
            return [
                [
                    system[0] ?? "Momad's XP",
                    'momad-xp',
                    system[1] ?? '',
                    system[2] ?? '',
                    computer[0] ?? '',
                    'JavaScript',
                ]
                    .filter((p) => p.length > 0)
                    .join(' '),
            ];
        },
    },
    {
        name: 'echo',
        summary: 'echo the given text',
        // Arguments pass through VERBATIM — lookup is case-sensitive like
        // bash, and `echo Hello` must keep its capital H.
        run: (args) => [args.join(' ')],
    },
    {
        name: 'date',
        summary: 'show the current date',
        run: () => [new Date().toDateString()],
    },
    {
        name: 'time',
        summary: 'show the current time',
        run: () => [new Date().toTimeString().split(' ')[0] ?? ''],
    },
    {
        name: 'color',
        summary: 'set the accent colour, e.g. color #ff8800',
        // Listed for `help`; the repaint is applied by the component, which
        // owns the terminal. The command layer stays pure.
        run: () => [],
    },
    {
        name: 'exit',
        summary: 'close the terminal (or Ctrl+D)',
        // Listed so `help` advertises it, but the window close is handled by
        // the component — the command layer is pure and owns no window.
        run: () => [],
    },
    {
        name: 'clear',
        summary: 'clear the screen',
        // The screen wipe is an ANSI sequence the component owns; the command
        // itself produces no lines.
        run: () => [],
    },
    {
        name: 'ls',
        summary: 'list this directory, or `ls -a` to include hidden entries',
        // Listed for `help`; the working directory belongs to the component,
        // so the four filesystem commands are dispatched there through
        // `src/lib/cmd/fs_commands.ts` — exactly as `color` and `python` are.
        // The command layer stays pure `(args, profile) => string[]`.
        run: () => [],
    },
    {
        name: 'cd',
        summary: 'change directory, e.g. cd experience',
        run: () => [],
    },
    {
        name: 'pwd',
        summary: 'print the current directory',
        run: () => [],
    },
    {
        name: 'cat',
        summary: 'print a file, e.g. cat about.txt',
        run: () => [],
    },
    {
        name: 'dir',
        summary: 'what a Windows person types; it runs ls',
        run: () => [],
    },
    {
        name: 'python',
        summary: 'start the Python interpreter in this window',
        // Listed for `help`; the session is hosted by the component, which owns
        // the terminal and the sandbox frame. The command layer stays pure.
        run: () => [],
    },
    {
        name: 'matrix',
        summary: 'follow the white rabbit',
        run: () => [],
    },
    {
        name: 'hack',
        summary: 'initiate a totally real intrusion',
        run: () => [],
    },
    {
        name: 'sudo',
        summary: 'attempt to elevate privileges',
        // Branches and jokes live in `sudo.ts`; the name stays derived here.
        run: (args, profile) =>
            run_sudo(args, profile.meta.shortName.toLowerCase()),
    },
];

/** Every name the shell recognises, sorted. */
export function command_names(): string[] {
    return COMMANDS.map((c) => c.name).sort((a, b) => a.localeCompare(b));
}

export function find_command(name: string): Command | undefined {
    // Case-SENSITIVE, like bash. §3.2 line 1 specifies "bash emulation, not
    // Windows cmd", and the plan's original case-insensitive lookup was a
    // second un-Linux behaviour bundled in without its own justification.
    return COMMANDS.find((c) => c.name === name);
}

export interface ParsedInput {
    name: string;
    args: string[];
}

export function parse(input: string): ParsedInput | null {
    const trimmed = input.trim();
    if (trimmed.length === 0) return null;
    const parts = trimmed.split(/\s+/);
    return { name: parts[0] ?? '', args: parts.slice(1) };
}

/**
 * Run one line. Returns the lines to print.
 *
 * An unknown command answers in bash's wording, not cmd.exe's: §3.2 asks for
 * bash emulation in bold, and the plan's original `'foo' is not recognized as
 * an internal or external command.` overrode a written spec directive with a
 * joke. Reversed at gate 2.
 */
export function execute(input: string, profile: Profile): string[] {
    const parsed = parse(input);
    if (parsed == null) return [];
    const command = find_command(parsed.name);
    if (command == null) {
        return normalise_spacing([`${parsed.name}: command not found`], false);
    }
    return normalise_spacing(
        command.run(parsed.args, profile),
        command.blank_after === true,
    );
}

/**
 * Strip any trailing blanks a command produced, then add ONE back only if it
 * asked for it.
 *
 * Applied here and nowhere else. `skills`, `experience` and `projects` blank
 * after every group and so used to end with one, while `about`, `contact`,
 * `social` and `help` ended flush against the next prompt — seven call sites
 * each deciding separately, which is the same "rule applied at one call site"
 * shape as every other defect in this repo, just cosmetic. Centralising it is
 * what makes `blank_after` a single honest switch rather than seven.
 *
 * Commands that print nothing (`clear`, `matrix`, `hack`) stay silent either
 * way: a blank line before a freshly cleared screen's prompt would be a visible
 * artefact.
 */
export function normalise_spacing(
    lines: string[],
    blank_after: boolean,
): string[] {
    const trimmed = [...lines];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] === BLANK) {
        trimmed.pop();
    }
    if (trimmed.length === 0) return [];
    return blank_after ? [...trimmed, BLANK] : trimmed;
}
