#!/usr/bin/env bash
# Generate the bundled Music Player tracks (Phase 3, plan T9 / spec D-D2).
#
# WHY GENERATED: the tracks are authored here, so there is no licence question
# at all — no third-party binary enters the repo and no licence claim rests on
# a page nobody can audit at commit time.
#
# WHY BROADBAND, NOT PURE TONES: the visualiser is an explicit §3.2 feature and
# a Phase 3 exit criterion. Three sine tones fed to an AnalyserNode produce a
# one- or two-spike spectrum, so the visualiser would look BROKEN rather than
# thin — gate 2 caught that the original plan's "against" was about taste and
# missed this coupling entirely. Each track below therefore has real spectral
# movement: layered harmonics, percussive transients, and a filtered sweep.
#
# THIS IS DOCUMENTATION, NOT A CI GATE. Every other generated artefact in this
# repo has a freshness check; this one deliberately does not, because ffmpeg is
# not a declared dependency and CI must not require it. The .mp3 files are
# committed. Re-running this script is only needed if you want to change them.
#
# To ship real music instead, drop your own files into static/audio/music/ and
# update src/lib/music/manifest.ts. LOCAL FILES ONLY — a cross-origin URL makes
# the Web Audio source node output silence into the graph, which kills the
# visualiser with nothing but a console warning.
set -euo pipefail

OUT="static/audio/music"
mkdir -p "$OUT"

command -v ffmpeg >/dev/null || {
    echo "ffmpeg is required (not a repo dependency — see the header)" >&2
    exit 1
}

# 1. Layered harmonics with slow vibrato — a moving low/mid spectrum.
ffmpeg -y -loglevel error \
    -f lavfi -i "sine=frequency=220:duration=42,vibrato=f=0.4:d=0.6" \
    -f lavfi -i "sine=frequency=330:duration=42,tremolo=f=0.25:d=0.7" \
    -f lavfi -i "sine=frequency=440:duration=42,vibrato=f=0.7:d=0.4" \
    -f lavfi -i "sine=frequency=660:duration=42,tremolo=f=0.5:d=0.5" \
    -filter_complex "[0][1][2][3]amix=inputs=4:duration=longest:weights=1 0.7 0.5 0.28,\
        aformat=sample_fmts=fltp,highpass=f=60,lowpass=f=6000,\
        afade=t=in:st=0:d=2,afade=t=out:st=39:d=3,volume=0.7" \
    -codec:a libmp3lame -q:a 2 -ar 44100 -ac 2 \
    -metadata title="Ascent" -metadata artist="Momad's XP" \
    "$OUT/ascent.mp3"

# 2. Percussive transients over a bass pulse — sharp attacks give the analyser
#    broadband energy that visibly jumps, which is what makes bars move.
ffmpeg -y -loglevel error \
    -f lavfi -i "anoisesrc=d=38:c=pink:a=0.5" \
    -f lavfi -i "sine=frequency=110:duration=38" \
    -filter_complex "[0]highpass=f=1200,tremolo=f=4:d=0.95[hats];\
        [1]tremolo=f=2:d=0.85,lowpass=f=200[bass];\
        [hats][bass]amix=inputs=2:duration=longest:weights=0.55 1,\
        afade=t=in:st=0:d=1.5,afade=t=out:st=35:d=3,volume=0.75" \
    -codec:a libmp3lame -q:a 2 -ar 44100 -ac 2 \
    -metadata title="Pulse" -metadata artist="Momad's XP" \
    "$OUT/pulse.mp3"

# 3. A filtered noise sweep — the spectral centroid travels across the whole
#    band, so the visualiser shows a shape that moves rather than one that
#    merely pulses.
ffmpeg -y -loglevel error \
    -f lavfi -i "anoisesrc=d=36:c=brown:a=0.8" \
    -f lavfi -i "sine=frequency=165:duration=36" \
    -filter_complex "[0]bandpass=f=900:width_type=o:w=2,\
        volume='0.6+0.4*sin(2*PI*t/12)':eval=frame[sweep];\
        [1]vibrato=f=0.3:d=0.5[drone];\
        [sweep][drone]amix=inputs=2:duration=longest:weights=1 0.5,\
        afade=t=in:st=0:d=2,afade=t=out:st=33:d=3,volume=0.7" \
    -codec:a libmp3lame -q:a 2 -ar 44100 -ac 2 \
    -metadata title="Drift" -metadata artist="Momad's XP" \
    "$OUT/drift.mp3"

echo "Generated:"
ls -la "$OUT"/*.mp3 | awk '{printf "  %-40s %8.1f KB\n", $9, $5/1024}'
