/**
 * Every statistic the comparison offers, defined once.
 *
 * A stat is **additive components plus one value function**. `components`
 * maps one fact (a team-week, a bracket game or a team-season) to numbers
 * that add up — or combine by `max`/`min` where `combine` says so — and
 * `value` turns the combined totals into the figure. Nothing is ever an
 * average of averages: win % over three seasons is (W + T/2) / GP over all of
 * their games, lineup efficiency is Σstarter / Σoptimal. That single rule makes
 * one week, a running line, a season, any set of seasons and the all-time
 * figure exact and mutually consistent.
 *
 * `components` returning `null` means the fact says nothing about the stat (a
 * week with no stored lineup, a season with no transactions row). A selection
 * with no such facts has no value — unknown is absent, never zero.
 *
 * Fields:
 *   from          'week' | 'playoff' | 'season' — which facts feed it; only a
 *                 'week' stat can be drawn week by week
 *   kind          'count' (sums; offers a per-season average) | 'rate'
 *   better        'higher' | 'lower' | null (no good direction; ranks high first)
 *   format        see `src/components/history/compare/statFormat.js`
 *   weekly        'running' (the figure to date) | 'value' (that week alone)
 *   completedOnly placements are facts about a finished season
 *   signed        values can be negative; the bar chart draws a zero line
 *
 * Definitions match the record book's wherever both exist, and a test holds
 * them to it. Live-only numbers — projections, FPI, playoff odds, the power
 * rating — are out by design: none of them exists for past seasons.
 */

import { FULL_LINEUP, EPSILON } from '../recordBook/index.js';

export const CATEGORIES = [
  { id: 'record', label: 'Record' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'luck', label: 'Luck & schedule' },
  { id: 'lineups', label: 'Lineups' },
  { id: 'postseason', label: 'Postseason' },
  { id: 'transactions', label: 'Transactions' }
];

const LINEUP_NOTE = 'From ESPN lineups, back to 2020 (2024 week 1 has none).';
const COMPLETED_NOTE = 'Completed seasons only.';

const is = (condition) => (condition ? 1 : 0);
const ratio = (numerator, denominator, scale = 1) =>
  denominator > 0 ? (numerator / denominator) * scale : null;

const week = (entry) => ({ from: 'week', kind: 'count', better: 'higher', format: 'int', weekly: 'running', ...entry });
const lineup = (entry) =>
  week({
    category: 'lineups',
    ...entry,
    description: `${entry.description} ${LINEUP_NOTE}`,
    components: (fact) => (fact.lineup ? entry.components(fact, fact.lineup) : null)
  });
const placement = (entry) => {
  const stat = {
    from: 'season',
    category: 'postseason',
    kind: 'count',
    better: 'higher',
    format: 'int',
    weekly: null,
    completedOnly: true,
    ...entry
  };
  return stat.completedOnly ? { ...stat, description: `${stat.description} ${COMPLETED_NOTE}` } : stat;
};
const transaction = (key, entry) => ({
  from: 'season',
  category: 'transactions',
  kind: 'count',
  better: null,
  format: 'int',
  weekly: null,
  components: (fact) => (fact.transactions ? { n: entry.pick?.(fact.transactions) ?? fact.transactions[key] ?? 0 } : null),
  value: (t) => t.n,
  ...entry
});

const rosterMoves = (tx) => (tx.freeAgentAdds ?? 0) + (tx.waiverClaims ?? 0) + (tx.drops ?? 0);

const stddev = ({ n, sum, sumSq }) => (n >= 2 ? Math.sqrt(Math.max(0, (sumSq - (sum * sum) / n) / (n - 1))) : null);

export const STATS = [
  // -------------------------------------------------------------------------
  // Record
  // -------------------------------------------------------------------------
  week({ id: 'wins', category: 'record', label: 'Wins', description: 'Regular-season wins.',
    components: (f) => ({ n: is(f.result === 'W') }), value: (t) => t.n }),
  week({ id: 'losses', category: 'record', label: 'Losses', better: 'lower', description: 'Regular-season losses.',
    components: (f) => ({ n: is(f.result === 'L') }), value: (t) => t.n }),
  week({ id: 'winPct', category: 'record', label: 'Win %', kind: 'rate', format: 'pct', description: 'Regular-season win percentage; a tie is half a win.',
    components: (f) => ({ wins: is(f.result === 'W'), ties: is(f.result === 'T'), games: 1 }),
    value: (t) => ratio(t.wins + t.ties / 2, t.games, 100) }),
  week({ id: 'gamesOver500', category: 'record', label: 'Games over .500', format: 'signedInt', signed: true, description: 'Wins minus losses.',
    components: (f) => ({ n: is(f.result === 'W') - is(f.result === 'L') }), value: (t) => t.n }),
  week({ id: 'blowoutWins', category: 'record', label: 'Blowout wins', description: 'Wins by 30 or more.',
    components: (f) => ({ n: is(f.result === 'W' && f.isBlowout) }), value: (t) => t.n }),
  week({ id: 'blowoutLosses', category: 'record', label: 'Blowout losses', better: 'lower', description: 'Losses by 30 or more.',
    components: (f) => ({ n: is(f.result === 'L' && f.isBlowout) }), value: (t) => t.n }),
  week({ id: 'narrowWins', category: 'record', label: 'Narrow wins', description: 'Wins by 5 or fewer.',
    components: (f) => ({ n: is(f.result === 'W' && f.isClose) }), value: (t) => t.n }),
  week({ id: 'narrowLosses', category: 'record', label: 'Narrow losses', better: 'lower', description: 'Losses by 5 or fewer.',
    components: (f) => ({ n: is(f.result === 'L' && f.isClose) }), value: (t) => t.n }),

  // -------------------------------------------------------------------------
  // Scoring
  // -------------------------------------------------------------------------
  week({ id: 'pointsFor', category: 'scoring', label: 'Points for', format: 'points', weekly: 'value', description: 'Regular-season points scored. Week by week, the score that week.',
    components: (f) => ({ n: f.pf }), value: (t) => t.n }),
  week({ id: 'pointsAgainst', category: 'scoring', label: 'Points against', format: 'points', weekly: 'value', better: 'lower', description: 'Regular-season points allowed. Week by week, the opponent’s score.',
    components: (f) => ({ n: f.pa }), value: (t) => t.n }),
  week({ id: 'pointDiff', category: 'scoring', label: 'Point differential', format: 'signedPoints', signed: true, weekly: 'value', description: 'Points for minus points against. Week by week, the margin.',
    components: (f) => ({ n: f.pf - f.pa }), value: (t) => t.n }),
  week({ id: 'ppg', category: 'scoring', label: 'Points per game', kind: 'rate', format: 'points', description: 'Regular-season points scored per game.',
    components: (f) => ({ points: f.pf, games: 1 }), value: (t) => ratio(t.points, t.games) }),
  week({ id: 'paPerGame', category: 'scoring', label: 'Points against per game', kind: 'rate', format: 'points', better: 'lower', description: 'Regular-season points allowed per game.',
    components: (f) => ({ points: f.pa, games: 1 }), value: (t) => ratio(t.points, t.games) }),
  week({ id: 'diffPerGame', category: 'scoring', label: 'Differential per game', kind: 'rate', format: 'signedPoints', signed: true, description: 'Average margin, wins and losses together.',
    components: (f) => ({ points: f.pf - f.pa, games: 1 }), value: (t) => ratio(t.points, t.games) }),
  week({ id: 'bestWeek', category: 'scoring', label: 'Highest score', kind: 'rate', format: 'score', combine: { n: 'max' }, description: 'The best regular-season score.',
    components: (f) => ({ n: f.pf }), value: (t) => t.n }),
  week({ id: 'worstWeek', category: 'scoring', label: 'Lowest score', kind: 'rate', format: 'score', combine: { n: 'min' }, description: 'The worst regular-season score.',
    components: (f) => ({ n: f.pf }), value: (t) => t.n }),
  week({ id: 'consistency', category: 'scoring', label: 'Scoring volatility', kind: 'rate', format: 'points', better: 'lower', description: 'Standard deviation of weekly scores; lower is steadier.',
    components: (f) => ({ n: 1, sum: f.pf, sumSq: f.pf * f.pf }), value: stddev }),
  week({ id: 'avgWinMargin', category: 'scoring', label: 'Average winning margin', kind: 'rate', format: 'points', description: 'How much the wins were by, on average.',
    components: (f) => (f.result === 'W' ? { points: f.pf - f.pa, games: 1 } : null), value: (t) => ratio(t.points, t.games) }),
  week({ id: 'avgLossMargin', category: 'scoring', label: 'Average losing margin', kind: 'rate', format: 'points', better: 'lower', description: 'How much the losses were by, on average.',
    components: (f) => (f.result === 'L' ? { points: f.pa - f.pf, games: 1 } : null), value: (t) => ratio(t.points, t.games) }),
  week({ id: 'weeklyHighs', category: 'scoring', label: 'Weekly high scores', description: 'Weeks with the league’s top score; a tie shares it.',
    components: (f) => ({ n: is(f.weeklyHigh) }), value: (t) => t.n }),
  week({ id: 'weeklyLows', category: 'scoring', label: 'Weekly low scores', better: 'lower', description: 'Weeks with the league’s bottom score.',
    components: (f) => ({ n: is(f.weeklyLow) }), value: (t) => t.n }),
  placement({ id: 'scoringTitles', category: 'scoring', label: 'Scoring titles', description: 'Seasons with the most regular-season points.',
    components: (f) => ({ n: is(f.scoringTitle) }), value: (t) => t.n }),

  // -------------------------------------------------------------------------
  // Luck & schedule
  // -------------------------------------------------------------------------
  week({ id: 'allPlayPct', category: 'luck', label: 'All-play win %', kind: 'rate', format: 'pct', description: 'Share of every other team’s score beaten each week; a tie is half.',
    components: (f) => ({ w: f.apW, l: f.apL, t: f.apT }), value: (t) => ratio(t.w + t.t / 2, t.w + t.l + t.t, 100) }),
  week({ id: 'allPlayWins', category: 'luck', label: 'All-play wins', format: 'half', description: 'Wins against every other team, every week.',
    components: (f) => ({ w: f.apW, t: f.apT }), value: (t) => t.w + t.t / 2 }),
  week({ id: 'luck', category: 'luck', label: 'Luck', format: 'wins', signed: true, description: 'Wins beyond what the scoring earned against the whole league each week.',
    components: (f) => {
      const games = f.apW + f.apL + f.apT;
      if (games === 0) return null;
      return { n: (f.result === 'W' ? 1 : f.result === 'T' ? 0.5 : 0) - (f.apW + f.apT / 2) / games };
    },
    value: (t) => t.n }),
  week({ id: 'schedule', category: 'luck', label: 'Schedule strength', kind: 'rate', format: 'points', better: null, description: 'Opponents’ season points per game, averaged over the games played.',
    components: (f) => (Number.isFinite(f.opponentPpg) ? { points: f.opponentPpg, games: 1 } : null), value: (t) => ratio(t.points, t.games) }),
  week({ id: 'facedTop', category: 'luck', label: 'Faced the week’s top score', better: 'lower', description: 'Games against the team with the highest score that week.',
    components: (f) => ({ n: is(f.facedTop) }), value: (t) => t.n }),

  // -------------------------------------------------------------------------
  // Lineups
  // -------------------------------------------------------------------------
  lineup({ id: 'lineupEfficiency', label: 'Lineup efficiency', kind: 'rate', format: 'pct', description: 'Starter points as a share of the best possible lineup.',
    components: (f, l) => ({ starter: l.starterPoints, optimal: l.optimalPoints }), value: (t) => ratio(t.starter, t.optimal, 100) }),
  lineup({ id: 'perfectRate', label: 'Perfect-lineup rate', kind: 'rate', format: 'pct', description: 'Weeks the best possible lineup was the one started.',
    components: (f, l) => ({ perfect: is(l.optimalPoints - l.starterPoints < EPSILON), weeks: 1 }), value: (t) => ratio(t.perfect, t.weeks, 100) }),
  lineup({ id: 'benchPoints', label: 'Points left on bench', format: 'points', weekly: 'value', better: 'lower', description: 'Best possible lineup minus the one started.',
    components: (f, l) => ({ n: l.optimalPoints - l.starterPoints }), value: (t) => t.n }),
  lineup({ id: 'benchPerWeek', label: 'Bench points per week', kind: 'rate', format: 'points', better: 'lower', description: 'Points left on the bench, per week.',
    components: (f, l) => ({ points: l.optimalPoints - l.starterPoints, weeks: 1 }), value: (t) => ratio(t.points, t.weeks) }),
  lineup({ id: 'optimalPerWeek', label: 'Best possible lineup per week', kind: 'rate', format: 'points', description: 'What the roster could have scored, per week.',
    components: (f, l) => ({ points: l.optimalPoints, weeks: 1 }), value: (t) => ratio(t.points, t.weeks) }),
  lineup({ id: 'avoidableLosses', label: 'Avoidable losses', better: 'lower', description: 'Losses the best possible lineup would have won.',
    components: (f, l) => ({ n: is(f.result === 'L' && l.optimalPoints > f.pa) }), value: (t) => t.n }),
  lineup({ id: 'shortHandedWins', label: 'Short-handed wins', description: `Wins with fewer than ${FULL_LINEUP} starters scoring.`,
    components: (f, l) => ({ n: is(f.result === 'W' && l.startersScoring < FULL_LINEUP) }), value: (t) => t.n }),

  // -------------------------------------------------------------------------
  // Postseason
  // -------------------------------------------------------------------------
  placement({ id: 'standing', label: 'Regular-season finish', kind: 'rate', format: 'rank', better: 'lower', completedOnly: false,
    description: 'Place in the regular-season standings; averaged over several seasons. A season in progress counts where it stands today.',
    components: (f) => ({ sum: f.standing, n: 1 }), value: (t) => ratio(t.sum, t.n) }),
  placement({ id: 'finalRank', label: 'Final rank', kind: 'rate', format: 'rank', better: 'lower', description: 'Final place after the playoffs; averaged over several seasons.',
    components: (f) => (f.finalRank != null ? { sum: f.finalRank, n: 1 } : null), value: (t) => ratio(t.sum, t.n) }),
  placement({ id: 'championships', label: 'Championships', description: 'Titles won.',
    components: (f) => ({ n: is(f.playoffFinish === 'champion') }), value: (t) => t.n }),
  placement({ id: 'finals', label: 'Finals appearances', description: 'Championship games reached.',
    components: (f) => ({ n: is(f.playoffFinish === 'champion' || f.playoffFinish === '2nd') }), value: (t) => t.n }),
  placement({ id: 'playoffAppearances', label: 'Playoff appearances', description: 'Seasons in the bracket.',
    components: (f) => ({ n: is(f.madePlayoffs) }), value: (t) => t.n }),
  placement({ id: 'playoffWins', label: 'Playoff wins', description: 'Bracket games won; consolation games are not playoff games.',
    components: (f) => ({ n: f.playoffWins }), value: (t) => t.n }),
  placement({ id: 'playoffLosses', label: 'Playoff losses', better: 'lower', description: 'Bracket games lost.',
    components: (f) => ({ n: f.playoffLosses }), value: (t) => t.n }),
  placement({ id: 'playoffWinPct', label: 'Playoff win %', kind: 'rate', format: 'pct', description: 'Bracket games won; a tie is half.',
    components: (f) => (f.playoffGames > 0 ? { wins: f.playoffWins, ties: f.playoffTies, games: f.playoffGames } : null),
    value: (t) => ratio(t.wins + t.ties / 2, t.games, 100) }),
  placement({ id: 'playoffPpg', label: 'Playoff points per game', kind: 'rate', format: 'points', description: 'Points per bracket game.',
    components: (f) => (f.playoffGames > 0 ? { points: f.playoffPoints, games: f.playoffGames } : null),
    value: (t) => ratio(t.points, t.games) }),
  placement({ id: 'lastPlaces', label: 'Last-place finishes', better: 'lower', description: 'Seasons finishing last overall.',
    components: (f) => ({ n: is(f.lastPlace) }), value: (t) => t.n }),

  // -------------------------------------------------------------------------
  // Transactions
  // -------------------------------------------------------------------------
  transaction('trades', { id: 'trades', label: 'Trades', description: 'Accepted trades. The commissioner’s count is inflated by trades executed for other managers.' }),
  transaction('rosterMoves', { id: 'rosterMoves', label: 'Roster moves', description: 'Free-agent adds, waiver claims and drops.', pick: rosterMoves }),
  transaction('freeAgentAdds', { id: 'freeAgentAdds', label: 'Free-agent adds', description: 'Players added straight from free agency.' }),
  transaction('waiverClaims', { id: 'waiverClaims', label: 'Waiver claims', description: 'Players won on waivers.' }),
  transaction('drops', { id: 'drops', label: 'Drops', description: 'Players released.' }),
  transaction('faabSpent', { id: 'faabSpent', label: 'FAAB spent', format: 'money', description: 'Waiver budget spent on winning claims.' })
];

export const STATS_BY_ID = new Map(STATS.map((stat) => [stat.id, stat]));

export const DEFAULT_STAT_ID = 'winPct';

export const getStat = (id) => STATS_BY_ID.get(id) ?? STATS_BY_ID.get(DEFAULT_STAT_ID);
