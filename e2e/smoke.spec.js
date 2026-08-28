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
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 640, 'drawer nav is below sm only')

  test('opens, lists destinations, and navigates', async ({ page }) => {
    await page.goto('/rankings', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#root')).not.toBeEmpty()

    await page.getByRole('button', { name: /open navigation/i }).click()

    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()

    // Painted, not transparent — the failure mode when a menu's background
    // token generates nothing.
    const bg = await drawer.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')

    // It has to fit the screen it opened on.
    const box = await drawer.boundingBox()
    expect(box.width).toBeLessThanOrEqual(page.viewportSize().width + 1)

    await drawer.getByRole('button', { name: 'Statistics' }).click()
    await expect(page).toHaveURL(/\/statistics$/)
  })
})
