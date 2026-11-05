/**
 * The player page's small pure helpers, shared by its sections.
 */

import { getMaskedFranchiseName } from '../../history/utils/privacyHelpers';
import { EMPTY, formatPoints } from '../../../utils/format';

/** The standard lit surface every section card carries. */
export const SURFACE = 'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]';

/** Rank heat by `rankTier` (which fifth of the position's pool), as the week view draws it. */
export const RANK_HEAT = [
  'bg-success/25 text-success',
  'bg-success/10 text-success',
  'bg-muted text-foreground',
  'bg-warning/15 text-warning',
  'bg-destructive/15 text-destructive'
];

/** A franchise ref as this viewer may see it. */
export function maskFranchise(franchise, viewer) {
  if (!franchise) return null;
  return getMaskedFranchiseName(franchise, viewer?.user ?? null, viewer?.isAdmin ?? false, viewer?.teamOwnerNames ?? []);
}

/** A stat count: whole numbers bare and grouped, anything else to one decimal. */
export function formatCount(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return EMPTY;
  const n = Number(value);
  return Number.isInteger(n) ? n.toLocaleString('en-US') : formatPoints(n, 1);
}

/** "1 game", "3 games". */
export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

/** "Week 3" or "Weeks 3–11". */
export function weekSpan(from, to) {
  if (from == null) return null;
  return from === to || to == null ? `Week ${from}` : `Weeks ${from}–${to}`;
}

/** "2021–2026", or one year alone. */
export function yearSpan(first, last) {
  if (first == null) return null;
  return first === last || last == null ? String(first) : `${first}–${last}`;
}

/** The text colour of a W / L / T. */
export function resultTone(result) {
  if (result === 'W') return 'text-success';
  if (result === 'L') return 'text-destructive';
  return 'text-muted-foreground';
}

/** The seasons a section shows: the picked one, or every one. */
export function seasonsInView(profile, season) {
  return season ? [season] : profile?.seasons ?? [];
}

/** The floor `rankCareers` qualifies at, when the ranking has not said. */
const DEFAULT_MIN_GAMES = 5;

/**
 * The rank line under the PPG: "RB7 of 48", "Not yet ranked · 3 of 5 games",
 * or why there is none. The ranking is its own query (a league-wide view), so
 * it loads and fails on its own, and the rest of the page does not wait.
 */
export function rankLine({ entry, ranking, rankingQuery, gamesPlayed }) {
  if (rankingQuery?.isError) return 'League ranks unavailable';
  if (!ranking) return null;
  const minGames = ranking.minGames ?? DEFAULT_MIN_GAMES;
  if (entry?.qualified && entry.rank != null) return `${entry.position}${entry.rank} of ${entry.of}`;
  const games = entry?.gamesPlayed ?? gamesPlayed ?? 0;
  return `Not yet ranked · ${Math.min(games, minGames)} of ${minGames} games`;
}


/** The season picker's value for every season at once. */
export const ALL_SEASONS = 'all';

/**
 * "Weeks 1–17 · 14 games · rostered by 2 franchises": what the span in view
 * covers. Weeks are the ones he was rostered, games the ones he appeared in.
 */
export function seasonCaption(profile, season) {
  if (season) {
    const weeks = season.weeks.map((w) => w.week);
    const franchises = new Set(season.weeks.map((w) => w.franchiseId).filter(Boolean)).size;
    const parts = [];
    if (weeks.length) {
      const first = Math.min(...weeks);
      const last = Math.max(...weeks);
      parts.push(first === last ? `Week ${first}` : `Weeks ${first}–${last}`);
    }
    parts.push(plural(season.totals?.gamesPlayed ?? 0, 'game'));
    if (franchises) parts.push(`rostered by ${plural(franchises, 'franchise')}`);
    return parts.join(' · ');
  }
  const career = profile.career ?? {};
  const parts = [yearSpan(career.firstYear, career.lastYear), plural(career.gamesPlayed ?? 0, 'game')];
  if (career.franchisesCount) parts.push(`rostered by ${plural(career.franchisesCount, 'franchise')}`);
  return parts.filter(Boolean).join(' · ');
}


/** "3 straight weeks above his average", or null with no streak. */
export function streakSentence(streak) {
  if (!streak) return null;
  if (streak.length === 1) return `His latest week was ${streak.kind} his average`;
  return `${streak.length} straight weeks ${streak.kind} his average`;
}

/** "Beat his projections by 18.4 points over 9 weeks". */
export function projectionSentence(delta, weeks) {
  if (delta == null || !weeks) return 'No projections stored for these weeks';
  const span = plural(weeks, 'week');
  if (Math.abs(delta) < 0.05) return `Matched his projections over ${span}`;
  return delta > 0
    ? `Beat his projections by ${formatPoints(delta)} points over ${span}`
    : `Fell short of his projections by ${formatPoints(-delta)} points over ${span}`;
}

/**
 * The rank axis's ticks, always from #1. Recharts' own choice over a reversed
 * [1, worst] domain left #1 unlabelled, which is the one rank a reader looks
 * for.
 */
export function rankTicks(worst) {
  const top = Math.max(worst, 2);
  const step = Math.max(1, Math.ceil((top - 1) / 4));
  const ticks = [];
  // Stop short of the bottom when the last step would crowd its label.
  for (let v = 1; top - v >= step / 2; v += step) ticks.push(v);
  ticks.push(top);
  return ticks;
}
