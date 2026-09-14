/**
 * Every record the Records tab shows, in the order it shows them.
 *
 * Pure data. The numbers come from `utils/recordBook` (`data` names the row
 * set); this file decides what each record is called, which end of the scale
 * leads, and how its value reads. One row set often serves two records — most
 * and fewest points are the same rows ranked from opposite ends — which is why
 * a direction lives here and not in the engine.
 *
 * Opposites sit next to each other, grouped by subject, rather than split into
 * "best" and "dubious": the fewest points ever scored is most interesting read
 * beside the most.
 *
 * Fields:
 *   scope      'career' (All-Time tab) | 'season' (Single Season tab)
 *   section    see SECTIONS
 *   data       the row set in the record book
 *   direction  'desc' (default) or 'asc'
 *   format     how the value reads; see `formatRecordValue`
 *   kind       how a row is identified; see RecordCard
 *   phases     game records: offer the regular-season / playoffs toggle
 *   note       a caveat shown under the blurb, for a record the data is
 *              known to distort
 *   hideZero   drop zero values; defaults on for counts ranked high-to-low,
 *              where zero means "never"
 */

import { SCORE_DECIMALS, formatDelta, formatPct, formatScore } from '../../../utils/format';

export const SECTIONS = [
  { id: 'winning', label: 'Winning' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'games', label: 'Single games' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'luck', label: 'Schedule & luck' },
  { id: 'lineups', label: 'Lineups' },
  { id: 'streaks', label: 'Streaks' },
  { id: 'transactions', label: 'Transactions' }
];

const LINEUP_NOTE = 'Built from ESPN lineups, back to 2020.';
const COMMISSIONER_TRADES_NOTE =
  "The commissioner's count is inflated: trades the commissioner executes for other managers go through the commissioner's own account.";

const career = (entry) => ({ scope: 'career', kind: 'franchise', direction: 'desc', ...entry });
const season = (entry) => ({ scope: 'season', kind: 'teamSeason', direction: 'desc', ...entry });
const game = (entry) => ({ scope: 'season', kind: 'game', section: 'games', phases: true, direction: 'desc', format: 'points', ...entry });

export const RECORDS = [
  // -------------------------------------------------------------------------
  // All-time
  // -------------------------------------------------------------------------
  career({ id: 'career-wins', section: 'winning', data: 'wins', title: 'Most wins', blurb: 'Regular-season wins.', format: 'int', detail: 'record' }),
  career({ id: 'career-losses', section: 'winning', data: 'losses', title: 'Most losses', blurb: 'Regular-season losses.', format: 'int', detail: 'record' }),
  // All-Time rate records are one list, not a best and a worst: the league has
  // fewer franchises than an opened list shows, so the bottom is already there.
  career({ id: 'career-win-pct', section: 'winning', data: 'winPct', title: 'Win %', blurb: 'Regular season.', format: 'pct', detail: 'record' }),
  career({ id: 'career-all-play-wins', section: 'winning', data: 'allPlayWins', title: 'Most all-play wins', blurb: 'Every week, a win for each team outscored.', format: 'half' }),
  career({ id: 'career-all-play-losses', section: 'winning', data: 'allPlayLosses', title: 'Most all-play losses', blurb: 'Every week, a loss for each team that outscored them.', format: 'half' }),
  career({ id: 'career-blowout-wins', section: 'winning', data: 'blowoutWins', title: 'Most blowout wins', blurb: 'Won by 30 or more.', format: 'int' }),
  career({ id: 'career-blowout-losses', section: 'winning', data: 'blowoutLosses', title: 'Most blowout losses', blurb: 'Lost by 30 or more.', format: 'int' }),
  career({ id: 'career-narrow-wins', section: 'winning', data: 'narrowWins', title: 'Most narrow wins', blurb: 'Won by 5 or fewer.', format: 'int' }),
  career({ id: 'career-narrow-losses', section: 'winning', data: 'narrowLosses', title: 'Most narrow losses', blurb: 'Lost by 5 or fewer. The heartbreakers.', format: 'int' }),
  career({ id: 'career-top-records', section: 'winning', data: 'topRecords', title: 'Best regular-season record', blurb: 'Seasons finished top of the standings.', format: 'int', detail: 'seasons' }),
  career({ id: 'career-top-record-flops', section: 'winning', data: 'topRecordFlops', title: 'Regular-season merchant', blurb: 'Best record in the league, no finals appearance.', format: 'int', detail: 'seasons' }),
  career({ id: 'career-last-places', section: 'winning', data: 'lastPlaces', title: 'Last-place finishes', blurb: 'Finished the season dead last. The punishee.', format: 'int', detail: 'seasons' }),

  career({ id: 'career-points', section: 'scoring', data: 'pointsFor', title: 'Most points', blurb: 'Regular-season points for.', format: 'points', detail: 'seasons' }),
  career({ id: 'career-ppg', section: 'scoring', data: 'ppg', title: 'Points per game', blurb: 'Regular-season points for, per game.', format: 'points', detail: 'seasons' }),
  career({ id: 'career-pa', section: 'scoring', data: 'paPerGame', title: 'Points against per game', blurb: 'Regular-season points scored against them, per game.', format: 'points', detail: 'seasons' }),
  career({ id: 'career-diff', section: 'scoring', data: 'diffPerGame', title: 'Point differential per game', blurb: 'Points for minus points against, per game.', format: 'signed', detail: 'seasons' }),
  career({ id: 'career-weekly-highs', section: 'scoring', data: 'weeklyHighs', title: 'Most weekly high scores', blurb: "Weeks with the league's top score.", format: 'int' }),
  career({ id: 'career-scoring-titles', section: 'scoring', data: 'scoringTitles', title: 'Most scoring titles', blurb: 'Seasons leading the league in points.', format: 'int', detail: 'seasons' }),
  career({ id: 'career-faced-top', section: 'scoring', data: 'facedTop', title: "Most times facing the week's top score", blurb: 'The guy everyone shot at.', format: 'int' }),

  career({ id: 'career-championships', section: 'playoffs', data: 'championships', title: 'Most championships', blurb: 'League titles.', format: 'int', detail: 'seasons' }),
  career({ id: 'career-finals', section: 'playoffs', data: 'finals', title: 'Most finals appearances', blurb: 'Reached the championship game.', format: 'int', detail: 'seasons' }),
  career({ id: 'career-playoff-appearances', section: 'playoffs', data: 'playoffAppearances', title: 'Most playoff appearances', blurb: 'Made the six-team bracket.', format: 'int', detail: 'seasons' }),
  career({ id: 'career-playoff-wins', section: 'playoffs', data: 'playoffWins', title: 'Most playoff wins', blurb: 'Bracket games, placement games included.', format: 'int' }),
  career({ id: 'career-playoff-losses', section: 'playoffs', data: 'playoffLosses', title: 'Most playoff losses', blurb: 'Bracket games, placement games included.', format: 'int' }),
  career({ id: 'career-playoff-points', section: 'playoffs', data: 'playoffPoints', title: 'Most playoff points', blurb: 'Scored in bracket games.', format: 'points' }),

  career({ id: 'career-luck-best', section: 'luck', data: 'luck', title: 'Luckiest career', blurb: 'Wins above what their scoring earned against the whole league.', format: 'wins' }),
  career({ id: 'career-luck-worst', section: 'luck', data: 'luck', direction: 'asc', title: 'Unluckiest career', blurb: 'Wins below what their scoring earned against the whole league.', format: 'wins' }),

  career({ id: 'career-efficiency', section: 'lineups', data: 'lineupEfficiency', title: 'Lineup efficiency', blurb: `Starter points as a share of the best possible lineup. ${LINEUP_NOTE}`, format: 'pct' }),
  career({ id: 'career-perfect-rate', section: 'lineups', data: 'perfectRate', title: 'Perfect-lineup rate', blurb: 'Share of weeks the starters were the best lineup available.', format: 'pct' }),
  career({ id: 'career-bench-points', section: 'lineups', data: 'benchPoints', title: 'Most points left on the bench', blurb: 'Best possible lineup minus the one started. The benchwarmer.', format: 'points' }),
  career({ id: 'career-avoidable-losses', section: 'lineups', data: 'avoidableLosses', title: 'Most avoidable losses', blurb: 'Lost, but the best lineup on the roster would have won.', format: 'int' }),
  career({ id: 'career-short-handed-wins', section: 'lineups', data: 'shortHandedWins', title: 'Most short-handed wins', blurb: 'Won with fewer than nine starters scoring.', format: 'int' }),

  career({ id: 'career-win-streak', section: 'streaks', kind: 'streak', data: 'winStreak', title: 'Longest win streak', blurb: 'Consecutive regular-season wins, across seasons.', format: 'int', unit: 'games' }),
  career({ id: 'career-loss-streak', section: 'streaks', kind: 'streak', data: 'lossStreak', title: 'Longest losing streak', blurb: 'Consecutive regular-season losses, across seasons.', format: 'int', unit: 'games' }),
  career({ id: 'career-high-score-streak', section: 'streaks', kind: 'streak', data: 'highScoreStreak', title: 'Longest high-score streak', blurb: "Consecutive weeks with the league's top score.", format: 'int', unit: 'weeks' }),
  career({ id: 'career-high-score-drought', section: 'streaks', kind: 'streak', data: 'highScoreDrought', title: 'Longest high-score drought', blurb: "Consecutive weeks without the league's top score.", format: 'int', unit: 'weeks' }),
  career({ id: 'career-winning-season-streak', section: 'streaks', kind: 'seasonStreak', data: 'winningSeasonStreak', title: 'Winning-season streak', blurb: 'Consecutive seasons over .500.', format: 'int', unit: 'seasons' }),
  career({ id: 'career-playoff-streak', section: 'streaks', kind: 'seasonStreak', data: 'playoffStreak', title: 'Playoff-appearance streak', blurb: 'Consecutive seasons in the bracket.', format: 'int', unit: 'seasons' }),
  career({ id: 'career-finals-streak', section: 'streaks', kind: 'seasonStreak', data: 'finalsStreak', title: 'Finals-appearance streak', blurb: 'Consecutive championship-game appearances.', format: 'int', unit: 'seasons' }),

  career({ id: 'career-trades', section: 'transactions', data: 'trades', title: 'Most trades', blurb: 'Accepted trades.', note: COMMISSIONER_TRADES_NOTE, format: 'int' }),
  career({ id: 'career-roster-moves', section: 'transactions', data: 'rosterMoves', title: 'Most roster moves', blurb: 'Free-agent adds, waiver claims and drops.', format: 'int' }),
  career({ id: 'career-waiver-claims', section: 'transactions', data: 'waiverClaims', title: 'Most waiver claims', blurb: 'The waiver-wire merchant.', format: 'int' }),
  career({ id: 'career-faab-spent', section: 'transactions', data: 'faabSpent', title: 'Most FAAB spent', blurb: 'Waiver budget spent on winning claims.', format: 'money' }),
  career({ id: 'career-trade-partners', section: 'transactions', kind: 'pair', data: 'tradePartners', title: 'Most frequent trade partners', blurb: 'Trades between the same two franchises.', format: 'int', unit: 'trades' }),

  // -------------------------------------------------------------------------
  // Single season
  // -------------------------------------------------------------------------
  season({ id: 'season-wins', section: 'winning', data: 'wins', title: 'Most wins', blurb: 'In a regular season.', format: 'int', detail: 'record' }),
  season({ id: 'season-losses', section: 'winning', data: 'losses', title: 'Most losses', blurb: 'In a regular season.', format: 'int', detail: 'record' }),
  season({ id: 'season-win-pct-best', section: 'winning', data: 'winPct', title: 'Best win %', blurb: 'In a regular season.', format: 'pct', detail: 'record' }),
  season({ id: 'season-win-pct-worst', section: 'winning', data: 'winPct', direction: 'asc', title: 'Worst win %', blurb: 'In a regular season.', format: 'pct', detail: 'record' }),
  season({ id: 'season-all-play-wins', section: 'winning', data: 'allPlayWins', title: 'Most all-play wins', blurb: 'Every week, a win for each team outscored.', format: 'half' }),
  season({ id: 'season-all-play-losses', section: 'winning', data: 'allPlayLosses', title: 'Most all-play losses', blurb: 'Every week, a loss for each team that outscored them.', format: 'half' }),
  season({ id: 'season-blowout-wins', section: 'winning', data: 'blowoutWins', title: 'Most blowout wins', blurb: 'Won by 30 or more.', format: 'int' }),
  season({ id: 'season-blowout-losses', section: 'winning', data: 'blowoutLosses', title: 'Most blowout losses', blurb: 'Lost by 30 or more.', format: 'int' }),
  season({ id: 'season-narrow-wins', section: 'winning', data: 'narrowWins', title: 'Most narrow wins', blurb: 'Won by 5 or fewer.', format: 'int' }),
  season({ id: 'season-narrow-losses', section: 'winning', data: 'narrowLosses', title: 'Most narrow losses', blurb: 'Lost by 5 or fewer.', format: 'int' }),

  season({ id: 'season-points-most', section: 'scoring', data: 'pointsFor', title: 'Most points', blurb: 'Regular-season points for.', format: 'points', detail: 'record' }),
  season({ id: 'season-points-fewest', section: 'scoring', data: 'pointsFor', direction: 'asc', title: 'Fewest points', blurb: 'Regular-season points for.', format: 'points', detail: 'record' }),
  season({ id: 'season-pa-most', section: 'scoring', data: 'pointsAgainst', title: 'Most points against', blurb: 'Swiss cheese defence.', format: 'points', detail: 'record' }),
  season({ id: 'season-pa-fewest', section: 'scoring', data: 'pointsAgainst', direction: 'asc', title: 'Fewest points against', blurb: 'The survivors.', format: 'points', detail: 'record' }),
  season({ id: 'season-diff-best', section: 'scoring', data: 'pointDiff', title: 'Best point differential', blurb: 'Points for minus points against.', format: 'signed', detail: 'record' }),
  season({ id: 'season-diff-worst', section: 'scoring', data: 'pointDiff', direction: 'asc', title: 'Worst point differential', blurb: 'Points for minus points against.', format: 'signed', detail: 'record' }),
  season({ id: 'season-weekly-highs', section: 'scoring', data: 'weeklyHighs', title: 'Most weekly high scores', blurb: "Weeks with the league's top score.", format: 'int' }),
  season({ id: 'season-faced-top', section: 'scoring', data: 'facedTop', title: "Most times facing the week's top score", blurb: 'The guy everyone shot at.', format: 'int' }),
  season({ id: 'season-consistent-most', section: 'scoring', data: 'consistency', direction: 'asc', title: 'Most consistent', blurb: 'Lowest standard deviation of weekly scores.', format: 'points', unit: 'σ' }),
  season({ id: 'season-consistent-least', section: 'scoring', data: 'consistency', title: 'Least consistent', blurb: 'Highest standard deviation of weekly scores.', format: 'points', unit: 'σ' }),
  season({ id: 'season-points-missed-playoffs', section: 'scoring', data: 'pointsMissedPlayoffs', title: "Most points, missed the playoffs", blurb: "Should've been good.", format: 'points', detail: 'record' }),

  game({ id: 'game-high-score', data: 'score', title: 'Highest score', blurb: 'One team, one game.' }),
  game({ id: 'game-low-score', data: 'score', direction: 'asc', title: 'Lowest score', blurb: 'One team, one game.' }),
  game({ id: 'game-blowout', data: 'winMargin', title: 'Biggest blowout', blurb: 'Largest margin of victory.', detail: 'score' }),
  game({ id: 'game-narrowest', data: 'winMargin', direction: 'asc', title: 'Narrowest win', blurb: 'Smallest margin of victory. Ties excluded.', detail: 'score' }),
  game({ id: 'game-high-combined', data: 'combined', title: 'Highest-scoring game', blurb: 'Both teams combined.', detail: 'score' }),
  game({ id: 'game-low-combined', data: 'combined', direction: 'asc', title: 'Lowest-scoring game', blurb: 'Both teams combined.', detail: 'score' }),
  game({ id: 'game-high-loss', data: 'losingScore', title: 'Highest score in a loss', blurb: 'Scored big and lost anyway.', detail: 'score' }),
  game({ id: 'game-low-win', data: 'winningScore', direction: 'asc', title: 'Lowest score in a win', blurb: 'Won ugly.', detail: 'score' }),

  season({ id: 'season-playoff-wins', section: 'playoffs', data: 'playoffWins', title: 'Most playoff wins', blurb: 'Bracket games, placement games included.', format: 'int' }),
  season({ id: 'season-playoff-losses', section: 'playoffs', data: 'playoffLosses', title: 'Most playoff losses', blurb: 'Bracket games, placement games included.', format: 'int' }),
  season({ id: 'season-playoff-points', section: 'playoffs', data: 'playoffPoints', title: 'Most playoff points', blurb: 'Scored in bracket games.', format: 'points' }),

  season({ id: 'season-schedule-toughest', section: 'luck', data: 'schedule', title: 'Toughest schedule', blurb: "Opponents' average points per game.", format: 'points', unit: 'opp ppg' }),
  season({ id: 'season-schedule-easiest', section: 'luck', data: 'schedule', direction: 'asc', title: 'Easiest schedule', blurb: "Opponents' average points per game.", format: 'points', unit: 'opp ppg' }),
  season({ id: 'season-luck-best', section: 'luck', data: 'luck', title: 'Luckiest season', blurb: 'Wins above what their scoring earned against the whole league.', format: 'wins', detail: 'record' }),
  season({ id: 'season-luck-worst', section: 'luck', data: 'luck', direction: 'asc', title: 'Unluckiest season', blurb: 'Wins below what their scoring earned against the whole league.', format: 'wins', detail: 'record' }),

  season({ id: 'season-efficiency-best', section: 'lineups', data: 'lineupEfficiency', title: 'Best lineup efficiency', blurb: `Starter points as a share of the best possible lineup. ${LINEUP_NOTE}`, format: 'pct' }),
  season({ id: 'season-efficiency-worst', section: 'lineups', data: 'lineupEfficiency', direction: 'asc', title: 'Worst lineup efficiency', blurb: `Starter points as a share of the best possible lineup. ${LINEUP_NOTE}`, format: 'pct' }),
  season({ id: 'season-perfect-rate', section: 'lineups', data: 'perfectRate', title: 'Perfect-lineup rate', blurb: 'Share of weeks the starters were the best lineup available.', format: 'pct' }),
  season({ id: 'season-bench-points', section: 'lineups', data: 'benchPoints', title: 'Most points left on the bench', blurb: 'Best possible lineup minus the one started.', format: 'points' }),
  season({ id: 'season-avoidable-losses', section: 'lineups', data: 'avoidableLosses', title: 'Most avoidable losses', blurb: 'Lost, but the best lineup on the roster would have won.', format: 'int' }),
  season({ id: 'season-short-handed-wins', section: 'lineups', data: 'shortHandedWins', title: 'Most short-handed wins', blurb: 'Won with fewer than nine starters scoring.', format: 'int' }),

  season({ id: 'season-win-streak', section: 'streaks', kind: 'streak', data: 'winStreak', title: 'Longest win streak', blurb: 'Consecutive wins within one regular season.', format: 'int', unit: 'games' }),
  season({ id: 'season-loss-streak', section: 'streaks', kind: 'streak', data: 'lossStreak', title: 'Longest losing streak', blurb: 'Consecutive losses within one regular season.', format: 'int', unit: 'games' }),
  season({ id: 'season-high-score-streak', section: 'streaks', kind: 'streak', data: 'highScoreStreak', title: 'Longest high-score streak', blurb: "Consecutive weeks with the league's top score.", format: 'int', unit: 'weeks' }),
  season({ id: 'season-high-score-drought', section: 'streaks', kind: 'streak', data: 'highScoreDrought', title: 'Longest high-score drought', blurb: "Consecutive weeks without the league's top score.", format: 'int', unit: 'weeks' }),

  season({ id: 'season-trades', section: 'transactions', data: 'trades', title: 'Most trades', blurb: 'Accepted trades.', note: COMMISSIONER_TRADES_NOTE, format: 'int' }),
  season({ id: 'season-roster-moves-most', section: 'transactions', data: 'rosterMoves', title: 'Most roster moves', blurb: 'Free-agent adds, waiver claims and drops.', format: 'int' }),
  season({ id: 'season-roster-moves-fewest', section: 'transactions', data: 'rosterMoves', direction: 'asc', title: 'Fewest roster moves', blurb: "My draft was fire, I don't need the wire.", format: 'int' }),
  season({ id: 'season-waiver-claims', section: 'transactions', data: 'waiverClaims', title: 'Most waiver claims', blurb: 'The waiver-wire merchant.', format: 'int' }),
  season({ id: 'season-faab-spent', section: 'transactions', data: 'faabSpent', title: 'Most FAAB spent', blurb: 'Waiver budget spent on winning claims.', format: 'money' }),
  season({ id: 'season-faab-bids', section: 'transactions', kind: 'bid', data: 'faabBids', title: 'Highest FAAB bids', blurb: 'Single winning waiver bids.', format: 'money' }),
  season({ id: 'season-trade-partners', section: 'transactions', kind: 'pair', data: 'tradePartners', title: 'Most frequent trade partners', blurb: 'Trades between the same two franchises in one season.', format: 'int', unit: 'trades' })
];

/** Counts ranked high-to-low hide zeros: "0 championships" is not a placing. */
export const hidesZero = (record) =>
  record.hideZero ?? (record.direction !== 'asc' && ['int', 'half'].includes(record.format));

/** The value as it reads on the card. The unit, where there is one, is rendered beside it. */
export function formatRecordValue(record, value) {
  switch (record.format) {
    case 'int':
      return String(Math.round(value));
    case 'half':
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
    case 'pct':
      return formatPct(value);
    // Points and point differentials read to the hundredth, as they are scored:
    // a 0.04-point margin must not print as 0.0.
    case 'signed':
      return formatDelta(value, SCORE_DECIMALS);
    case 'wins':
      return formatDelta(value, 2);
    case 'money':
      return `$${Math.round(value).toLocaleString('en-US')}`;
    case 'points':
    default:
      return formatScore(value);
  }
}
