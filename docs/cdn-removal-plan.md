# Removing the two SRI-less CDN origins

**Status:** implemented. Extends the Phase 3 posture that vendored panzoom
(design decision 13) and stubbed jspaint's `sessions.js`.

**Supersedes** `docs/phase-3-guide.md` §deploy-probe (which recorded the
gstatic request as expected and accepted) and closes the Phase 1 item tracked
at `docs/phase-0-guide.md:85`. Both carry superseded-notes pointing here.

A red-team pass (gate 4, fresh context, find-problems framing) ran against the
version of this document below. Its findings and their dispositions are at the
end — three of them changed the implementation, one was rejected, and one was
the reason a baseline capture happened at all.

## Why

Six third-party origins are reachable at runtime. Four carry SRI hashes
(`code.jquery.com` ×3, `unpkg.com`); one is governed by a real CSP
(`cdn.jsdelivr.net`, Pyodide, `netlify.toml:85`). **Two carry no integrity
guarantee at all** and are the subject of this plan:

| Origin | Consumer | Why SRI is impossible |
| --- | --- | --- |
| `www.gstatic.com/charts/loader.js` | `disk_properties.svelte:83-107` — one 100px pie | The loader fetches further submodules at URLs we never declare; hashing the bootstrap verifies the doorman, not the guests |
| `cdn.skypack.dev/three@0.136.0` | all 12 `static/html/visualizers/*.html` | `import` statements have no `integrity` attribute |

Both execute third-party code we cannot pin by hash. gstatic runs on **every
page load** for a graphic most visitors never open; Skypack runs whenever the
music player opens an audio file, and resolves through a 767-byte redirect stub
to a build-hashed path with `max-age=300`, so it is re-checked constantly.

Out of scope, deliberately: see §Deferred.

---

## Part 1 — gstatic / Google Charts

### 1.1 What replaces the pie

The current chart is a 3D pie, 100px tall, two slices, `is3D: true`,
`enableInteractivity: false`, no labels, no legend, transparent background,
colours `#1d4ed8` (used) and `#ec4899` (free) — which exactly match the
`bg-blue-700` / `bg-pink-500` legend swatches at `disk_properties.svelte:171`
and `186`.

**Option A — local SVG, keep the 3D look.**
*For:* pixel-continuity with what ships today and with the real XP dialog,
which is 3D; no visible change for a returning visitor; geometry is a pure
function, so it unit-tests without a browser.
*Against:* the most code of any option (~90 lines of arc maths); the elliptical
projection has edge cases (full circle, zero slice) that must be handled
explicitly or emit `NaN` into path data.

**Option B — local SVG, flat 2D pie.**
*For:* about a third of the code; no depth walls, no z-ordering.
*Against:* a visible change to a shipped screen — precisely the regression the
task says to avoid — and it walks away from XP fidelity, which is the whole
point of this project.

**Option C — `<canvas>`.**
*For:* trivial arc drawing via `arc()`.
*Against:* imperative, needs a redraw on resize, and the output is unassertable
from a DOM test — the exact opposite of what "no regressions" wants. Also
reintroduces the mount-timing coupling that `draw_chart()` has today.

**Option D — CSS `conic-gradient`.**
*For:* three lines, no JS at all.
*Against:* flat only (no 3D), and nothing in the DOM encodes the ratio, so a
test can only assert a style string — weak coverage.

**Verdict: A.** The deciding factor is that this task is defined by *not*
changing what the user sees. B, C and D all either alter the rendering or make
it untestable; A is the only one that keeps both the pixels and the assertions.

### 1.2 Where the geometry lives

**Option A — a pure module, `src/lib/charts/pie3d.ts`, returning path strings.**
*For:* unit-testable with zero DOM; matches the repo's existing split (`render.ts`
does exactly this for terminal rows); keeps `disk_properties.svelte` declarative.
*Against:* one more file; the component must reactively derive paths.

**Option B — build the paths inline in the component.**
*For:* no new file.
*Against:* geometry is then only reachable through a mounted Svelte component,
so every edge case (NaN capacity, over-full drive) costs an E2E instead of a
unit test. `render.ts` exists because this repo already learned that lesson.

**Verdict: A.** Deciding factor: the edge cases in §1.3 are cheap to test as a
pure function and expensive to test through a window.

### 1.3 Edge cases the current code does not handle

`details.capacity` is `disk.capacity ?? NaN` (`disk_properties.svelte:51`) and
`free_space = capacity - used_space` is never clamped, so:

- **`capacity` is `NaN`** — today Google Charts renders nothing. The SVG must
  also render nothing rather than emit `d="M NaN,NaN …"`.
- **`used_space > capacity`** (possible on F:, a 2MB removable drive, after an
  upload) — `free_space` goes negative. Google Charts renders a broken or empty
  chart. The replacement clamps the ratio to `[0, 1]`.
- **A slice is the entire circle** (`used == 0`, or `free == 0`) — a single
  elliptical arc whose start and end points coincide draws nothing in SVG. Must
  special-case to a full `<ellipse>`.

*For clamping:* it removes a class of broken rendering.
*Against:* it is a behaviour change, however small — the numeric read-outs above
the chart still show the negative byte count, so chart and text can disagree.
**Verdict: clamp the chart, leave the text alone.** Deciding factor: the text
figures are the base's documented kept-bug (`disk_properties.svelte:47-49`);
silently "fixing" them is scope this task did not ask for, whereas emitting
`NaN` path data would be a new defect introduced by this change.

### 1.4 What else comes out

`app.d.ts:51-62` (`GoogleChartsApi`) and `app.d.ts:76` (`declare const google`)
become dead and are removed; the `app.d.ts:8-9` comment listing the CDN globals
loses its Google Charts mention. No alternatives — forced by the fact that
nothing else references `google`.

---

## Part 2 — Skypack / three.js

### 2.1 Resolving the bare `three` specifier

The vendored `examples/jsm` files import `from 'three'`. Transitive closure from
the five entry points the visualizers use is **10 files** (verified by walking
the relative imports): `controls/OrbitControls.js`, `math/MeshSurfaceSampler.js`,
`postprocessing/{EffectComposer,MaskPass,Pass,RenderPass,ShaderPass,UnrealBloomPass}.js`,
`shaders/{CopyShader,LuminosityHighPassShader}.js`. The **only** bare specifier
in that closure is `three`.

**Option A — an import map in each visualizer HTML.**
*For:* the vendored files are copied byte-for-byte with no edits, so they stay
diffable against npm; relative imports keep working unchanged; one 3-line
`<script type="importmap">` per file.
*Against:* import maps need Chrome 89+ / Safari 16.4+ / Firefox 108+; must be
declared before any module script in the document.

**Option B — rewrite `from 'three'` to a relative path in each copied file.**
*For:* no import-map support needed.
*Against:* edits inside vendored third-party code, so the copies no longer match
upstream and a future version bump is a manual merge; ten files to get right,
and a missed one fails silently at runtime as a bare-specifier error.

**Verdict: A.** Deciding factor: byte-identical vendored copies are verifiable
against `node_modules` in a test; hand-edited ones are not. The browser floor is
already far above the import-map baseline (the app requires `OffscreenCanvas`,
WASM and module workers elsewhere).

### 2.2 Provenance of the vendored bytes

**Option A — `three@0.136.0` as a devDependency; copy from `node_modules`.**
*For:* the version is recorded in `package.json` + lockfile, `npm audit` can see
it, and a test can assert the committed copies still match `node_modules`
byte-for-byte — so drift is impossible to merge accidentally. Same shape as
`pyodide`, already a devDependency for types only.
*Against:* ~30MB in `node_modules` that CI installs for files that never enter
the client bundle.

**Option B — download the files from unpkg and commit them.**
*For:* no dependency, no install cost.
*Against:* no recorded provenance, nothing to diff against, and the "is this
really three 0.136.0?" question becomes unanswerable — which is the same trust
problem the whole task is trying to remove.

**Verdict: A.** Deciding factor: it makes the vendored copies *checkable*, which
B cannot. Pin exactly (`"three": "0.136.0"`, not `^`) so the copies and the
package can never diverge.

### 2.3 Minified or not

**Option A — ship `build/three.module.js` (unminified, ~1.2MB).**
*For:* byte-identical to npm, so §2.2's drift test is a plain file compare.
*Against:* ~4× the bytes over the wire vs. minified.

**Option B — minify at vendor time.**
*For:* smaller.
*Against:* the drift test would have to re-run the minifier to compare, making
the check depend on a toolchain version; and the file is served from our own
origin behind Netlify's gzip/brotli, which recovers most of the difference.

**Verdict: A.** Deciding factor: verifiability beats transfer size here, because
compression already narrows the gap and this loads only when the music player
opens an audio file — not on the critical path.

### 2.4 Layout

`static/js/three/` mirroring the upstream tree, so relative imports resolve
without edits:

```
static/js/three/three.module.js
static/js/three/examples/jsm/controls/OrbitControls.js
static/js/three/examples/jsm/math/MeshSurfaceSampler.js
static/js/three/examples/jsm/postprocessing/{EffectComposer,MaskPass,Pass,RenderPass,ShaderPass}.js
static/js/three/examples/jsm/postprocessing/UnrealBloomPass.js
static/js/three/examples/jsm/shaders/{CopyShader,LuminosityHighPassShader}.js
```

No alternatives — forced by the fact that the copied files contain relative
imports like `../shaders/CopyShader.js` that only resolve in this shape.

---

## Part 3 — Regression protection

**There is currently no test of any kind** covering `disk_properties` or the
visualizers — verified: no `e2e/*.spec.ts` opens either. So "no regressions"
cannot mean "the existing tests still pass"; the tests have to be written.

- `src/lib/charts/pie3d.test.ts` — geometry as a pure function: ratio → arc
  flags, the three §1.3 edge cases, colour darkening, and that no output ever
  contains `NaN`.
- `e2e/disk_properties.spec.ts` — open Properties on C: from all three entry
  points (`CMFSItem.ts:340`, `CMFSVoid.ts:199`, `my_computer.svelte:303`),
  assert two slices are in the DOM with the legend's colours, and assert
  **no request to `gstatic.com`** is made.
- `e2e/visualizers.spec.ts` — load each of the 12 visualizer documents, assert a
  WebGL canvas appears, assert **no request to `skypack.dev`**, and assert no
  console error.
- `src/lib/vendor.test.ts` — every committed file under `static/js/three/`
  matches `node_modules/three` byte-for-byte.

Each new assertion gets mutation-verified: revert the corresponding source
change and confirm the test goes red.

## Deferred

**`unpkg.com`/loadjs.** Once Google Charts is gone, `loadjs` exists only to fetch
one local file (`desktop.svelte:104`), and `app.html:206` pulls the library from
unpkg to do it. Replacing it with a plain `<script>` tag would remove a sixth
origin. Not in this change: the user scoped this to gstatic and Skypack, and
`loadjs`'s cache-warming behaviour interacts with `app.html`'s boot sequence,
which deserves its own look rather than a drive-by.

**jspaint's dormant callers** — `vaporwave-fun.js:16` (YouTube API, Konami code)
and `themes/winter.css:3` (Google Fonts, every December). Both are inside
vendored jspaint and neither fires in normal use; removing them means another
`prune-jspaint.mjs` pass.


---

## Red-team dispositions (gate 4)

| Finding | Grade given | Disposition |
| --- | --- | --- |
| **10 of 12 visualizers import `OrbitControls` with no file extension.** Skypack resolves that; a static file server 404s. Option A as written breaks 83% of audio plays. | Wrong | **Accepted — verified.** All 10 confirmed. The rewrite appends `.js`; `e2e/no_cdn.spec.ts` was then mutation-tested by removing it again, and the visualizer test goes red. |
| **Part 3's premise is false: `e2e/music_player.spec.ts` already loads a visualizer** (it plays audio, and `media_player_classic.svelte:341` frames a random one), so the suite already hit skypack — and hit gstatic on every page load. ci.yml's "hermetic" comment was untrue. | Weak | **Accepted — verified.** The claim "no test covers either" was wrong. Recorded in the guide's superseded-note: this change *earns* the hermeticity claim rather than preserving it. |
| **Capture the Google Charts rendering before deleting the loader** — otherwise "no regressions" is unfalsifiable forever. | highest-leverage | **Accepted, and it changed the outcome.** A throwaway spec drove the live global at five controlled ratios and dumped the SVG. That turned §1.1 from "reproduce it from arc maths" into transcription: `pie3d.test.ts` asserts the module reproduces Google's own output, and mutations to `GEOMETRY` each go red. One correction to the reviewer's suggested location — `design/` is **gitignored**, so the numeric fixture lives at `src/lib/charts/google-charts-baseline.json` next to its test; a test reading an untracked file passes locally and fails on CI checkout. The screenshots remain local-only, which is what `design/research/` already was. |
| **CDN assertions are a denylist; invert to an allowlist.** | Weak | **Accepted.** `e2e/no_cdn.spec.ts` allows our origin plus the two SRI-pinned hosts and fails on anything else. |
| **Nothing checks the build output**; a stale `static/` or a dropped file passes every other gate. | missing | **Accepted.** `scripts/verify-build.mjs` §3c asserts the vendored files reached `build/`, that all 12 visualizers are present and skypack-free, and that no built JS mentions the charts loader. Both halves mutation-tested. |
| **`capacity === 0` is a fourth edge case** the plan missed (`0/0` is `NaN`, `n/0` is `Infinity`). | Acceptable | **Accepted.** Covered by `pie_shapes` and asserted in `pie3d.test.ts`. |
| **Module identity**: if the HTML and the jsm files resolve `three` to different URLs, two instances load and `instanceof` checks fail silently. | missing | **Accepted.** Both sides use the bare specifier `three` through one import-map entry. `vendored_three.test.ts` asserts `three` is the *only* bare specifier in the vendored tree. |
| **Three's MIT LICENSE was not in the vendored list.** | missing | **Accepted.** Copied; the file list is asserted, so it cannot be dropped silently. |
| **`devDependency` misclassifies deployed code** — `npm audit --omit=dev` would report clean while vulnerable three.js is live. | Weak | **Accepted.** Moved to `dependencies`. Nothing imports it, so Vite still does not bundle it; the classification now matches where the bytes actually run. |
| **Cache headers**: `static/` is copied verbatim and never content-hashed, so 1.17MB revalidates per visualizer load. | missing | **Accepted.** `netlify.toml` gains a `/js/three/*` block, placed *before* the python-sandbox block to respect its KEEP THIS BLOCK LAST note, and naming only `Cache-Control` so the `/*` CSP still applies. |
| **The lockfile may have been written by npm 11** (CLAUDE.md hard rule). | Weak | **Rejected — the premise is wrong.** `npx -y npm@10 install` was used for both the add and the dev→prod move; the lock is `lockfileVersion 3` with `license` on 471/471 packages, consistent with the 470 already committed. The *process* point stands and is now written into this plan. |
| **Three-entry-point E2E for Properties.** | — | **Partially rejected, deliberately.** The three routes to `disk_properties` (`CMFSItem.ts:340`, `CMFSVoid.ts:199`, `my_computer.svelte:303`) were not touched by this change, so covering all three tests routing, not this work. The second test instead covers the *other geometry branch* — an empty drive collapsing to a full `<ellipse>` — which is a real code path with no coverage. Mutation-tested by deleting the special case. |
| **12 WebGL contexts will flake on a 2-core runner.** | Weak | **Accepted.** All twelve run as ONE test with sequential navigations, asserting a WebGL context exists (via `getContext('2d') === null`) rather than waiting on pixels. |
| **`vendor.test.ts` would pass vacuously if a file were deleted.** | — | **Accepted.** It asserts the exact file list first, then per-file bytes. |
| **Deferred: a `script-src 'self'` CSP for `/html/visualizers/*`** would make the removal irreversible rather than merely done. | missing | **Deferred, recorded.** It needs a deploy probe to verify (`vite preview` ignores `netlify.toml`) and Netlify deploys are currently blocked on account credits. Worth doing when deploys resume; `verify-build.mjs` §3c is the interim guard. |
