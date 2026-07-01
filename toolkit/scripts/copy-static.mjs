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

// vendor cytoscape + the d3-force physics extension (no CDN, fully offline)
const vendorDir = join(distStatic, 'vendor');
await mkdir(vendorDir, { recursive: true });
await cp(require.resolve('cytoscape/dist/cytoscape.min.js'), join(vendorDir, 'cytoscape.min.js'));
// d3-force's package.json "exports" map only allows the "umd" condition (which Node's
// require.resolve doesn't apply) or "default" (-> src/index.js, ESM source, no UMD
// global) — so the dist/*.min.js subpath is blocked. Resolve the package root via the
// permitted bare specifier instead, then join the UMD build's real on-disk path.
const d3ForceRoot = dirname(dirname(require.resolve('d3-force')));
await cp(join(d3ForceRoot, 'dist/d3-force.min.js'), join(vendorDir, 'd3-force.min.js'));
await cp(require.resolve('cytoscape-d3-force/cytoscape-d3-force.js'), join(vendorDir, 'cytoscape-d3-force.js'));

console.log('copied static assets + vendored cytoscape + d3-force to dist/viz/static');
