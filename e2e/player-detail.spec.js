import { test, expect } from '@playwright/test';

import { openLeague } from './fixtures/liveWeek.js';

/**
 * A player's name opens his page, and the page goes away the way a page does.
 *
 * The unit tests hold the shell's states and the URL arithmetic; jsdom cannot
 * say whether the page fits a phone, or whether the browser's own Back closes
 * it. This walks the real thing at both widths: from a Schedule lineup, the
 * way most members will arrive. See `fixtures/liveWeek.js` for the league
 * (Rex Runner is the Live Leaders' starter, with six weeks over two seasons).
 */

const PLAYER = 'Rex Runner';

async function expectNoOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

async function openPlayer(page) {
  await openLeague(page, '/schedule', 'Lena Live');
  const card = page.locator('.rounded-xl', { hasText: 'Live Leaders' }).last();
  await card.getByRole('button', { name: 'Lineups' }).click();
  await card.getByRole('button', { name: PLAYER }).first().click();

  const dialog = page.getByRole('dialog', { name: PLAYER });
  await expect(dialog).toBeVisible();
  return dialog;
}

const isPhone = (page) => page.viewportSize().width < 768;

test('a lineup name opens the player page, and it fits', async ({ page }, testInfo) => {
  const dialog = await openPlayer(page);

  expect(new URL(page.url()).searchParams.get('player')).toBe('00000000-0000-4000-8000-000000000030');
  for (const label of ['OG Jits PPG', 'League start %', 'Games played', 'Total points', 'Best week', 'Seasons']) {
    await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible();
  }
  // Six weeks over two seasons; 31.4 is his best.
  await expect(dialog).toContainText('31.4');
  await expectNoOverflow(page);

  await testInfo.attach(`player-detail-${testInfo.project.name}.png`, {
    body: await page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' }),
    contentType: 'image/png'
  });
  await page.screenshot({ path: testInfo.outputPath(`player-detail-${testInfo.project.name}.png`), animations: 'disabled' });
});

test('its chunk is fetched on the first open, not on load', async ({ page }) => {
  const chunks = [];
  page.on('request', (request) => {
    if (/\/assets\/PlayerDetail-[^/]*\.js$/.test(new URL(request.url()).pathname)) chunks.push(request.url());
  });

  await openLeague(page, '/schedule', 'Lena Live');
  await expect(page.getByText('Live Leaders').first()).toBeVisible();
  expect(chunks).toEqual([]);

  const card = page.locator('.rounded-xl', { hasText: 'Live Leaders' }).last();
  await card.getByRole('button', { name: 'Lineups' }).click();
  await card.getByRole('button', { name: PLAYER }).first().click();
  await expect(page.getByRole('dialog', { name: PLAYER })).toBeVisible();
  expect(chunks).toHaveLength(1);
});

test('Back or the X closes it and drops the param', async ({ page }) => {
  const dialog = await openPlayer(page);

  await dialog.getByRole('button', { name: isPhone(page) ? 'Back' : 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).searchParams.has('player')).toBe(false);
  expect(new URL(page.url()).pathname).toBe('/schedule');
});

test("the browser's back button closes it", async ({ page }) => {
  const dialog = await openPlayer(page);

  await page.goBack();
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).searchParams.has('player')).toBe(false);
  expect(new URL(page.url()).pathname).toBe('/schedule');
});
