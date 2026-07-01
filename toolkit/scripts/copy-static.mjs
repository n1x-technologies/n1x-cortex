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
// d3-force's UMD externalizes its d3 micro-deps (dispatch/quadtree/timer), expecting them
// on the global `d3` — so they must be vendored and loaded first. These packages' "exports"
// maps also only allow "umd" (which Node's require.resolve ignores) or "default"
// (-> src/index.js, ESM source, no UMD global), blocking the dist/*.min.js subpath. Resolve
// each package root via the permitted bare specifier, then copy the UMD build's real path.
// index.html must load the micro-deps before d3-force.min.js.
for (const name of ['d3-dispatch', 'd3-quadtree', 'd3-timer', 'd3-force']) {
  const pkgRoot = dirname(dirname(require.resolve(name)));
  await cp(join(pkgRoot, `dist/${name}.min.js`), join(vendorDir, `${name}.min.js`));
}
await cp(require.resolve('cytoscape-d3-force/cytoscape-d3-force.js'), join(vendorDir, 'cytoscape-d3-force.js'));

console.log('copied static assets + vendored cytoscape + d3-force to dist/viz/static');
