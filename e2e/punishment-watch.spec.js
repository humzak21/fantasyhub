import { test, expect } from '@playwright/test';

import { SEASON_ID, TEAMS, openLeague } from './fixtures/liveWeek.js';

/**
 * The home page's Punishment Watch, on the e2e league with a season scored
 * through week 9: it renders at both widths without widening the page, and a
 * press on another of the bottom four opens that team's detail.
 */

/** A round robin of the six teams over fourteen weeks, scored through `scoredThrough`. */
function season(scoredThrough) {
  const ring = TEAMS.map((team) => team.id);
  const strength = Object.fromEntries(ring.map((id, i) => [id, 124 - i * 4]));
  const games = [];
  for (let week = 1; week <= 14; week += 1) {
    for (let g = 0; g < 3; g += 1) {
      const team1 = ring[g];
      const team2 = ring[5 - g];
      const scored = week <= scoredThrough;
      // A little week-to-week noise, so the bottom is a race and not a lock.
      const wobble = ((week * 7 + g * 13) % 11) - 5;
      games.push({
        id: `pw-${week}-${g}`,
        season_id: SEASON_ID,
        week,
        type: 'regular',
        team1_id: team1,
        team2_id: team2,
        team1_score: scored ? strength[team1] + wobble * 3 : null,
        team2_score: scored ? strength[team2] - wobble * 2 : null,
        is_completed: scored,
        espn_matchup_id: 1000 + week * 10 + g
      });
    }
    ring.splice(1, 0, ring.pop());
  }
  return games;
}

const watchCard = (page) => page.locator('section[aria-labelledby="home-punishment-watch-title"]');

async function expectNoOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test('the watch follows the bottom four after week 9', async ({ page }, testInfo) => {
  await openLeague(page, '/home', 'Luke Late', { tables: { games: season(9) } });

  const card = watchCard(page);
  await expect(card).toBeVisible();
  await expect(card).toContainText('After week 9');
  await expect(card.getByRole('list', { name: 'The bottom four' }).getByRole('button')).toHaveCount(4);
  await expect(card).toContainText('What it takes to escape');
  await card.scrollIntoViewIfNeeded();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('punishment-watch.png'), fullPage: true });

  // Another team's detail, on a press.
  const buttons = card.getByRole('list', { name: 'The bottom four' }).getByRole('button');
  const second = buttons.nth(1);
  await second.click();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
});

test('the watch waits for week 9 to be scored', async ({ page }) => {
  await openLeague(page, '/home', 'Luke Late', { tables: { games: season(8) } });
  await expect(page.locator('section[aria-labelledby="home-standings-title"]')).toBeVisible();
  await expect(watchCard(page)).toHaveCount(0);
});
