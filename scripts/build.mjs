import { cp, copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');

await mkdir(DIST, { recursive: true });

for (const file of ['index.html', 'login.html', 'logout.html', 'styles.css', 'favicon.svg']) {
  await copyFile(join(ROOT, file), join(DIST, file));
}
for (const directory of ['docs', 'models', 'src']) {
  await cp(join(ROOT, directory), join(DIST, directory), { recursive: true });
}

const mediapipe = join(DIST, 'vendor', 'mediapipe');
await mkdir(mediapipe, { recursive: true });
await copyFile(
  join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'vision_bundle.mjs'),
  join(mediapipe, 'vision_bundle.mjs'),
);
await cp(
  join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
  join(mediapipe, 'wasm'),
  { recursive: true },
);

const chess = join(DIST, 'vendor', 'chess.js');
await mkdir(dirname(chess), { recursive: true });
await copyFile(join(ROOT, 'node_modules', 'chess.js', 'dist', 'esm', 'chess.js'), chess);

console.log(`Built static site in ${DIST}`);
