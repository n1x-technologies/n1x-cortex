import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const srcStatic = join(root, 'src/viz/static');
const distStatic = join(root, 'dist/viz/static');
await mkdir(distStatic, { recursive: true });
await cp(srcStatic, distStatic, { recursive: true });

// vendor cytoscape's browser UMD build (no CDN, fully offline)
const cyto = require.resolve('cytoscape/dist/cytoscape.min.js');
await mkdir(join(distStatic, 'vendor'), { recursive: true });
await cp(cyto, join(distStatic, 'vendor/cytoscape.min.js'));

console.log('copied static assets + vendored cytoscape to dist/viz/static');
