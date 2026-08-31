// REPLACED by scripts/prune-jspaint.mjs. This is not jspaint's sessions.js.
//
// The original carried three things this app has no use for:
//
//   1. A Firebase multi-user session, including jspaint's own public API key
//      (GitHub secret-scanning alert #1). Not our Google project, and the
//      feature was never reachable here.
//   2. A `#load:<url>` branch that fetched and rendered an ARBITRARY URL on
//      our own origin — the phishing primitive found at Phase 3 gate 2.
//   3. A `LocalSession` class that autosaved the canvas into localStorage.
//
// The autosave went because it never worked here, which was verified in a
// browser rather than assumed. paint.svelte loads index.html with NO session
// in the hash, so the original minted a fresh random id on every open
// (`generate_session_id` is `Math.random()`) and wrote `image#<random>`
// without ever reading the previous one back. Two consecutive Paint windows
// produced two unrelated keys. It was write-only: one orphaned PNG data URL
// per Paint window, accumulating against the ~5 MB localStorage quota forever,
// with jspaint's own `storage_quota_exceeded` dialog waiting at the end of it.
//
// `window.new_local_session` survives as a no-op because functions.js calls it
// UNGUARDED from `open_from_image_info` (the path paint.svelte uses to open a
// VFS image) and from `file_new`. Both use it only for session bookkeeping —
// the canvas work either side of it is `reset_file()`,
// `reset_canvas_and_history()` and `main_ctx.copy(...)` — so a no-op is
// correct, while a MISSING symbol throws and leaves the canvas blank. That
// failure is why the prune script's header used to say "do not delete this
// file"; `e2e/paint.spec.ts` is the guard and goes red on it.
//
// Saving is this app's job, not jspaint's: paint.svelte round-trips the canvas
// through the VFS (IndexedDB), which none of the above ever touched.
window.new_local_session = () => {};
