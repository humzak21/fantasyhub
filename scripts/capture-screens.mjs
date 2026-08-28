#!/usr/bin/env node

/**
 * Screenshot every tab at three widths, into a directory.
 *
 * This is a *local* tool, not a CI gate. The smoke job in e2e/ deliberately
 * has no pixel baselines — they are brittle and a flaky gate gets ignored —
 * but a change to the theme layer or to a shared stylesheet needs some way to
 * answer "did this move anything". The answer is: capture before, make the
 * change, capture after, `cmp` the two directories, and open the ones that
 * differ.
 *
 * That is how the dark-mode consolidation was verified: 15 of 21 shots came
 * back byte-identical and the rest differed only by chart-render jitter.
 *
 *   npm run build && npm run preview -- --port 4173 --host 127.0.0.1 &
 *   node scripts/capture-screens.mjs /tmp/shots/before
 *   …make the change, rebuild…
 *   node scripts/capture-screens.mjs /tmp/shots/after
 *   for f in /tmp/shots/before/*.png; do
 *     cmp -s "$f" "/tmp/shots/after/$(basename $f)" || echo "DIFFERS $(basename $f)"
 *   done
 *
 * Needs a preview server already running (the app's own data, so the pages
 * have content). Signed out, so masked team names are expected.
 */

import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const OUT = process.argv[2]
if (!OUT) {
  console.error('usage: node scripts/capture-screens.mjs <output-dir>')
  process.exit(1)
}

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173'
const ROUTES = ['/rankings', '/statistics', '/schedule', '/teams', '/pickems', '/playoffs', '/settings']
const WIDTHS = [375, 768, 1280]

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await ctx.newPage()
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelector('#root')?.clientHeight > 100)
    // Queries resolve after first paint; without this the rank badges and
    // charts are missing and every capture differs from every other one.
    await page.waitForTimeout(3000)
    await page.screenshot({
      path: `${OUT}/${width}${route.replace(/\//g, '_')}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }
  await ctx.close()
}
await browser.close()
console.log('captured ->', OUT)
