/**
 * Whether this bundle is a pull request's preview, and which one.
 *
 * `.github/workflows/preview-site.yml` builds every PR with `VITE_PREVIEW_PR`
 * set to its number and uploads it to `pr-<number>.ogjits.pages.dev`. The
 * production build leaves it unset, so everything here is null there.
 *
 * A preview talks to the live database: a pick or a take made on it is real.
 * That is what `PreviewBanner` says, and why the notifications offer stays
 * away (a preview is a second origin, and a push subscription belongs to one).
 */

const raw = String(import.meta.env?.VITE_PREVIEW_PR ?? '').trim();

/** The PR number as a string, or null outside a preview build. */
export const PREVIEW_PR = /^\d+$/.test(raw) ? raw : null;

/** The PR's page on GitHub, or null outside a preview build. */
export const PREVIEW_PR_URL = PREVIEW_PR ? `https://github.com/humzak21/fantasyhub/pull/${PREVIEW_PR}` : null;
