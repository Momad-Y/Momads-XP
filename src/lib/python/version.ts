/**
 * The single pinned Pyodide version.
 *
 * WHY A CONSTANT: `docs/phase-3-spec.md` D-B1. The runtime is fetched from
 * jsDelivr at this exact version — jsDelivr is an S3-backed mirror with no
 * semver resolution, so there is no `@latest` and a bad pin is a hard 404 on
 * the deployed site, with no local test that would catch it.
 *
 * WHY 0.28.3 AND NOT `latest`: Pyodide left `0.x` behind — `latest` is now
 * 314.0.5, which ships **Python 3.14.2** (ABI 2026_0), renames
 * `pyodide.asm.js` to `.mjs`, and drops classic workers entirely. 0.28.3 ships
 * **Python 3.13.2** (ABI 2025_0), which is what SPECIFICATION.md §3.2 and the
 * Phase 3 exit criteria call for.
 *
 * IMPORTANT: §3.2's "Python 3.13.x" is a CONSEQUENCE of this pin, not an
 * independent requirement. Bumping to 314.x is NOT "one edit" — it changes the
 * banner text, the asset filenames and the worker contract. Treat it as a
 * deliberate migration, not a version bump.
 *
 * The `pyodide` npm package is a devDependency for TYPES ONLY — the repo's
 * ESLint config makes `no-unsafe-*` errors, and a bare `import(CDN_URL)`
 * resolves to `any` all the way down. `version.test.ts` asserts this constant
 * and the installed package cannot drift apart.
 */
export const PYODIDE_VERSION = '0.28.3';

/** jsDelivr requires the `v` prefix — `/pyodide/0.28.3/` is a 404. */
export const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** The ES module entry point. Loaded by the sandboxed host, never by us. */
export const PYODIDE_ENTRY = `${PYODIDE_CDN_BASE}pyodide.mjs`;

/**
 * The origin the sandbox host is allowed to reach. Must stay in sync with the
 * `connect-src` / `script-src` in `netlify.toml`'s
 * `/html/python-sandbox.html` block.
 */
export const PYODIDE_ORIGIN = 'https://cdn.jsdelivr.net';
