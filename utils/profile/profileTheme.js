/**
 * The accent a member can choose for their profile.
 *
 * A hue, never a colour. The palette's lightness and chroma stay fixed (see
 * "The look" in CLAUDE.md), so every choice reads on black and sits in the same
 * family as the rest of the app. The column is a number with a range, so it
 * can only ever be spliced into `oklch()` here.
 */

export const ACCENT_LIGHTNESS = 0.72;
export const ACCENT_CHROMA = 0.15;

/** The swatches offered, in wheel order. */
export const ACCENT_HUES = [20, 45, 85, 130, 160, 200, 240, 262, 300, 350];

export const BIO_MAX = 500;

/** The chosen accent as a CSS colour, or null to use the team's own. */
export function accentColor(hue) {
  return Number.isFinite(hue) ? `oklch(${ACCENT_LIGHTNESS} ${ACCENT_CHROMA} ${hue})` : null;
}
