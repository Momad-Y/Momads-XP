/**
 * The vendored three.js must stay byte-identical to the pinned package.
 *
 * `static/js/three/` replaced `cdn.skypack.dev`, which could not carry SRI
 * because an `import` statement has nowhere to put a hash. Copying the bytes
 * only removes that trust problem if the copies are verifiable, so this is the
 * check that makes the whole approach honest: three@0.136.0 is a pinned
 * devDependency purely so this comparison has something to compare against.
 *
 * Requires dev dependencies installed — CI runs a plain `npm ci`, so that
 * holds there.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const VENDOR = 'static/js/three';
const UPSTREAM = 'node_modules/three';

/** Where each vendored file came from; `examples/jsm` keeps its shape so the
 *  copied files' own relative imports (`../shaders/CopyShader.js`) resolve. */
function upstream_of(rel: string): string {
    return rel === 'three.module.js'
        ? join(UPSTREAM, 'build', rel)
        : join(UPSTREAM, rel);
}

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

const files = walk(VENDOR)
    .map((f) => relative(VENDOR, f))
    .sort();

describe('vendored three.js', () => {
    it('contains exactly the files the visualizers import, plus the licence', () => {
        // asserted as a list, not just per-file: a per-file loop over whatever
        // happens to be on disk passes vacuously when a file is deleted
        expect(files).toEqual([
            'LICENSE',
            'examples/jsm/controls/OrbitControls.js',
            'examples/jsm/math/MeshSurfaceSampler.js',
            'examples/jsm/postprocessing/EffectComposer.js',
            'examples/jsm/postprocessing/MaskPass.js',
            'examples/jsm/postprocessing/Pass.js',
            'examples/jsm/postprocessing/RenderPass.js',
            'examples/jsm/postprocessing/ShaderPass.js',
            'examples/jsm/postprocessing/UnrealBloomPass.js',
            'examples/jsm/shaders/CopyShader.js',
            'examples/jsm/shaders/LuminosityHighPassShader.js',
            'three.module.js',
        ]);
    });

    it.each(files)('%s is byte-identical to the pinned package', (rel) => {
        expect(readFileSync(join(VENDOR, rel))).toEqual(
            readFileSync(upstream_of(rel)),
        );
    });

    it('leaves `three` as the only bare specifier, so the import map suffices', () => {
        const bare = new Set<string>();
        for (const rel of files) {
            if (!rel.endsWith('.js')) continue;
            const src = readFileSync(join(VENDOR, rel), 'utf8');
            for (const m of src.matchAll(/from\s+['"]([^'".][^'"]*)['"]/g)) {
                const spec = m[1];
                if (spec != null) bare.add(spec);
            }
        }
        expect([...bare]).toEqual(['three']);
    });
});
