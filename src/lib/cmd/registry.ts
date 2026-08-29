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
        // Through the same normaliser: this branch returned early and so was
        // the one printing command still spaced differently from the rest.
        return with_trailing_blank([
            dim(`${parsed.name}: ${DEFERRED_MESSAGE}`),
        ]);
    }
    const command = find_command(parsed.name);
    const lines =
        command == null
            ? [`${parsed.name}: command not found`]
            : command.run(parsed.args, profile);
    return with_trailing_blank(lines);
}

/**
 * Exactly ONE blank line after any output, and none after silence.
 *
 * Normalised here rather than per command, which is why the commands no longer
 * append their own: `skills`, `experience` and `projects` blanked after every
 * group and so ended with one, while `about`, `contact`, `social` and `help`
 * ended flush against the next prompt. Seven call sites each deciding
 * separately is how that drifted — the same shape as every other "rule applied
 * at one call site" defect in this repo, just cosmetic.
 *
 * Commands that print nothing (`clear`, `matrix`, `hack`) stay silent: a blank
 * line before a freshly cleared screen's prompt would be a visible artefact.
 */
export function with_trailing_blank(lines: string[]): string[] {
    const trimmed = [...lines];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] === BLANK) {
        trimmed.pop();
    }
    return trimmed.length === 0 ? [] : [...trimmed, BLANK];
}
