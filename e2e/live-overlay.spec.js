import { test, expect } from '@playwright/test';

import { openLeague } from './fixtures/liveWeek.js';

/**
 * The three claims a score can make, on the pages that make them.
 *
 * A live number has to read as neither a result nor a guess, and that is a
 * promise about what ends up on screen, through every layer between the snapshot
 * and the page. The unit tests hold each layer; this holds the whole of it, in a
 * real browser at both widths. See `fixtures/liveWeek.js` for the league.
 */

const LIVE = 'Lena Live';
const FINAL = 'Fiona Final';
const EARLY = 'Erin Early';

const card = (page, name) => page.locator('.rounded-xl', { hasText: name }).last();

async function expectNoOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('a game card', () => {
  test.beforeEach(async ({ page }) => {
    await openLeague(page, '/schedule', LIVE);
    await expect(page.getByText('Live Leaders').first()).toBeVisible();
  });

  test('labels a game on the field as live, with what is left', async ({ page }) => {
    const game = card(page, 'Live Leaders');

    await expect(game).toContainText('Live');
    await expect(game).toContainText('live');
    await expect(game).toContainText('64.5');
    await expect(game).toContainText('1 yet to play · proj 110.3');
    await expect(game).not.toContainText('Scheduled');
    await expectNoOverflow(page);
  });

  test('gives way to an imported score', async ({ page }) => {
    const game = card(page, 'Final Winners');

    await expect(game).toContainText('121.2');
    await expect(game).not.toContainText('live');
    await expect(game).not.toContainText('proj');
    await expect(game).not.toContainText('yet to play');
  });

  test('labels a game nobody has kicked off as a projection', async ({ page }) => {
    const game = card(page, 'Early Birds');

    await expect(game).toContainText('proj');
    await expect(game).toContainText('118.6');
    await expect(game).toContainText('Scheduled');
    await expect(game).not.toContainText('yet to play');
  });
});

test.describe('the hero', () => {
  const hero = (page) => page.getByRole('region', { name: /your matchup/i });

  test('reads a game in progress off the score so far', async ({ page }) => {
    await openLeague(page, '/home', LIVE);

    await expect(hero(page)).toContainText('64.5');
    await expect(hero(page)).toContainText('In progress');
    await expect(hero(page)).toContainText('You lead by 16.3');
    await expect(hero(page)).toContainText('as of');
    await expect(hero(page)).toContainText('1 yet to play · proj 110.3');
    await expectNoOverflow(page);
  });

  test('reads a finished game as final', async ({ page }) => {
    await openLeague(page, '/home', FINAL);

    await expect(hero(page)).toContainText('121.2');
    await expect(hero(page)).toContainText('Won by 21.80');
    await expect(hero(page)).not.toContainText('as of');
    await expect(hero(page)).not.toContainText('yet to play');
  });

  test('reads a game nobody has started as a projection', async ({ page }) => {
    await openLeague(page, '/home', EARLY);

    await expect(hero(page)).toContainText('Projected');
    await expect(hero(page)).toContainText('118.6');
    await expect(hero(page)).not.toContainText('as of');
  });
});

/*
 * Full season is a toggle on /schedule, not a route, so the smoke suite's
 * per-route overflow check never saw it — and it needs a league on file,
 * which only this fixture gives the smoke environment. It was the one view
 * that genuinely overflowed: every game row grew to fit both team names side
 * by side (a `truncate` span in a flex child with no `min-w-0` cannot
 * shrink), and at phone width the season was 630px wide with team 2 off the
 * right edge of every row.
 */
test('the full season view fits the viewport', async ({ page }) => {
  await openLeague(page, '/schedule', LIVE);
  await expect(page.getByText('Live Leaders').first()).toBeVisible();

  await page.getByRole('button', { name: /full season/i }).click();
  await expect(page.getByRole('button', { name: /this week/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Week 4\b/ }).first()).toBeVisible();
  await expect(page.getByText('Live Leaders').first()).toBeVisible();

  await expectNoOverflow(page);
});

/*
 * The Playoffs tab's pick form drew its bracket in horizontal scrollers, one
 * round at a time with the next cut off at the edge. Below `sm` the rounds
 * stack; this holds the stacking and the width on the fixture league, since a
 * signed-out viewer is redirected and the smoke suite never sees the form.
 */
test('the playoff bracket form stacks its rounds on a phone', async ({ page }) => {
  // A members-only route bounces the signed-out first load to Home, and the
  // fixture's reload then stays there; open the league on a public page and
  // walk in signed in.
  await openLeague(page, '/schedule', LIVE);
  await page.goto('/playoffs', { waitUntil: 'domcontentloaded' });
  const round1 = page.getByText('Round 1', { exact: true }).first();
  await expect(round1).toBeVisible();
  await expectNoOverflow(page);

  const semis = page.getByText('Semifinals', { exact: true }).first();
  await expect(semis).toBeVisible();
  const [a, b] = await Promise.all([round1.boundingBox(), semis.boundingBox()]);
  if (page.viewportSize().width < 640) {
    expect(b.y).toBeGreaterThan(a.y + a.height);
  } else {
    expect(Math.abs(b.y - a.y)).toBeLessThan(a.height + 1);
  }
});
