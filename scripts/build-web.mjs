// Builds a static web bundle in dist/web for hosts that only serve common web
// file types and run under a strict CSP (no wasm, no fetch of data:/blob:):
//  · every .glb is decoded from meshopt to plain glTF binary and shipped as
//    base64 text (.glb.b64.txt), decoded in the browser by render/assets.js
//  · play.html opts into those formats via PLUDOR_MODEL_EXT / SAFE_TEXTURES.
// Usage: npm run build:web
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'dist/web');
rmSync(out, { recursive: true, force: true });
for (const d of ['src', 'styles', 'vendor']) cpSync(join(root, d), join(out, d), { recursive: true });
cpSync(join(root, 'play.html'), join(out, 'play.html'));
rmSync(join(out, 'vendor/three/LICENSE'), { force: true });
cpSync(join(root, 'vendor/three/LICENSE'), join(out, 'vendor/three/LICENSE.txt'));

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

async function plainGlb(path) {
  const doc = await io.read(path);
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'EXT_meshopt_compression') e.dispose();
  return Buffer.from(await io.writeBinary(doc));
}

const files = [];
async function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = p.slice(root.length);
    if (statSync(p).isDirectory()) await walk(p);
    else {
      mkdirSync(dirname(join(out, rel)), { recursive: true });
      if (name.endsWith('.glb')) writeFileSync(join(out, `${rel}.b64.txt`.replace('.glb.b64', '.glb.b64')), (await plainGlb(p)).toString('base64'));
      else cpSync(p, join(out, rel));
    }
  }
}
await walk(join(root, 'assets'));
function list(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) list(p);
    else if (!p.endsWith('play.html')) files.push(p.slice(out.length + 1));
  }
}
list(out);
writeFileSync(join(root, 'dist/web-files.json'), JSON.stringify(files.sort()));
console.log(`built ${out} (${files.length} files)`);
