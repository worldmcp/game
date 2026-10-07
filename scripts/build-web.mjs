// Builds a static web bundle in dist/web for hosts that only serve common web
// file types: every .glb becomes a self-contained glTF JSON (.gltf.json, buffer
// embedded as a data URI). Usage: node scripts/build-web.mjs
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'dist/web');
rmSync(out, { recursive: true, force: true });
for (const d of ['src', 'styles', 'vendor']) cpSync(join(root, d), join(out, d), { recursive: true });
cpSync(join(root, 'play.html'), join(out, 'play.html'));

function glbToJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
  let off = 12;
  let json;
  let bin;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  if (bin && json.buffers?.[0] && json.buffers[0].uri === undefined) {
    json.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
  }
  return JSON.stringify(json);
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = p.slice(root.length);
    if (statSync(p).isDirectory()) walk(p);
    else {
      mkdirSync(dirname(join(out, rel)), { recursive: true });
      if (name.endsWith('.glb')) writeFileSync(join(out, rel.replace(/\.glb$/, '.gltf.json')), glbToJson(readFileSync(p)));
      else cpSync(p, join(out, rel));
    }
  }
}
walk(join(root, 'assets'));
rmSync(join(out, 'vendor/three/LICENSE'), { force: true });
cpSync(join(root, 'vendor/three/LICENSE'), join(out, 'vendor/three/LICENSE.txt'));
console.log('built', out);
