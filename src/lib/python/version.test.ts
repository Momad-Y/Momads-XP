import { describe, it, expect } from 'vitest';
import pkg from '../../../package.json';
import { PYODIDE_VERSION, PYODIDE_CDN_BASE, PYODIDE_ORIGIN } from './version';

describe('PYODIDE_VERSION', () => {
    it('matches the pinned devDependency exactly', () => {
        // The devDependency exists ONLY to give the CDN import real types.
        // If the two drift, the types describe one runtime while the browser
        // downloads another — a silent, deploy-only class of bug. This makes
        // it a red test instead.
        // Imported, not `require`d + cast: `no-unsafe-type-assertion` is an
        // ERROR over src/, and resolveJsonModule gives this a precise literal
        // type, so a removed devDependency is a TYPE error, not a runtime
        // `undefined` that a loose assertion would have hidden.
        expect(pkg.devDependencies.pyodide).toBe(PYODIDE_VERSION);
    });

    it('is pinned exactly — no range prefix', () => {
        // A `^` or `~` here would let npm resolve a different runtime than the
        // one the CDN URL names.
        expect(PYODIDE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('builds a jsDelivr URL with the mandatory `v` prefix', () => {
        // Verified against the live CDN: /pyodide/v0.28.3/full/ resolves,
        // /pyodide/0.28.3/full/ is a 404.
        expect(PYODIDE_CDN_BASE).toBe(
            `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
        );
    });

    it('names an origin that is a prefix of every URL it builds', () => {
        // netlify.toml's script-src/connect-src for the sandbox host is written
        // against PYODIDE_ORIGIN. If a URL escaped that origin the CSP would
        // block it on the deploy only.
        expect(PYODIDE_CDN_BASE.startsWith(PYODIDE_ORIGIN + '/')).toBe(true);
    });
});
