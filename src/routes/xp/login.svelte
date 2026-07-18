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
    <!-- top band -->
    <div class="h-[10%] min-h-[56px] bg-[#00309f] shrink-0"></div>

    <!-- main area -->
    <div
        class="grow bg-[radial-gradient(circle_at_5%_5%,#91b1ef_0,#7698e6_6%,#5a7edc_12%)] relative overflow-hidden flex flex-row items-stretch"
    >
        <!-- left: logo + instruction, right-aligned toward the divider -->
        <div
            class="w-1/2 flex flex-col items-end justify-center pr-12 -mt-[4%]"
        >
            <div class="flex flex-col items-center">
                <img
                    src="/assets/images/xp-logo.png"
                    alt="Windows XP"
                    class="w-40 drop-shadow-lg"
                />
                <p
                    class="mt-6 text-slate-50 text-[17px]"
                    style="text-shadow: 1px 1px 2px rgba(0,0,0,0.35);"
                >
                    To begin, click 'My' user name
                </p>
            </div>
        </div>

        <!-- divider -->
        <div
            class="w-px self-stretch my-6 bg-[linear-gradient(to_bottom,transparent_0%,rgba(255,255,255,0.55)_12%,rgba(255,255,255,0.55)_88%,transparent_100%)] shrink-0"
        ></div>

        <!-- right: user tile bar, XP-style -->
        <div class="w-1/2 flex items-center -mt-[4%]">
            <div
                id="login-user-card"
                role="button"
                tabindex="0"
                class="user-tile group ml-7 w-full flex flex-row items-center gap-3 py-2 pl-2 cursor-pointer outline-none"
                on:click={log_in}
                on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') log_in();
                }}
            >
                <img
                    src={profile.meta.avatar}
                    alt={profile.meta.name}
                    class="w-12 h-12 rounded-[3px] border-2 border-white/90 object-cover group-hover:border-[#f5c542] group-focus:border-[#f5c542]"
                />
                <div class="flex flex-col leading-tight">
                    <span class="text-slate-50 text-[17px]"
                        >{profile.meta.name}</span
                    >
                    <span class="text-slate-50 text-[11px] font-bold"
                        >1337 programs running.</span
                    >
                </div>
            </div>
        </div>
    </div>

    <!-- orange separator + footer -->
    <div
        class="h-[2px] bg-[linear-gradient(90deg,#e2681c,#f99736_30%,#a34e14)] shrink-0"
    ></div>
    <div
        class="h-[12%] min-h-[72px] w-full bg-[linear-gradient(90deg,#392fa0,#2b57c8)] shrink-0 relative flex flex-row items-center justify-between px-8"
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
            <span class="text-slate-50 text-[16px]">Restart Momad's XP</span>
        </div>
        <p class="text-slate-100 text-[11px] text-right leading-snug">
            After you log on, you 'can't' add or change accounts.<br />
            Don't go to Control Panel.
        </p>
    </div>
</div>

<style>
    .user-tile {
        background: linear-gradient(
            to right,
            #2a50c8 0%,
            #3a63d4 45%,
            rgba(90, 126, 220, 0) 92%
        );
        border-top: 1px solid rgba(160, 186, 240, 0.7);
        border-bottom: 1px solid rgba(160, 186, 240, 0.5);
        border-top-left-radius: 4px;
        border-bottom-left-radius: 4px;
    }

    .user-tile:hover,
    .user-tile:focus {
        background: linear-gradient(
            to right,
            #3560da 0%,
            #4a73e4 45%,
            rgba(90, 126, 220, 0) 92%
        );
    }
</style>
