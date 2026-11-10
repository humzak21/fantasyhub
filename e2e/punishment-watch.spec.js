import { test, expect } from '@playwright/test';

import { openLeague, scoredThrough as season } from './fixtures/liveWeek.js';

/**
 * The home page's Punishment Watch, on the e2e league with a season scored
 * through week 9: it renders at both widths without widening the page, and a
 * press on another of the bottom four opens that team's detail.
 */

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
