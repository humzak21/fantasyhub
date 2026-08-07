#!/usr/bin/env node

/**
 * Fail the build when two eagerly-loaded chunks import each other.
 *
 * A circular *static* import between chunks means one evaluates while the
 * other's exports are still uninitialised. In production that surfaces as a
 * white screen and a message like
 *
 *   Uncaught TypeError: Cannot read properties of undefined
 *   (reading 'createContext')   at QueryClientProvider
 *
 * and it reproduces nowhere else: `npm run dev` serves modules unbundled, the
 * test suite never loads the bundle, and `vite build` exits 0 because emitting
 * a cyclic graph is not a build error. CI built the bundle and served it
 * without ever executing it, so a bad `manualChunks` shipped to production.
 *
 * Dynamic imports are excluded deliberately — `import()` returns a promise and
 * resolves after the importing module has finished evaluating, so a cycle
 * through one is not a hazard. That is why the lazy per-tab chunks show up as
 * mutual references and are fine.
 *
 * Usage: node scripts/check-bundle.js [distDir]
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const DIST = join(process.argv[2] || 'dist', 'assets');

const STATIC_IMPORT = /(?:^|[;}\s])import\s*(?:[^"';]*?from\s*)?["']\.\/([A-Za-z0-9._-]+\.js)["']/g;
const DYNAMIC_IMPORT = /import\s*\(\s*["']\.\/([A-Za-z0-9._-]+\.js)["']/g;

function staticGraph(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const graph = new Map();

  for (const file of files) {
    const src = readFileSync(join(dir, file), 'utf8');
    const statics = new Set([...src.matchAll(STATIC_IMPORT)].map((m) => m[1]));
    for (const [, dep] of src.matchAll(DYNAMIC_IMPORT)) statics.delete(dep);
    statics.delete(file);
    graph.set(file, statics);
  }
  return graph;
}

function findCycles(graph) {
  const cycles = [];
  for (const [a, deps] of graph) {
    for (const b of deps) {
      if (graph.get(b)?.has(a) && a < b) cycles.push([a, b]);
    }
  }
  return cycles;
}

function main() {
  if (!existsSync(DIST)) {
    console.error(`❌ ${DIST} not found — run \`npm run build\` first.`);
    process.exit(1);
  }

  const graph = staticGraph(DIST);
  const cycles = findCycles(graph);

  if (cycles.length === 0) {
    console.log(`✅ ${graph.size} chunks, no circular static imports.`);
    return;
  }

  console.error(`❌ ${cycles.length} circular static import(s) between chunks:\n`);
  for (const [a, b] of cycles) console.error(`   ${a}\n   <-> ${b}\n`);
  console.error('This ships a white screen. Check `manualChunks` in vite.config.js:');
  console.error('a manual chunk must never import another chunk that imports it back.');
  process.exit(1);
}

// Only run when executed directly, per the repo-wide script guard.
if (import.meta.url === `file://${process.argv[1]}`) main();
