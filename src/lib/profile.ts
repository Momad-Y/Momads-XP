/**
 * Typed, frozen accessor for the portfolio content (SPECIFICATION.md §7).
 * All personal content lives in data/profile.json — components import
 * `profile` from here and NEVER hardcode personal content.
 *
 * No Zod: the JSON is compiled into the bundle, so no trust boundary is
 * crossed. `copy` is the one exception and only because TypeScript cannot help
 * there — a JSON import widens `"accent"` to `string`, so its unions are
 * narrowed by `to_tone`/`to_beat` at load. `+page.ts` sets `prerender = true`,
 * so `vite build` evaluates this module and a bad value fails the build (design decision 4; revisit at Phase 2's VFS generator).
 */
import profile_data from './data/profile.json';

export interface ProfileImage {
    src: string;
    alt: string;
}

export interface ProfileMeta {
    name: string;
    shortName: string;
    /**
     * The owner's given name, as they are addressed directly.
     *
     * Data, not a heuristic: deriving it as "token 0 of `name`" would be a
     * naming POLICY living inside a component, and it is wrong for any culture
     * that puts the family name first. `shortName` is the product nickname
     * ("Momad"), which is a different thing again.
     */
    firstName: string;
    title: string;
    tagline: string;
    location: string;
    email: string;
    avatar: string;
    resumePdf: string;
}

export interface ProfileAbout {
    bio: string[];
}

export interface SocialLink {
    platform: string;
    url: string;
    icon: string;
}

export interface ExperienceEntry {
    company: string;
    role: string;
    period: string;
    location: string;
    description: string[];
    images: ProfileImage[];
}

export interface EducationEntry {
    institution: string;
    degree: string;
    period: string;
    honors?: string;
    images: ProfileImage[];
}

export interface Award {
    title: string;
    year: string;
    images: ProfileImage[];
}

export interface Certification {
    title: string;
    images: ProfileImage[];
    /**
     * The credential itself, as a PDF under `static/`.
     *
     * Seeded as a REAL FILE beside the entry's `.txt` in the Certifications
     * folder (see `vfs_gen/build.ts`), so double-clicking it opens the PDF
     * viewer exactly as the CV does — a certificate nobody can read is not a
     * credential. Optional: a certification may have no document.
     */
    pdf?: string;
}

export interface Project {
    name: string;
    description: string;
    tech: string[];
    url: string;
    images: ProfileImage[];
}

export interface LanguageEntry {
    language: string;
    level: string;
}

export interface SystemPropertiesGeneral {
    system: string[];
    computer: string[];
    footer: string;
}

export interface SystemPropertiesComputerName {
    intro: string;
    descriptionLabel: string;
    description: string;
    fullNameLabel: string;
    fullName: string;
    workgroupLabel: string;
    workgroup: string;
    note: string;
}

export interface SystemPropertiesHardware {
    intro: string;
    devices: string[];
    problemDevices: string[];
    note: string;
}

export interface SystemPropertiesAdvancedSection {
    title: string;
    note: string;
}

export interface SystemPropertiesAdvanced {
    intro: string;
    sections: SystemPropertiesAdvancedSection[];
}

/** A titled block of plain lines — used by the XP option dialogs' General tabs. */
export interface OptionsSection {
    title: string;
    lines: string[];
}

export interface FolderOptionsGeneral {
    sections: OptionsSection[];
    note: string;
}

export interface OptionsSettingsList {
    title: string;
    settings: string[];
    note: string;
}

export interface FileTypeEntry {
    ext: string;
    desc: string;
}

export interface FolderOptionsFileTypes {
    title: string;
    types: FileTypeEntry[];
    note: string;
}

export interface ProfileFolderOptions {
    general: FolderOptionsGeneral;
    view: OptionsSettingsList;
    fileTypes: FolderOptionsFileTypes;
}

export interface InternetOptionsGeneral {
    sections: OptionsSection[];
    note: string;
}

export interface InternetOptionsSecurity {
    title: string;
    zones: string[];
    note: string;
}

export interface ProfileInternetOptions {
    general: InternetOptionsGeneral;
    security: InternetOptionsSecurity;
    advanced: OptionsSettingsList;
}

export interface ProfileSystemProperties {
    general: SystemPropertiesGeneral;
    computerName: SystemPropertiesComputerName;
    hardware: SystemPropertiesHardware;
    advanced: SystemPropertiesAdvanced;
}

/**
 * One genre of the music library.
 *
 * `dir` is a folder under `static/audio/music` AND a URL segment AND an id
 * input, so `scan_music` validates it as a plain slug. `name` carries the
 * display text and is free of those constraints — which is the whole reason
 * the two are separate fields rather than one folder name.
 */
export interface MusicGenre {
    dir: string;
    name: string;
}

export interface ProfileMusic {
    /**
     * GENERATOR INPUT ONLY — nothing reads this at runtime any more.
     *
     * It names the folders `npm run generate:vfs` creates under My Music and
     * the order it creates them in. The player itself groups by what is
     * actually on the drive, so that a folder the visitor makes is a category
     * too; a genre's display name comes from its folder, not from here.
     */
    genres: MusicGenre[];
    /**
     * Corrections for artists the ID3 tag gets wrong, keyed `<genre>/<file>`.
     *
     * The folder stays the source of truth for what EXISTS; this only fixes
     * metadata. Files pulled from YouTube are tagged with the uploading
     * channel or the label rather than the artist — `MuzicUp` for a Mohamed
     * Mounir track, `BLTNM` (the label) for Shabjdeed — and the scanner will
     * not guess, because guessing replaces a wrong-but-honest value with an
     * invented one. Naming the few that are wrong is the honest fix.
     */
    artists: Record<string, string>;
    /** Shown in the player. Content, so it lives here and not in the component. */
    notice: string;
    /**
     * Header for songs sitting loose in My Music with no genre folder.
     *
     * The player groups by FOLDER now, so this is the one group name it has to
     * invent rather than read off the drive — which makes it copy, and copy
     * lives here.
     */
    unsorted_label: string;
}

/**
 * The owner's VOICE: every joke and every line written in their register,
 * rather than XP's.
 *
 * It used to be split — the dialog comedy (System Properties, Internet
 * Options) lived here while the login screen, terminal banner, `whoami`,
 * `sudo`, `hack` and `matrix` were literals in components. Same kind of
 * content, two homes, so rewording a joke meant knowing which. Product
 * BRANDING ("Momad's XP" as the product's name, the `momad@xp` prompt) stays
 * in code: that is the app's name, not something written in a voice.
 *
 * `Profile` is applied to the JSON at `const profile: Profile = profile_data`,
 * so tsc checks these shapes — a `tone` or `kind` typo is a compile error, not
 * a runtime surprise.
 */
export interface CopyLine {
    text: string;
    /** `accent` = the terminal's bright colour, `dim` = its quiet one. */
    tone: 'accent' | 'plain' | 'dim';
}

export interface SudoReply {
    headline: string;
    aside: string;
}

export interface MatrixIntroLine {
    text: string;
    /** Rendered DIM, for the parenthetical. */
    aside: boolean;
}

export type HackBeat =
    /** `[*] text.... TAG` — the workhorse. */
    | { kind: 'step'; text: string; dots: number; tag: string }
    /** A standalone line at full accent brightness. */
    | { kind: 'line'; text: string }
    /** A standalone line at DIM accent — still follows `color`, reads quieter. */
    | { kind: 'aside'; text: string }
    /** A label, then a bar that fills across `PROGRESS_WIDTH` cells. */
    | { kind: 'progress'; label: string };

export interface ProfileSudoCopy {
    /** `{user}` is filled in at runtime. */
    sudoers: string;
    usage: SudoReply;
    sandwich: SudoReply;
    repeated: SudoReply;
    removeAside: string;
    deniedAside: string;
}

export interface ProfileCopy {
    loginStatus: string;
    loginHints: { begin: string; accounts: string[] };
    /** The punchline `dir` prints; its setup lives in `terminalWelcome`. */
    dirAside: string;
    /**
     * Command help lines that are JOKES. A summary that describes what a
     * command does stays beside the command, where it is maintained with the
     * behaviour it documents; a summary that is a bit is the owner's voice.
     */
    commandJokes: { dir: string; matrix: string; hack: string; sudo: string };
    colorRefusal: SudoReply;
    /** Takes `{name}`. */
    placeholderNotice: string;
    contactRateLimit: string;
    /** `message` takes `{name}`, `{title}` and `{location}`. */
    aboutDialog: { title: string; message: string };
    terminalWelcome: CopyLine[];
    whoamiAside: string;
    pythonGreeting: string;
    sudo: ProfileSudoCopy;
    matrixIntro: MatrixIntroLine[];
    hackScript: HackBeat[];
}

export interface Profile {
    meta: ProfileMeta;
    about: ProfileAbout;
    social: SocialLink[];
    experience: ExperienceEntry[];
    education: EducationEntry[];
    skills: Record<string, string[]>;
    awards: Award[];
    certifications: Certification[];
    projects: Project[];
    languages: LanguageEntry[];
    systemProperties: ProfileSystemProperties;
    folderOptions: ProfileFolderOptions;
    internetOptions: ProfileInternetOptions;
    music: ProfileMusic;
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function deep_freeze(value: unknown): void {
    if (!is_record(value)) return;
    Object.freeze(value);
    for (const key of Object.keys(value)) {
        deep_freeze(value[key]);
    }
}

/**
 * Fills `{placeholder}` slots in a copy string.
 *
 * Deliberately tiny and total: an unknown placeholder is left as written
 * rather than becoming `undefined` in the UI, so a typo in profile.json shows
 * up as visible braces instead of a broken sentence.
 */
export function fill_copy(
    template: string,
    values: Readonly<Record<string, string>>,
): string {
    return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
        Object.hasOwn(values, key) ? (values[key] ?? whole) : whole,
    );
}

/**
 * `copy` is validated rather than type-asserted.
 *
 * A JSON import widens `"accent"` to `string`, so the unions above cannot
 * survive `const profile: Profile = profile_data` — and `no-unsafe-type-
 * assertion` rightly forbids casting the difference away. profile.json is
 * authored input, so it gets the same treatment as any other input at a
 * boundary: checked, and loud when wrong. A bad `tone` or `kind` fails the
 * build with the offending value named, instead of rendering as a blank line
 * or a missing beat that nobody notices.
 */
export function to_tone(value: string): CopyLine['tone'] {
    if (value === 'accent' || value === 'plain' || value === 'dim') {
        return value;
    }
    throw new Error(
        `profile.json: copy tone "${value}" must be accent, plain or dim`,
    );
}

export interface RawBeat {
    kind: string;
    text?: string | undefined;
    dots?: number | undefined;
    tag?: string | undefined;
    label?: string | undefined;
}

export function to_beat(raw: RawBeat): HackBeat {
    if (raw.kind === 'step') {
        if (raw.text == null || raw.dots == null || raw.tag == null) {
            throw new Error(
                `profile.json: hack step "${raw.text ?? '?'}" needs text, dots and tag`,
            );
        }
        return { kind: 'step', text: raw.text, dots: raw.dots, tag: raw.tag };
    }
    if (raw.kind === 'progress') {
        if (raw.label == null) {
            throw new Error('profile.json: hack progress beat needs a label');
        }
        return { kind: 'progress', label: raw.label };
    }
    if (raw.kind === 'line' || raw.kind === 'aside') {
        if (raw.text == null) {
            throw new Error(`profile.json: hack ${raw.kind} beat needs text`);
        }
        return { kind: raw.kind, text: raw.text };
    }
    throw new Error(`profile.json: unknown hack beat kind "${raw.kind}"`);
}

const raw_copy = profile_data.copy;

/** The owner's voice, validated. See `ProfileCopy`. */
export const copy: ProfileCopy = {
    loginStatus: raw_copy.loginStatus,
    loginHints: raw_copy.loginHints,
    dirAside: raw_copy.dirAside,
    commandJokes: raw_copy.commandJokes,
    colorRefusal: raw_copy.colorRefusal,
    placeholderNotice: raw_copy.placeholderNotice,
    contactRateLimit: raw_copy.contactRateLimit,
    aboutDialog: raw_copy.aboutDialog,
    terminalWelcome: raw_copy.terminalWelcome.map((l) => ({
        text: l.text,
        tone: to_tone(l.tone),
    })),
    whoamiAside: raw_copy.whoamiAside,
    pythonGreeting: raw_copy.pythonGreeting,
    sudo: raw_copy.sudo,
    matrixIntro: raw_copy.matrixIntro,
    hackScript: raw_copy.hackScript.map(to_beat),
};
deep_freeze(copy);

export const profile: Profile = profile_data;
deep_freeze(profile);
