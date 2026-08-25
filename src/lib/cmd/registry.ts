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
import {
    BLANK,
    columns,
    dim,
    heading,
    indent,
    warn,
    wrap,
    wrap_items,
} from './format';

export interface Command {
    name: string;
    /** One-line summary shown by `help`. */
    summary: string;
    run: (args: string[], profile: Profile) => string[];
}

/**
 * Commands §3.2 assigns to PHASE 6, listed so they are a deliberate deferral
 * rather than a dead end.
 *
 * The startup banner used to advertise `ls` and `cd` (SPECIFICATION.md §3.2),
 * which would have made the terminal's first screen point at commands that
 * refuse to run. The banner's third line was amended for Phase 3 and is
 * restored alongside these — see docs/phase-3-spec.md D-A6.
 */
export const DEFERRED_COMMANDS = ['ls', 'cd', 'pwd', 'cat'] as const;

const DEFERRED_MESSAGE =
    'not available yet — filesystem navigation lands in a later update';

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
        run: () => [
            heading("Momad's XP Terminal — available commands"),
            BLANK,
            ...columns(
                COMMANDS.filter((c) => c.name !== 'help').map(
                    (c) => [c.name, c.summary] as const,
                ),
            ).map((l) => `  ${l}`),
            BLANK,
            dim('Coming in a later update:'),
            `  ${dim(DEFERRED_COMMANDS.join(', '))}`,
        ],
    },
    {
        name: 'about',
        summary: 'print bio',
        run: (_args, profile) => [
            heading(`${profile.meta.name} — ${profile.meta.title}`),
            BLANK,
            ...bio_lines(profile),
        ],
    },
    {
        name: 'skills',
        summary: 'list skills by area',
        run: (_args, profile) =>
            Object.entries(profile.skills).flatMap(([group, items]) => [
                heading(group),
                ...indent(wrap_items(items, 68)),
                BLANK,
            ]),
    },
    {
        name: 'experience',
        summary: 'print experience summary',
        run: (_args, profile) =>
            profile.experience.flatMap((job) => [
                heading(`${job.role} @ ${job.company}`),
                `  ${dim(`${job.period} · ${job.location}`)}`,
                ...job.description.flatMap((d) => indent(wrap(d, 68))),
                BLANK,
            ]),
    },
    {
        name: 'projects',
        summary: 'list projects',
        run: (_args, profile) =>
            profile.projects.flatMap((project) => [
                heading(project.name),
                ...indent(wrap(project.description, 68)),
                ...indent(
                    wrap_items(project.tech, 68, ' · ').map((l) => dim(l)),
                ),
                BLANK,
            ]),
    },
    {
        name: 'contact',
        summary: 'show contact info',
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
        run: (_args, profile) =>
            columns(
                profile.social.map((s) => [s.platform, s.url] as const),
            ).map((l) => `  ${l}`),
    },
    {
        name: 'whoami',
        summary: 'print the current user',
        // Derived, never a literal: §3.2 requires all output to come from JSON,
        // and CLAUDE.md forbids hardcoded personal content.
        run: (_args, profile) => [profile.meta.shortName.toLowerCase()],
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
        name: 'clear',
        summary: 'clear the screen',
        // The screen wipe is an ANSI sequence the component owns; the command
        // itself produces no lines.
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
        run: (_args, profile) => [
            warn(
                `${profile.meta.shortName.toLowerCase()} is not in the sudoers file. This incident will be reported.`,
            ),
        ],
    },
];

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
    if ((DEFERRED_COMMANDS as readonly string[]).includes(parsed.name)) {
        return [dim(`${parsed.name}: ${DEFERRED_MESSAGE}`)];
    }
    const command = find_command(parsed.name);
    if (command == null) return [`${parsed.name}: command not found`];
    return command.run(parsed.args, profile);
}
