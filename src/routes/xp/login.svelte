<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { profile } from '../../lib/profile';
    import type { LoadPageEvent } from '../../lib/types';

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy component-event dispatcher kept as-is; matches the sibling boot screens
    const dispatcher = createEventDispatcher<{ load_page: LoadPageEvent }>();

    let logging_in = false;

    function log_in() {
        if (logging_in) return;
        logging_in = true;
        // §4.3: this click is the user gesture that unlocks audio, so the XP
        // startup sound genuinely plays. It intentionally keeps playing over
        // the welcome splash and into the desktop, like real XP.
        const startup = new Audio('/audio/xp_startup.mp3');
        startup.play().catch(() => {
            // autoplay rejected — boot silently; sound manager arrives Phase 6
        });
        dispatcher('load_page', { url: './xp/desktop.svelte' });
    }

    function restart() {
        window.location.reload();
    }
</script>

<div
    class="absolute inset-0 z-50 overflow-hidden flex flex-col bg-[#5a7edc] font-sans animate-fadein"
>
    <div
        class="h-[70px] bg-[#00309c] flex flex-row items-center shrink-0"
    ></div>
    <div
        class="h-[2px] bg-[linear-gradient(45deg,#466dcd,#c7ddff,#b0c9f7,#5a7edc)] shrink-0"
    ></div>

    <div
        class="grow bg-[radial-gradient(circle_at_5%_5%,#91b1ef_0,#7698e6_6%,#5a7edc_12%)] relative overflow-hidden flex flex-row items-center"
    >
        <!-- left: branding -->
        <div class="w-1/3 flex flex-col items-center justify-center px-6">
            <img
                src="/assets/images/xp-logo.png"
                alt="Windows XP"
                class="w-56 drop-shadow-lg"
            />
        </div>

        <!-- divider -->
        <div
            class="w-px self-stretch my-10 bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.6),transparent)] shrink-0"
        ></div>

        <!-- center: instruction -->
        <div class="w-1/3 flex items-center justify-center px-6">
            <p
                class="text-slate-50 text-lg text-center"
                style="text-shadow: 1px 1px 2px rgba(0,0,0,0.4);"
            >
                To begin, click on Mohamed to log in
            </p>
        </div>

        <!-- right: user card -->
        <div class="w-1/3 flex items-center justify-center px-6">
            <div
                id="login-user-card"
                role="button"
                tabindex="0"
                class="flex flex-row items-center gap-4 p-3 rounded-md cursor-pointer hover:bg-white/20 focus:bg-white/20 outline-none"
                on:click={log_in}
                on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') log_in();
                }}
            >
                <img
                    src={profile.meta.avatar}
                    alt={profile.meta.name}
                    class="w-16 h-16 rounded border-2 border-white/80 object-cover shadow-lg"
                />
                <div class="flex flex-col">
                    <span class="text-slate-50 text-xl font-semibold"
                        >{profile.meta.name}</span
                    >
                    <span class="text-slate-200 text-sm"
                        >{profile.meta.title}</span
                    >
                </div>
            </div>
        </div>
    </div>

    <div
        class="h-[2px] bg-[linear-gradient(45deg,#003399,#f99736,#c2814d,#00309c)] shrink-0"
    ></div>
    <div
        class="h-[70px] w-full bg-[linear-gradient(90deg,#3833ac,#00309c)] shrink-0 relative flex flex-row items-center justify-between px-6"
    >
        <div
            role="button"
            tabindex="0"
            class="flex flex-row items-center gap-2 cursor-pointer rounded p-1 hover:bg-white/10 outline-none"
            on:click={restart}
            on:keydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') restart();
            }}
        >
            <div
                class="w-7 h-7 bg-[url(/images/xp/icons/Restart.png)] bg-contain bg-no-repeat"
            ></div>
            <span class="text-slate-50 text-sm">Restart Momad's XP</span>
        </div>
        <p class="text-slate-300 text-xs max-w-[340px] text-right">
            After you log on, the system is yours to explore. Every detail has
            been designed with a purpose.
        </p>
    </div>
</div>
