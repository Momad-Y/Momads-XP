<script lang="ts">
    import { profile } from '../../../lib/profile';
    import { required } from '../../../lib/types';

    type SectionName =
        'About Me' | 'Experience' | 'Projects' | 'Skills' | 'Education';

    const sections: SectionName[] = [
        'About Me',
        'Experience',
        'Projects',
        'Skills',
        'Education',
    ];

    let open_section: SectionName | null = null;

    function toggle(section: SectionName) {
        open_section = open_section === section ? null : section;
    }

    function social_url(platform: string): string {
        return required(
            profile.social.find((s) => s.platform === platform),
            `social link ${platform}`,
        ).url;
    }
</script>

<div
    class="absolute inset-0 overflow-y-auto bg-[#5a7edc] font-sans"
    style="-webkit-overflow-scrolling: touch;"
>
    <!-- XP title bar -->
    <div
        class="sticky top-0 z-10 h-8 flex items-center px-2 shrink-0"
        style="background: linear-gradient(rgb(9, 151, 255) 0%, rgb(0, 83, 238) 8%, rgb(0, 80, 238) 40%, rgb(0, 61, 215) 88%, rgb(0, 61, 215) 93%, rgb(0, 66, 235) 95%, rgb(0, 61, 215) 96%, rgb(0, 55, 210) 100%);"
    >
        <img src="/assets/images/xp-logo.png" alt="" class="h-5 mr-2" />
        <span
            class="text-slate-50 text-[13px] font-bold truncate"
            style="text-shadow: 1px 1px 1px rgba(0,0,0,0.5);"
            >Momad's XP — AI Engineer</span
        >
    </div>

    <!-- identity -->
    <div class="flex flex-col items-center text-center px-4 pt-6 pb-4">
        <img
            src={profile.meta.avatar}
            alt={profile.meta.name}
            class="w-24 h-24 rounded border-2 border-white/80 object-cover shadow-lg"
        />
        <h1
            class="mt-3 text-slate-50 text-xl font-bold"
            style="text-shadow: 1px 1px 2px rgba(0,0,0,0.4);"
        >
            {profile.meta.name}
        </h1>
        <p class="text-slate-200 text-xs mt-1">{profile.meta.tagline}</p>
    </div>

    <!-- bio summary (short version) -->
    <div class="mx-3 mb-3 rounded border border-blue-900/40 bg-xp-yellow p-3">
        <p class="text-[12px] text-slate-800 leading-snug">
            {profile.about.bio[0]}
        </p>
    </div>

    <!-- expandable sections -->
    <div class="mx-3 flex flex-col gap-2">
        {#each sections as section (section)}
            <div
                class="rounded border border-blue-900/40 bg-slate-50 overflow-hidden"
            >
                <button
                    class="w-full flex items-center justify-between px-3 py-2 text-left"
                    style="background: linear-gradient(rgb(240, 240, 235), rgb(220, 224, 235));"
                    on:click={() => {
                        toggle(section);
                    }}
                >
                    <span class="text-[13px] font-bold text-blue-900"
                        >{section}</span
                    >
                    <span
                        class="text-blue-900 text-[13px] transition-transform {open_section ===
                        section
                            ? 'rotate-90'
                            : ''}">▸</span
                    >
                </button>

                {#if open_section === section}
                    <div class="p-3 border-t border-blue-900/20">
                        {#if section === 'About Me'}
                            {#each profile.about.bio as paragraph (paragraph)}
                                <p
                                    class="text-[12px] text-slate-800 leading-snug mb-2"
                                >
                                    {paragraph}
                                </p>
                            {/each}
                        {:else if section === 'Experience'}
                            {#each profile.experience as entry (entry.company + entry.period)}
                                <div class="mb-3">
                                    <p
                                        class="text-[12px] font-bold text-slate-900"
                                    >
                                        {entry.role} — {entry.company}
                                    </p>
                                    <p class="text-[11px] text-slate-500">
                                        {entry.period} · {entry.location}
                                    </p>
                                    <ul
                                        class="list-disc ml-4 mt-1 text-[11px] text-slate-700"
                                    >
                                        {#each entry.description as bullet (bullet)}
                                            <li class="mb-0.5">{bullet}</li>
                                        {/each}
                                    </ul>
                                </div>
                            {/each}
                        {:else if section === 'Projects'}
                            {#if profile.projects.length === 0}
                                <p class="text-[12px] text-slate-600 italic">
                                    Projects are coming soon — check back
                                    shortly.
                                </p>
                            {:else}
                                {#each profile.projects as project (project.name)}
                                    <div class="mb-3">
                                        <p
                                            class="text-[12px] font-bold text-slate-900"
                                        >
                                            {project.name}
                                        </p>
                                        <p class="text-[11px] text-slate-700">
                                            {project.description}
                                        </p>
                                    </div>
                                {/each}
                            {/if}
                        {:else if section === 'Skills'}
                            {#each Object.entries(profile.skills) as [group, items] (group)}
                                <div class="mb-2">
                                    <p
                                        class="text-[12px] font-bold text-slate-900 mb-1"
                                    >
                                        {group}
                                    </p>
                                    <div class="flex flex-wrap gap-1">
                                        {#each items as skill (skill)}
                                            <span
                                                class="text-[10px] px-2 py-0.5 rounded-full border border-blue-700/40 bg-blue-100 text-blue-900"
                                                >{skill}</span
                                            >
                                        {/each}
                                    </div>
                                </div>
                            {/each}
                        {:else}
                            {#each profile.education as entry (entry.institution)}
                                <div class="mb-3">
                                    <p
                                        class="text-[12px] font-bold text-slate-900"
                                    >
                                        {entry.institution}
                                    </p>
                                    <p class="text-[11px] text-slate-700">
                                        {entry.degree}
                                    </p>
                                    <p class="text-[11px] text-slate-500">
                                        {entry.period}{entry.honors != null
                                            ? ` · ${entry.honors}`
                                            : ''}
                                    </p>
                                </div>
                            {/each}
                        {/if}
                    </div>
                {/if}
            </div>
        {/each}
    </div>

    <!-- action buttons -->
    <!-- eslint-disable svelte/no-navigation-without-resolve -- static resume asset, mailto, and external social URLs; none are app routes -->
    <div class="mx-3 mt-4 flex flex-col gap-2">
        <a href={profile.meta.resumePdf} download class="xp-btn"
            >Download Resume</a
        >
        <a href="mailto:{profile.meta.email}" class="xp-btn">Contact Me</a>
        <div class="flex flex-row gap-2">
            <a
                href={social_url('GitHub')}
                target="_blank"
                rel="noopener noreferrer"
                class="xp-btn grow">GitHub</a
            >
            <a
                href={social_url('LinkedIn')}
                target="_blank"
                rel="noopener noreferrer"
                class="xp-btn grow">LinkedIn</a
            >
            <a
                href={social_url('Instagram')}
                target="_blank"
                rel="noopener noreferrer"
                class="xp-btn grow">Instagram</a
            >
        </div>
    </div>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->

    <!-- footer -->
    <div
        class="flex flex-row items-center justify-center gap-2 py-6 text-slate-200 text-[11px]"
    >
        <div
            class="w-4 h-4 bg-[url(/images/xp/icons/Desktop.png)] bg-contain bg-no-repeat"
        ></div>
        <span>For the full experience, visit on desktop</span>
    </div>
</div>

<style>
    .xp-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        font-size: 12px;
        color: #0f172a;
        text-decoration: none;
        text-align: center;
        background: linear-gradient(#fefefe, #e8e8e4);
        border: 1px solid #003c74;
        border-radius: 3px;
        box-shadow: inset -1px -1px 1px #d8d8d0;
    }
    .xp-btn:active {
        background: linear-gradient(#e0e0da, #efefea);
    }
</style>
