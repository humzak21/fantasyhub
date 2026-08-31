import { test, expect } from '@playwright/test'

/**
 * Every tab is a route now, so every tab is reachable from here.
 *
 * `/history` and `/awards` are access-gated and redirect a signed-out viewer
 * to `/rankings`; that is correct behaviour, not a failure, so the assertions
 * below are about layout and about the page not being broken — never about
 * which URL you ended up on.
 */
const ROUTES = [
  '/',
  '/rankings',
  '/statistics',
  '/schedule',
  '/teams',
  '/pickems',
  '/takes',
  '/playoffs',
  '/settings',
]

test.describe('smoke', () => {
  for (const route of ROUTES) {
    test(`${route} loads without horizontal overflow`, async ({ page }, testInfo) => {
      const consoleErrors = []
      page.on('pageerror', (err) => consoleErrors.push(String(err)))

      await page.goto(route, { waitUntil: 'domcontentloaded' })

      // The shell renders behind an auth gate and then a per-tab Suspense
      // boundary; wait for something real rather than for a fixed delay.
      // Not `networkidle` — the app polls, so idle may never arrive, and
      // waiting for it took this suite from seconds to minutes.
      // Not every route renders a <header>/<main> — the settings page is plain
      // divs — so wait on the root having painted something instead.
      await expect(page.locator('#root')).not.toBeEmpty()
      await page.waitForFunction(() => document.querySelector('#root')?.clientHeight > 100)

      /*
       * The app rendered, not the error boundary.
       *
       * Without this, every assertion below is satisfied by the crash page:
       * it fills #root, it is taller than 100px, and it does not overflow.
       * That is not hypothetical — this suite ran green in CI against
       * "Something went wrong" on every route, because the environment had
       * no Supabase config and the shell rendered an Error object as a React
       * child. A smoke test that passes on a crashed app is worse than none:
       * it reports that the thing it is watching is fine.
       */
      await expect(
        page.getByText('Something went wrong'),
        `${route} rendered the error boundary instead of the page`
      ).toHaveCount(0)

      // Screenshot before asserting. It is the artifact you actually want when
      // one of the assertions below fails, and taking it afterwards means you
      // never get it for exactly the runs that needed it.
      await testInfo.attach(`${testInfo.project.name}${route.replace(/\//g, '_') || '_root'}.png`, {
        // `animations: 'disabled'` is required, not cosmetic: several elements
        // animate forever (the awards glow, skeleton pulses), and a fullPage
        // screenshot waits for a stability that never arrives.
        body: await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }),
        contentType: 'image/png',
      })

      /*
       * The one assertion that would have caught most of this backlog.
       *
       * It is only meaningful because the root `overflow-x: hidden` is gone:
       * with it in place the document could never report a scrollWidth wider
       * than its clientWidth, so every fixed-width element in the app — the
       * 632px Pick'Ems row, the 760px week strip, the unreachable first
       * playoff round — was invisible to any measurement like this one, and to
       * the reader.
       */
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

      expect(
        scrollWidth,
        `${route} overflows its viewport by ${scrollWidth - clientWidth}px`
      ).toBeLessThanOrEqual(clientWidth + 1)

      expect(consoleErrors, `${route} threw during render`).toEqual([])
    })
  }

  test('an unknown tab falls back to the default one', async ({ page }) => {
    await page.goto('/not-a-real-tab', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/rankings$/)
  })
})

/*
 * The nav is the one thing on a phone that must work before anything else can
 * be reached, and it is also the component with the longest history of being
 * broken here: a panel positioned against a transformed <body>, then a panel
 * made untouchable by `touch-action: none` on <body>, then a dropdown with
 * eight destinations in a 192px popover. It gets its own test.
 */
test.describe('phone navigation', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'the tab bar is below lg only')

  test('every destination is reachable from the tab bar', async ({ page }) => {
    await page.goto('/rankings', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#root')).not.toBeEmpty()

    const bar = page.getByRole('navigation', { name: 'Main' }).last()
    await expect(bar).toBeVisible()

    // Every tab carries a visible label. The tier this replaces delivered them
    // through the `title` attribute, which does not exist on touch at all.
    await expect(bar.getByRole('link', { name: 'Statistics' })).toBeVisible()

    // The bar scrolls rather than hiding destinations behind a "More" sheet,
    // so a link may start out beyond the fold; Playwright scrolls it into the
    // scroller before clicking.
    await bar.getByRole('link', { name: 'Statistics' }).click()
    await expect(page).toHaveURL(/\/statistics$/)

    // It is a real link, so it has an href — cmd-click and "open in new tab"
    // work, which they did not when these were buttons calling navigate().
    await expect(bar.getByRole('link', { name: 'Schedule' })).toHaveAttribute('href', '/schedule')
  })

  test('the tab bar does not cover the end of the page', async ({ page }) => {
    await page.goto('/rankings', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#root')).not.toBeEmpty()

    const bar = page.getByRole('navigation', { name: 'Main' }).last()
    const barBox = await bar.boundingBox()
    const vh = page.viewportSize().height

    // Pinned to the bottom edge, full width, and no wider than the screen.
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(vh + 1)
    expect(barBox.width).toBeLessThanOrEqual(page.viewportSize().width + 1)

    // The page reserves room for it, so the last row of content is not stuck
    // underneath the bar.
    //
    // Asserted against main's padding rather than by scrolling to the bottom
    // and measuring: the page is still fetching while this runs, so its height
    // changes under a scroll-then-measure, which made that version flaky. The
    // padding is the mechanism, and comparing it to the bar's real height is
    // what "reserves room" actually means.
    const paddingBottom = await page
      .locator('main')
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))
    expect(paddingBottom).toBeGreaterThanOrEqual(barBox.height)
  })

  test('the standings sheet opens and fits the screen', async ({ page }) => {
    await page.goto('/rankings', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#root')).not.toBeEmpty()

    // Standings only exist when a season does, and the smoke job runs against
    // whatever data the environment happens to have — locally the real league,
    // in CI possibly none. Skipping when the control is absent keeps this test
    // about the sheet's behaviour instead of about the fixture; the tab-bar
    // tests above cover the seasonless case.
    const trigger = page.getByRole('button', { name: /open standings/i })
    const hasSeason = await trigger
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasSeason, 'no active season in this environment')

    await trigger.click()

    // A real dialog now — the panel this replaces rendered no backdrop, had no
    // role, and could not be closed by clicking away or pressing Escape.
    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()

    const box = await panel.boundingBox()
    const vw = page.viewportSize().width
    expect(box.x).toBeGreaterThanOrEqual(-1)
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 1)

    // …and the standings inside it are showing the card layout, not the
    // table. ResponsiveDataTable emits both and lets CSS choose, so the check
    // is visibility, not presence — `toHaveCount(0)` would be asserting the
    // wrong thing about how that component works.
    await expect(panel.locator('table').first()).toBeHidden()

    await page.keyboard.press('Escape')
    await expect(panel).not.toBeVisible()
  })
})
