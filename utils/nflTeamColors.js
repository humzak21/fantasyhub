/**
 * A text colour for each NFL team, close to the team's own and readable on
 * the app's near-black surfaces.
 *
 * Declared in oklch, as the palette is (see "The look" in CLAUDE.md), so the
 * lightness is perceptual. A team's real primary is often too dark to read on
 * black — Dallas and New England are navy, Washington burgundy — so each is
 * its identity hue lifted to a readable lightness rather than the brand hex.
 * Golds sit brighter than the rest, because a yellow at the palette's usual
 * 0.72 reads as olive. Several teams share a hue family (the reds, the royal
 * blues); the abbreviation beside the colour carries the identity, the colour
 * only makes it quicker to find.
 *
 * `[lightness, chroma, hue]`.
 */
const TEAM_OKLCH = {
  ARI: [0.68, 0.17, 22],
  ATL: [0.68, 0.18, 27],
  BAL: [0.66, 0.16, 300],
  BUF: [0.68, 0.16, 262],
  CAR: [0.76, 0.11, 228],
  CHI: [0.72, 0.16, 50],
  CIN: [0.72, 0.18, 48],
  CLE: [0.66, 0.1, 55],
  DAL: [0.74, 0.07, 250],
  DEN: [0.72, 0.17, 45],
  DET: [0.74, 0.12, 235],
  GB: [0.72, 0.14, 150],
  HOU: [0.66, 0.17, 20],
  IND: [0.7, 0.13, 258],
  JAX: [0.74, 0.1, 195],
  KC: [0.66, 0.19, 27],
  LAC: [0.78, 0.1, 230],
  LAR: [0.7, 0.15, 262],
  LV: [0.82, 0, 0],
  MIA: [0.76, 0.11, 195],
  MIN: [0.66, 0.16, 300],
  NE: [0.68, 0.1, 255],
  NO: [0.8, 0.08, 85],
  NYG: [0.66, 0.15, 262],
  NYJ: [0.72, 0.14, 160],
  PHI: [0.68, 0.08, 190],
  PIT: [0.84, 0.16, 90],
  SEA: [0.78, 0.17, 135],
  SF: [0.66, 0.18, 27],
  TB: [0.66, 0.18, 22],
  TEN: [0.76, 0.11, 235],
  WAS: [0.64, 0.14, 12]
};

/** Spellings other ESPN views and older rows use. */
const ALIASES = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR', OAK: 'LV' };

/**
 * The team's text colour as a CSS colour string, or null for no team (a free
 * agent) or one this map does not know — the caller then keeps its default.
 */
export function nflTeamColor(abbreviation) {
  if (!abbreviation) return null;
  const key = String(abbreviation).toUpperCase();
  const oklch = TEAM_OKLCH[ALIASES[key] ?? key];
  return oklch ? `oklch(${oklch[0]} ${oklch[1]} ${oklch[2]})` : null;
}

export const NFL_TEAM_ABBREVIATIONS = Object.keys(TEAM_OKLCH);
