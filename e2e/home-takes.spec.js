import { test, expect } from '@playwright/test';

import { FROZEN_AT, SEASON_ID, openLeague, scoredThrough } from './fixtures/liveWeek.js';

/**
 * The home page's takes card fills the room it has. On a desktop it is the
 * last card in the narrow column, stretched to wherever the wide one ends, and
 * after week 9 Punishment Watch makes that a long way: the card adds takes
 * until the next would not fit whole. On a phone nothing stretches it, and it
 * shows the essentials (`selectHomeTakes`: the two newest here).
 */

const hoursBefore = (hours) => new Date(new Date(FROZEN_AT).getTime() - hours * 3600e3).toISOString();

const TAKES = Array.from({ length: 12 }, (_, i) => ({
  id: `take-${i}`,
  user_id: 'author',
  season_id: SEASON_ID,
  body:
    i % 3 === 0
      ? `Take ${i}: a longer take that runs onto a second line and maybe a third, as real ones do.`
      : `Take ${i}: a short one`,
  target_type: 'end_of_season',
  target_week: null,
  status: 'pending',
  wager: '$20',
  created_at: hoursBefore(i * 5 + 1),
  take_participants: []
}));

const takesCard = (page) => page.locator('section[aria-labelledby="home-takes-title"]');

test('the takes card fills the room it has', async ({ page }, testInfo) => {
  await openLeague(page, '/home', 'Luke Late', { tables: { games: scoredThrough(9), takes: TAKES } });

  const card = takesCard(page);
  await expect(card.getByText('Take 0:')).toBeVisible();
  const items = card.getByRole('listitem');

  if (testInfo.project.name === 'desktop') {
    await expect.poll(() => items.count()).toBeGreaterThan(2);

    // Measure at rest. Each card rises 8px as it is revealed, staggered, so
    // two cards sampled mid-reveal disagree by a few pixels with nothing
    // wrong. Only the reveal is awaited: the live dot pulses forever.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.animationName === 'home-reveal')
          .map((animation) => animation.finished)
      )
    );

    // Every take shown is whole: none runs past the card's bottom edge.
    const cardBox = await card.boundingBox();
    const lastBox = await items.last().boundingBox();
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);

    // And the columns still end level: the takes never made the card taller.
    const main = await page.locator('section[aria-labelledby="home-recent-form-title"]').boundingBox();
    expect(Math.abs(main.y + main.height - (cardBox.y + cardBox.height))).toBeLessThanOrEqual(1);
  } else {
    await expect(items).toHaveCount(2);
  }
});
