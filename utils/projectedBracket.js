/**
 * The bracket as it stands: who is in each slot, real or projected.
 *
 * Until ESPN draws the postseason there are no bracket rows in `games`, so the
 * field is read off the standings: the same seeds the standings RPC already
 * shows beside each team. The moment real rows exist they win, slot by slot,
 * and the result is the same shape, which is what lets the playoff page, the
 * home card and the Path to the Playoffs scenario share one renderer.
 *
 * Everything is 2026+ (`usesSeededPlayoffs`): earlier seasons have no seeds
 * and two division halves, and they are history, so nothing projects them.
 *
 * A projection stops at what the seeds decide. The semifinals re-seed, so seed
 * 1's opponent is "the lowest seed left" until both round-1 games are played,
 * and naming a team there would be a guess.
 */

import {
  organizeSeededBracket,
  reseedSemis,
  sortByStandings,
  teamIdOf,
  usesSeededPlayoffs
} from './playoffSeeding.js';

/** The last scored week before the home page shows the bracket. */
export const HOME_BRACKET_AFTER_WEEK = 10;

/** Round-1 consolation pairs, by seed: 7v8, 9v10, 11v12, 13v14. */
const CONSOLATION_PAIRS = [[7, 8], [9, 10], [11, 12], [13, 14]];

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

const isScored = (game) => game.team1Score != null && game.team2Score != null;

const regularGames = (games) =>
  (games ?? []).filter((game) => (game.type ?? 'regular') === 'regular' && game.team2Id != null);

/** Every team in `getStandingsByDivision`'s shape, as one list. */
export function flattenStandings(standings) {
  return [
    ...(standings?.divisions ?? []).flatMap((division) => division.teams ?? []),
    ...(standings?.unassigned ?? [])
  ];
}

/**
 * Standings rows carrying their season team's identity. The RPC returns no
 * franchise id, which every avatar and profile link keys on.
 */
export function mergeStandings(rows, seasonTeams) {
  const byId = new Map((seasonTeams ?? []).map((team) => [team.id, team]));
  return (rows ?? []).map((row) => ({ ...byId.get(row.id), ...row }));
}

/**
 * The newest week every game of which has a score, or 0. A week is scored as
 * a whole, on Tuesday, so a part-scored week counts as not yet.
 */
export function lastScoredWeek(games) {
  const unscored = new Set();
  const weeks = new Set();
  for (const game of regularGames(games)) {
    weeks.add(game.week);
    if (!isScored(game)) unscored.add(game.week);
  }
  return Math.max(0, ...[...weeks].filter((week) => !unscored.has(week)));
}

/** Does the home page show the bracket yet? */
export function showsHomeBracket(games) {
  const bracketDrawn = (games ?? []).some(
    (game) => game.type === 'bye' || String(game.type ?? '').startsWith('playoff')
  );
  return bracketDrawn || lastScoredWeek(games) >= HOME_BRACKET_AFTER_WEEK;
}

/**
 * Do the standings offer Path to the Playoffs? Until the last regular-season
 * game has a score, which is when the tool itself says the field is set. The
 * next season's unplayed games bring it back on their own.
 *
 * @param {object} input
 * @param {number} input.year
 * @param {Array<Object>} input.games - the season's games
 * @param {number} [input.regularSeasonWeeks]
 */
export function showsPathToPlayoffs({ year, games, regularSeasonWeeks = 14 }) {
  if (!usesSeededPlayoffs(year)) return false;
  return regularGames(games).some((game) => game.week <= regularSeasonWeeks && !isScored(game));
}

/**
 * The league in seed order: the six the standings seed, then everyone else by
 * the canonical sort, numbered on from 7. `playoffSeed` is the RPC's, so this
 * cannot disagree with the seed the standings print.
 *
 * @param {Array<Object>} rows - standings rows
 * @returns {Array<{ team: Object, seed: number }>}
 */
export function seedOrder(rows) {
  const seeded = (rows ?? [])
    .filter((row) => row.playoffSeed != null)
    .sort((a, b) => a.playoffSeed - b.playoffSeed);
  const rest = sortByStandings((rows ?? []).filter((row) => row.playoffSeed == null));
  return [...seeded, ...rest].map((team, index) => ({ team, seed: team.playoffSeed ?? index + 1 }));
}

/**
 * The bracket the standings would draw today, in the same `{ team1, team2 }`
 * shape as a game row. Null until all six berths have a team.
 *
 * @param {Array<Object>} rows - standings rows
 */
export function projectBracket(rows) {
  const order = seedOrder(rows);
  const bySeed = new Map(order.map(({ team, seed }) => [seed, team]));
  if (![1, 2, 3, 4, 5, 6].every((seed) => bySeed.has(seed))) return null;

  const pairing = (seed1, seed2) => ({
    team1: bySeed.get(seed1) ?? null,
    team2: bySeed.get(seed2) ?? null,
    team1Seed: seed1,
    team2Seed: seed2
  });

  return {
    byes: { 1: bySeed.get(1), 2: bySeed.get(2) },
    r1: { '3v6': pairing(3, 6), '4v5': pairing(4, 5) },
    consolation: CONSOLATION_PAIRS.map(([seed1, seed2]) => pairing(seed1, seed2))
  };
}

/** Has the postseason been drawn? A bye or a round-1 row is the first sign. */
export function isBracketSet(games, seedByTeamId) {
  const bracket = organizeSeededBracket(games, seedByTeamId);
  return Boolean(bracket.byes[1] || bracket.byes[2] || bracket.r1['3v6'] || bracket.r1['4v5']);
}

const teamIdInGame = (game, slot) =>
  game?.[`${slot}Id`] ?? game?.[`${slot}_id`] ?? game?.[slot]?.id ?? null;

const winnerIdOf = (game) => {
  if (game?.winnerTeamId != null) return game.winnerTeamId;
  if (!game?.isCompleted || !isScored(game) || game.team1Score === game.team2Score) return null;
  return teamIdInGame(game, game.team1Score > game.team2Score ? 'team1' : 'team2');
};

/**
 * The upper bracket as three rounds of slots, ready to draw.
 *
 * A side is `{ team, seed, score, won, lost }` when somebody is in it and
 * `{ label }` when nobody is yet. `drawn` is false while the whole thing is a
 * projection.
 *
 * @param {object} input
 * @param {Array<Object>} input.games - the season's games
 * @param {Array<Object>} input.teams - standings rows (`seedOrder`'s input)
 * @param {number} [input.firstRoundWeek]
 * `consolation` is every other postseason game (placement games and the
 * consolation bracket), in the same matchup shape, each with its `week`. Empty
 * until ESPN draws them: nothing projects those.
 *
 * @returns {null | { drawn: boolean, weeks: number[], champion: Object|null, rounds: Array, consolation: Array }}
 */
export function resolveUpperBracket({ games = [], teams = [], firstRoundWeek = 15 }) {
  const order = seedOrder(teams);
  const seedByTeamId = new Map(order.map(({ team, seed }) => [teamIdOf(team), seed]));
  const teamById = new Map(order.map(({ team }) => [teamIdOf(team), team]));

  const real = organizeSeededBracket(games, seedByTeamId);
  const drawn = isBracketSet(games, seedByTeamId);
  const projection = projectBracket(teams);
  if (!drawn && !projection) return null;

  const named = (team) => ({ team, seed: seedByTeamId.get(teamIdOf(team)) ?? null });

  const fromGame = (game, slot) => {
    const id = teamIdInGame(game, slot);
    const team = teamById.get(id) ?? game?.[slot] ?? null;
    if (!team) return { label: 'TBD' };
    const winner = winnerIdOf(game);
    return {
      ...named(team),
      score: game[`${slot}Score`] ?? null,
      won: sameId(winner, id),
      lost: winner != null && !sameId(winner, id)
    };
  };

  const pairingSides = (pairing) => [named(pairing.team1), named(pairing.team2)];
  const bothSides = (game) => [fromGame(game, 'team1'), fromGame(game, 'team2')];
  const byeSide = (seed) =>
    real.byes[seed] ? fromGame(real.byes[seed], 'team1') : projection ? named(projection.byes[seed]) : { label: 'TBD' };

  const firstRound = (key) => {
    if (real.r1[key]) return { id: `r1-${key}`, sides: bothSides(real.r1[key]), game: real.r1[key] };
    if (projection && !drawn) return { id: `r1-${key}`, sides: pairingSides(projection.r1[key]) };
    return { id: `r1-${key}`, sides: [{ label: 'TBD' }, { label: 'TBD' }] };
  };

  const r1Games = ['3v6', '4v5'].map(firstRound);
  const r1Winners = r1Games.map(({ sides }) => sides.find((side) => side.won) ?? null);

  // The re-seed: seed 1 draws the lowest seed left, once both are known.
  const { semi1, semi2 } = reseedSemis(r1Winners[0]?.seed, r1Winners[1]?.seed);
  const survivor = (seed, fallback) => {
    const found = r1Winners.find((side) => side && side.seed === seed);
    return found ? { team: found.team, seed: found.seed } : { label: fallback };
  };

  const semifinal = (id, game, bye, opponent) =>
    game ? { id, sides: bothSides(game), game } : { id, sides: [byeSide(bye), opponent] };

  const semis = [
    semifinal('semi-1', real.semis.semi1, 1, survivor(semi1[1], 'Lowest seed left')),
    semifinal('semi-2', real.semis.semi2, 2, survivor(semi2[1], 'Highest seed left'))
  ];

  const semiWinner = (semi, label) => {
    const side = semi.sides.find((s) => s.won);
    return side ? { team: side.team, seed: side.seed } : { label };
  };

  const final = real.championship
    ? { id: 'final', sides: bothSides(real.championship), game: real.championship }
    : { id: 'final', sides: [semiWinner(semis[0], 'Semifinal 1 winner'), semiWinner(semis[1], 'Semifinal 2 winner')] };

  const rounds = [
    {
      id: 'round-1',
      title: 'Round 1',
      week: firstRoundWeek,
      matchups: [
        { id: 'bye-1', bye: true, sides: [byeSide(1)] },
        { id: 'bye-2', bye: true, sides: [byeSide(2)] },
        ...r1Games
      ]
    },
    { id: 'semifinals', title: 'Semifinals', week: firstRoundWeek + 1, matchups: semis },
    { id: 'championship', title: 'Championship', week: firstRoundWeek + 2, matchups: [final] }
  ];

  const inBracket = new Set(rounds.flatMap(({ matchups }) => matchups.map(({ game }) => game?.id)));
  const consolation = games
    .filter((game) => game.week >= firstRoundWeek && game.type !== 'bye' &&
      teamIdInGame(game, 'team2') != null && !inBracket.has(game.id))
    .sort((a, b) => a.week - b.week)
    .map((game) => ({ id: game.id, week: game.week, sides: bothSides(game), game }));

  return {
    drawn,
    weeks: [firstRoundWeek, firstRoundWeek + 1, firstRoundWeek + 2],
    champion: final.sides.find((side) => side.won)?.team ?? null,
    rounds,
    consolation
  };
}

/**
 * The game a matchup's box score is about: the real row, or for a slot with no
 * game yet, a stand-in shaped like one. `isProjected` is how the box score
 * knows there is nothing to edit and no result to wait for. The named team
 * always comes first, and an empty slot's label travels as `opponentLabel`.
 *
 * @param {object} matchup - from `resolveUpperBracket`
 * @param {number} week - the round's week
 */
export function boxScoreGame(matchup, week) {
  if (matchup.game) return matchup.game;

  const [first, second] = [...matchup.sides].sort((a, b) => Number(Boolean(b.team)) - Number(Boolean(a.team)));
  return {
    id: matchup.id,
    week,
    type: second?.team ? 'projected' : 'bye',
    team1Id: teamIdOf(first?.team),
    team2Id: teamIdOf(second?.team),
    team1Score: null,
    team2Score: null,
    isCompleted: false,
    isProjected: true,
    opponentLabel: matchup.bye ? 'First-round bye' : second?.label ?? null
  };
}
