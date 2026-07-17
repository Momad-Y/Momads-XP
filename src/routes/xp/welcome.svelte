<script lang="ts">
    import { onMount, createEventDispatcher } from 'svelte';

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy component-event dispatcher kept as-is; matches the sibling boot screens
    const dispatcher = createEventDispatcher<{ done: null }>();

    /** §2.3: ~1.5s, auto-advances. */
    const WELCOME_MS = 1500;
    /** §2 transitions table: Welcome → Desktop fade ~600ms. */
    const FADE_MS = 600;

    let fading = false;

    onMount(() => {
        // The startup sound is NOT played here: it belongs to the login-card
        // click (design decision 2). It keeps playing over this splash.
        const fade_timer = setTimeout(() => {
            fading = true;
        }, WELCOME_MS);
        const done_timer = setTimeout(() => {
            dispatcher('done');
        }, WELCOME_MS + FADE_MS);
        return () => {
            clearTimeout(fade_timer);
            clearTimeout(done_timer);
        };
    });
</script>

<div
    id="welcome-overlay"
    class="absolute inset-0 z-50 overflow-hidden flex flex-col bg-[#5a7edc] font-sans transition-opacity duration-[600ms] {fading
        ? 'opacity-0'
        : 'opacity-100'}"
>
    <div
        class="h-[70px] bg-[#00309c] flex flex-row items-center shrink-0"
    ></div>
    <div
        class="h-[2px] bg-[linear-gradient(45deg,#466dcd,#c7ddff,#b0c9f7,#5a7edc)] shrink-0"
    ></div>
    <div
        class="grow bg-[radial-gradient(circle_at_5%_5%,#91b1ef_0,#7698e6_6%,#5a7edc_12%)] relative overflow-hidden"
    >
        <span
            class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[42px] text-slate-50 italic font-bold"
            >welcome</span
        >
    </div>

    <div
        class="h-[2px] bg-[linear-gradient(45deg,#003399,#f99736,#c2814d,#00309c)] shrink-0"
    ></div>
    <div
        class="h-[70px] w-full bg-[linear-gradient(90deg,#3833ac,#00309c)] shrink-0 relative"
    ></div>
</div>
