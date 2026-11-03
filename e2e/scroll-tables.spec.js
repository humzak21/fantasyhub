import { test, expect } from '@playwright/test';

import { openLeague } from './fixtures/liveWeek.js';

/**
 * A league table below `md`: vertical space for the overview, horizontal for the
 * details.
 *
 * Height, pinning and which layout is showing are all layout, which jsdom does
 * not have, so the promise is held here. See `fixtures/liveWeek.js` for the
 * league.
 */

const VIEWER = 'Lena Live';
const TEAM = 'Live Leaders';

const scrollTable = (page) => page.locator('[data-layout="scroll"] table').first();

const pageOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('the power rankings', () => {
  test.beforeEach(async ({ page }) => {
    await openLeague(page, '/rankings', VIEWER);
  });

  test('give a phone one short row per team', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the scroll layout is below md');

    const table = scrollTable(page);
    await expect(table).toBeVisible();
    await expect(page.locator('[data-layout="wide"] table')).toBeHidden();

    const rows = await table.locator('tbody tr').all();
    expect(rows.length).toBe(6);
    for (const row of rows) {
      expect((await row.boundingBox()).height).toBeLessThanOrEqual(41);
    }
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  test('hold the rank in place while the details scroll', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the scroll layout is below md');

    const table = scrollTable(page);
    await expect(table).toBeVisible();

    const rank = table.locator('tbody tr').first().locator('td').first();
    const name = table.locator('tbody tr').first().locator('td').nth(1);
    const before = { rank: await rank.boundingBox(), name: await name.boundingBox() };

    await table.locator('xpath=ancestor::*[@role="region"]').evaluate((el) => {
      el.scrollLeft = 300;
    });

    expect((await rank.boundingBox()).x).toBe(before.rank.x);
    expect((await name.boundingBox()).x).toBeLessThan(before.name.x);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  test('show the viewer their row, and it stays opaque under the pinned rank', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the scroll layout is below md');

    const row = scrollTable(page).locator('tr', { hasText: '(your team)' });
    await expect(row).toContainText(TEAM);

    const background = await row
      .locator('td')
      .first()
      .evaluate((cell) => getComputedStyle(cell).backgroundColor);
    expect(background).not.toMatch(/\/ 0\.|, 0\)$|transparent/);
  });

  test('stay a table from md', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the wide layout is from md');

    await expect(page.locator('[data-layout="wide"] table')).toBeVisible();
    await expect(scrollTable(page)).toBeHidden();
  });
});
