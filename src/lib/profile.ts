/**
 * Typed, frozen accessor for the portfolio content (SPECIFICATION.md §7).
 * All personal content lives in data/profile.json — components import
 * `profile` from here and NEVER hardcode personal content.
 *
 * No Zod / runtime schema: the JSON is compiled into the bundle, so no trust
 * boundary is crossed (design decision 4; revisit at Phase 2's VFS generator).
 */
import profile_data from './data/profile.json';

export interface ProfileImage {
    src: string;
    alt: string;
}

export interface ProfileMeta {
    name: string;
    shortName: string;
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

export const profile: Profile = profile_data;
deep_freeze(profile);
