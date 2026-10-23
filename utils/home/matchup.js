/**
 * The home page's matchup hero, decided.
 *
 * Pure, over the season's `games` (the shell already holds them) and the
 * result of `summarizeMatchup`. The component renders what these return and
 * nothing else — the decide/execute split the grader and the game mapper use.
 */

import { deriveWeekStart } from '../seasonConfig.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * Where the season is, for the page as a whole.
 *
 * - `loading`   no season config yet, or no start date — nothing may fetch
 * - `preseason` week 1 has not begun
 * - `complete`  the season has been finalised (`seasons.is_completed`)
 * - `active`    everything else
 *
 * `useActualWeek()` answers 1 before week 1 as well as during it, so it cannot
 * tell the preseason apart from the first week; the start instant can.
 *
 * @param {Object|null} config - a `SeasonConfig`
 * @param {Object|null} season - the season row
 * @param {Date} [now]
 */
export function seasonPhase(config, season, now = new Date()) {
  if (!config?.startDate) return 'loading';
  if (season?.isCompleted || season?.is_completed) return 'complete';
  if (now.getTime() < deriveWeekStart(config, 1).getTime()) return 'preseason';
  return 'active';
}

/** Whole days from `now` until week 1 begins, never negative. */
export function daysUntilStart(config, now = new Date()) {
  if (!config?.startDate) return null;
  const ms = deriveWeekStart(config, 1).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / MS_PER_DAY));
}

/**
 * A team's game in a week.
 *
 * A postseason bye is a `games` row of type `bye` (from 2026), with the team in
 * `team1Id`; it is a bye, not an opponent. No row at all is also a bye from the
 * reader's point of view — a team knocked out of the bracket and given no
 * consolation game has nobody to play — and is reported the same way, with
 * `game: null`.
 *
 * @param {Array<Object>} games - the season's games
 * @param {string} teamId
 * @param {number} week
 * @returns {{ game: Object, side: 1|2, opponentId: string } | { bye: true, game: Object|null }}
 */
export function findMatchup(games, teamId, week) {
  const game = (games || []).find(
    (g) => g.week === week && (sameId(g.team1Id, teamId) || sameId(g.team2Id, teamId))
  );

  if (!game) return { bye: true, game: null };
  if (game.type === 'bye' || game.team2Id == null) return { bye: true, game };

  const side = sameId(game.team1Id, teamId) ? 1 : 2;
  return { game, side, opponentId: side === 1 ? game.team2Id : game.team1Id };
}

/**
 * The next real game after `week`, for a bye week's "next up" line.
 *
 * @returns {{ game: Object, side: 1|2, opponentId: string, week: number } | null}
 */
export function nextMatchup(games, teamId, week) {
  const later = [...new Set((games || []).map((g) => g.week))]
    .filter((w) => w > week)
    .sort((a, b) => a - b);

  for (const w of later) {
    const found = findMatchup(games, teamId, w);
    if (!found.bye) return { ...found, week: w };
  }
  return null;
}

/**
 * The matchup from the viewer's side: their score first. `null` for a score
 * that has not been imported — never 0, which would read as a result.
 */
export function orientScores(game, side) {
  const own = side === 1 ? game?.team1Score : game?.team2Score;
  const other = side === 1 ? game?.team2Score : game?.team1Score;
  const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
  return { own: num(own), opponent: num(other) };
}

/**
 * One sentence for the all-time series, viewer first.
 *
 * `summary` is `summarizeMatchup` over rows oriented so the viewer's franchise
 * is franchise 1 — `sides[0]` is the viewer.
 *
 * @returns {null | {
 *   headline: string,
 *   standing: 'lead'|'trail'|'level',
 *   record: string,
 *   phases: Array<{ label: string, record: string }>,
 *   streak: string | null
 * }}
 */
export function describeSeries(summary) {
  if (!summary) return null;
  const [you, them] = summary.sides;

  const record = formatWlt(you);
  const standing = you.wins > them.wins ? 'lead' : you.wins < them.wins ? 'trail' : 'level';
  const headline =
    standing === 'lead'
      ? `You lead the series ${record}`
      : standing === 'trail'
        ? `You trail the series ${record}`
        : `The series is level at ${record}`;

  const phases = [
    { key: 'regular', label: 'Regular season' },
    { key: 'playoff', label: 'Playoffs' },
    { key: 'consolation', label: 'Consolation' }
  ]
    .filter(({ key }) => summary.phases[key] > 0)
    .map(({ key, label }) => ({ label, record: formatWlt(you.byPhase[key]) }));

  let streak = null;
  if (summary.currentStreak) {
    const { side, length } = summary.currentStreak;
    const games = length === 1 ? 'the last meeting' : `the last ${length}`;
    streak = side === 0 ? `You've won ${games}` : `You've lost ${games}`;
  }

  return { headline, standing, record, phases, streak };
}

function formatWlt({ wins = 0, losses = 0, ties = 0 } = {}) {
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

/** W, L or T for the viewer (franchise 1) in one oriented meeting. */
export function meetingResult(game) {
  if (game.team1Score > game.team2Score) return 'W';
  if (game.team1Score < game.team2Score) return 'L';
  return 'T';
}

/**
 * Where the matchup stands, in one line under the scoreline.
 *
 * - `Final` once the game is completed: "Won by 12.40" / "Lost by 3.10".
 * - `In progress` while any starter's actual is in.
 * - `Projected` before that.
 *
 * The margin is to the hundredth only for a final, which is a result; a
 * projection reads to one decimal like every other projection. `share` is the
 * viewer's part of the combined total (0-100), for the tug-of-war bar; null
 * when either side is unknown.
 *
 * @param {{ completed?: boolean, own: number|null, opponent: number|null, anyActual?: boolean }} input
 * @returns {{ phase: 'Final'|'In progress'|'Projected', lead: number|null, text: string|null, share: number|null }}
 */
export function matchupStatus({ completed = false, own, opponent, anyActual = false }) {
  const phase = completed ? 'Final' : anyActual ? 'In progress' : 'Projected';
  const known = Number.isFinite(own) && Number.isFinite(opponent);
  if (!known) return { phase, lead: null, text: null, share: null };

  const lead = own - opponent;
  const total = own + opponent;
  const share = total > 0 ? (own / total) * 100 : 50;
  const amount = Math.abs(lead).toFixed(completed ? 2 : 1);

  let text;
  if (lead === 0) text = completed ? 'Tied' : 'Dead level';
  else if (completed) text = `${lead > 0 ? 'Won' : 'Lost'} by ${amount}`;
  else text = `You ${lead > 0 ? 'lead' : 'trail'} by ${amount}`;

  return { phase, lead, text, share };
}
