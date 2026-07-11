<script>
    import {onMount, createEventDispatcher} from 'svelte';

    let dispatcher = createEventDispatcher();
    let fallback_timer;
    let destroyed = false;

    function done() {
        if (destroyed) return;
        destroyed = true;
        clearTimeout(fallback_timer);
        dispatcher('done');
    }

    onMount(() => {
        let welcome_audio = new Audio("/audio/xp_startup.mp3");
        welcome_audio.addEventListener("canplaythrough", () => {
            welcome_audio.play().catch(() => done()); // autoplay blocked → skip immediately
        });
        welcome_audio.addEventListener("ended", () => done());
        welcome_audio.addEventListener("error", () => done());
        fallback_timer = setTimeout(() => done(), 7000);
        return () => {
            welcome_audio.pause();
            welcome_audio.src = '';
        };
    })

</script>


<div class="absolute inset-0 z-50 overflow-hidden flex flex-col bg-[#5a7edc] font-sans">
    <div class="h-[70px] bg-[#00309c] flex flex-row items-center shrink-0">

    </div>
    <div class="h-[2px] bg-[linear-gradient(45deg,#466dcd,#c7ddff,#b0c9f7,#5a7edc)] shrink-0"></div>
    <div class="grow bg-[radial-gradient(circle_at_5%_5%,#91b1ef_0,#7698e6_6%,#5a7edc_12%)] relative overflow-hidden">
        <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[42px] text-slate-50 italic font-bold">Welcome</span>
    </div>

    <div class="h-[2px] bg-[linear-gradient(45deg,#003399,#f99736,#c2814d,#00309c)] shrink-0"></div>
    <div class="h-[70px] w-full bg-[linear-gradient(90deg,#3833ac,#00309c)] shrink-0 relative">
    </div>

</div>
