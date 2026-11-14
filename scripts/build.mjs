// Copy only the deployable site files into dist/ (used by Amplify CI and for local checks).
//   npm run build
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'dist');
const INCLUDE = ['index.html', 'app.html', 'site.webmanifest', 'css', 'js', 'assets/web'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const item of INCLUDE) {
  const src = join(ROOT, item);
  if (!existsSync(src)) throw new Error(`Missing build input: ${item}`);
  cpSync(src, join(OUT, item), { recursive: true });
}
console.log(`Built dist/ from ${INCLUDE.join(', ')}`);
