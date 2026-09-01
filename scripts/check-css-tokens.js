#!/usr/bin/env node

/**
 * Fail the build when the Tailwind theme layer generates nothing.
 *
 * Tailwind v4 does not read `tailwind.config.js` unless the stylesheet points
 * at one (`@config`) or declares its own `@theme`. When globals.css had a bare
 * `@import "tailwindcss"`, every semantic colour (`bg-card`,
 * `text-muted-foreground`, …), the `xs` breakpoint, the ff-* ramps and every
 * `animate-*` silently produced **no CSS at all**. Nothing failed: `vite build`
 * exited 0, the tests passed, the app rendered — just unstyled in a thousand
 * small places, which is what styles/dark-mode.css's 1,128 lines of
 * `!important` were quietly compensating for.
 *
 * That is the class of regression this checks for. It is deliberately about
 * *presence*, not appearance: a design change should never fail here, but
 * losing the theme layer again must.
 *
 * Usage: node scripts/check-css-tokens.js [distDir]
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const DIST = join(process.argv[2] || 'dist', 'assets');

/**
 * Each probe is a regex over the concatenated built CSS plus the reason it is
 * here, so a failure explains itself without anyone opening this file.
 */
const PROBES = [
  {
    name: 'semantic colour utilities',
    // `.bg-card{background-color:var(--color-card)}` — the exact utility that
    // generated nothing before the @config bridge landed.
    pattern: /\.bg-card(?![\w-])/,
    why: 'theme colours from the @theme block are not reaching the bundle',
  },
  {
    name: 'muted foreground',
    pattern: /\.text-muted-foreground(?![\w-])/,
    why: 'the muted/foreground colour pair is missing',
  },
  {
    name: 'the xs breakpoint',
    // Escaped as `.xs\:` in the emitted selector.
    pattern: /\.xs\\:/,
    why: 'theme.extend.screens.xs is not registered',
  },
  {
    name: 'ff-* brand ramps',
    pattern: /(?:--color-ff-|\.(?:bg|text|border)-ff-)/,
    why: 'the fantasy-football colour ramps are not registered',
  },
  {
    // Any one of the config's custom animations proves theme.extend.animation
    // loaded; which of them the app happens to use today is not this check's
    // business. (Tailwind's own animate-spin/pulse are built in and would
    // pass even with no config at all, so they are deliberately not listed.)
    name: 'keyframe animations',
    pattern: /\.animate-(?:float-in|bounce-subtle|fade-in|slide-in|modal-in|shimmer)(?![\w-])/,
    why: 'theme.extend.animation is not registered',
  },
];

function builtCss(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.css'));
  if (files.length === 0) return null;
  return files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
}

function main() {
  if (!existsSync(DIST)) {
    console.error(`❌ ${DIST} not found — run \`npm run build\` first.`);
    process.exit(1);
  }

  const css = builtCss(DIST);
  if (css === null) {
    console.error(`❌ no .css emitted into ${DIST} — the stylesheet never built.`);
    process.exit(1);
  }

  const missing = PROBES.filter((p) => !p.pattern.test(css));

  if (missing.length > 0) {
    console.error('❌ The Tailwind theme layer is not in the built CSS.\n');
    for (const p of missing) {
      console.error(`   • ${p.name} — ${p.why}`);
    }
    console.error(
      '\n   Check that globals.css still has its `@theme` block directly after\n' +
        '   `@import "tailwindcss"`, that the block parses, and that the\n' +
        '   `@source` lines still cover the files using these utilities.\n' +
        '   (There is no tailwind.config.js — v4 reads the theme from CSS.)'
    );
    process.exit(1);
  }

  console.log(`✅ Tailwind theme layer present (${PROBES.length} probes, ${Math.round(css.length / 1024)}kB CSS).`);
}

main();
