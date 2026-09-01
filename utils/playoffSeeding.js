/**
 * Who makes the playoffs, and in what order — the 2026+ rule.
 *
 * Through 2025 the league took the top three of each division, gave each
 * division winner a bye, and ran two independent three-team brackets that met
 * only in the championship. That rule was encoded independently in four places
 * (the standings RPC, `finalize_season`, the odds calculator, the bracket JSX),
 * which is why this module exists: one definition on the client side, and a
 * year gate so the old meaning survives everywhere it is still true.
 *
 * From 2026:
 *
 * - **Seeds 1-2** are the two division winners. Seed 1 is the better of the
 *   two by the canonical sort below.
 * - **Seeds 3-6** are the next four teams *league-wide*, division ignored. One
 *   division can send five teams and the other only its winner.
 * - **The bracket re-seeds NFL-style.** Round 1 is 3v6 and 4v5; in the semis
 *   seed 1 draws the lowest surviving seed and seed 2 the other.
 *
 * Everything here is pure: no I/O, no dates, no database. `services/db` and the
 * SQL RPC agree with it by construction, not by coincidence — see the
 * `20260901120000_seeded_playoff_standings.sql` migration, which implements the
 * same comparator in SQL.
 */

/** The first season seeded by the rule above. 2020-2025 keep their meaning. */
export const PLAYOFF_RESEED_YEAR = 2026;

/** Number of playoff berths. Unchanged by the reseed — six either way. */
export const PLAYOFF_FIELD_SIZE = 6;

/** Berths that come with a first-round bye. */
export const BYE_COUNT = 2;

/**
 * Does this season use league-wide wildcards and a re-seeded bracket?
 *
 * @param {number|string|null|undefined} year
 * @returns {boolean}
 */
export function usesSeededPlayoffs(year) {
  const parsed = Number(year);
  return Number.isFinite(parsed) && parsed >= PLAYOFF_RESEED_YEAR;
}

// ---------------------------------------------------------------------------
// Field access
//
// Team rows reach this module from three shapes: the standings RPC (snake_case),
// `services/db` (camelCase) and the power-ranking calculator (camelCase with a
// few snake_case leftovers). Reading both spellings here is cheaper than making
// every caller normalise, and `??` rather than `||` so a genuine 0 survives.
// ---------------------------------------------------------------------------

const num = (value) => {
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
};

/** The id a seed is keyed on. */
export function teamIdOf(team) {
  return team?.id ?? team?.teamId ?? team?.team_id ?? null;
}

/** The division a team plays in, or null when it has not been assigned one. */
export function divisionIdOf(team) {
  return team?.divisionId ?? team?.division_id ?? null;
}

/**
 * Win percentage, preferring the stored column and deriving it only when there
 * is none. A tie is half a win, which is what `teams.win_percentage` and
 * `v_team_standings` both mean by it.
 */
export function winPercentageOf(team) {
  const stored = num(team?.winPercentage ?? team?.win_percentage);
  if (stored !== null) return stored;

  const wins = num(team?.wins) ?? 0;
  const losses = num(team?.losses) ?? 0;
  const ties = num(team?.ties) ?? 0;
  const played = wins + losses + ties;
  return played > 0 ? (wins + ties * 0.5) / played : 0;
}

export function pointsForOf(team) {
  return num(team?.pointsFor ?? team?.points_for) ?? 0;
}

export function pointsAgainstOf(team) {
  return num(team?.pointsAgainst ?? team?.points_against) ?? 0;
}

/**
 * The canonical league sort: win% desc, points for desc, points against asc,
 * team id last so the order is deterministic rather than merely stable.
 *
 * Points against is a real tiebreak in this league, not a formality — it is the
 * third key in the standings RPC and has been since the baseline schema.
 *
 * @returns {number} negative when `a` ranks ahead of `b`
 */
export function compareStandings(a, b) {
  const winDiff = winPercentageOf(b) - winPercentageOf(a);
  if (winDiff !== 0) return winDiff;

  const pfDiff = pointsForOf(b) - pointsForOf(a);
  if (pfDiff !== 0) return pfDiff;

  const paDiff = pointsAgainstOf(a) - pointsAgainstOf(b);
  if (paDiff !== 0) return paDiff;

  const aId = String(teamIdOf(a) ?? '');
  const bId = String(teamIdOf(b) ?? '');
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

/** `[...teams]` in canonical order, leaving the caller's array alone. */
export function sortByStandings(teams) {
  return [...(teams || [])].sort(compareStandings);
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SeedInfo
 * @property {number|null} seed          1-6, or null for a team that missed out
 * @property {boolean}     isBye         a division winner, seeded 1 or 2
 * @property {boolean}     isWildcard    seeded 3-6
 * @property {number}      divisionRank  place within its own division, 1-based
 */

/**
 * Seed a league.
 *
 * Best-effort by design: this runs while an admin is still moving teams between
 * divisions, so a league with one division, three divisions, or an empty one
 * must produce *something* rather than throw. In that case the six berths are
 * awarded league-wide and the top two still take the byes — the bracket shape
 * is the same either way, only the qualification story differs.
 *
 * @param {Array<Object>} teams
 * @returns {Map<*, SeedInfo>} keyed by team id; every team appears
 */
export function computeSeeds(teams) {
  const roster = Array.isArray(teams) ? teams.filter(Boolean) : [];
  const seeds = new Map();
  if (roster.length === 0) return seeds;

  // Division rank first: it is shown next to every team, qualifier or not, and
  // it does not depend on how the berths get awarded.
  const byDivision = new Map();
  for (const team of roster) {
    const key = divisionIdOf(team) ?? '__unassigned__';
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key).push(team);
  }

  for (const [, members] of byDivision) {
    sortByStandings(members).forEach((team, index) => {
      seeds.set(teamIdOf(team), {
        seed: null,
        isBye: false,
        isWildcard: false,
        divisionRank: index + 1
      });
    });
  }

  const divisionGroups = [...byDivision.entries()]
    .filter(([key, members]) => key !== '__unassigned__' && members.length > 0)
    .map(([, members]) => members);

  const leagueOrder = sortByStandings(roster);

  const winners =
    divisionGroups.length === BYE_COUNT
      ? sortByStandings(divisionGroups.map((members) => sortByStandings(members)[0]))
      : leagueOrder.slice(0, BYE_COUNT);

  const byeIds = new Set(winners.map(teamIdOf));

  winners.forEach((team, index) => {
    const info = seeds.get(teamIdOf(team));
    if (!info) return;
    info.seed = index + 1;
    info.isBye = true;
  });

  const wildcards = leagueOrder
    .filter((team) => !byeIds.has(teamIdOf(team)))
    .slice(0, PLAYOFF_FIELD_SIZE - winners.length);

  wildcards.forEach((team, index) => {
    const info = seeds.get(teamIdOf(team));
    if (!info) return;
    info.seed = winners.length + index + 1;
    info.isWildcard = true;
  });

  return seeds;
}

/**
 * The six qualifiers in seed order, for callers that want a list rather than a
 * lookup. Teams that missed out are not included.
 *
 * @param {Array<Object>} teams
 * @returns {Array<Object>} the same team objects, seed 1 first
 */
export function playoffFieldInSeedOrder(teams) {
  const seeds = computeSeeds(teams);
  return (teams || [])
    .filter((team) => seeds.get(teamIdOf(team))?.seed != null)
    .sort((a, b) => seeds.get(teamIdOf(a)).seed - seeds.get(teamIdOf(b)).seed);
}

/**
 * The semifinal pairings, NFL-style: the top seed draws the *lowest* surviving
 * seed and the second seed draws the other.
 *
 * Both round-1 results are needed. With only one, seed 1's opponent is not yet
 * knowable — a 6 seed surviving changes who seed 2 plays as much as who seed 1
 * plays — so a missing winner yields TBD on both sides rather than a guess.
 *
 * @param {number|null} winnerSeedA a round-1 winner's seed (3-6)
 * @param {number|null} winnerSeedB the other round-1 winner's seed
 * @returns {{ semi1: [1, number|null], semi2: [2, number|null] }}
 */
export function reseedSemis(winnerSeedA, winnerSeedB) {
  // `Number(null)` is 0, which is finite — so the null check has to come first.
  const a = winnerSeedA == null ? NaN : Number(winnerSeedA);
  const b = winnerSeedB == null ? NaN : Number(winnerSeedB);

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { semi1: [1, null], semi2: [2, null] };
  }

  return { semi1: [1, Math.max(a, b)], semi2: [2, Math.min(a, b)] };
}

// ---------------------------------------------------------------------------
// Bracket shape
// ---------------------------------------------------------------------------

const R1_TYPES = new Set(['playoff_first_round', 'playoff_quarterfinals']);

const seedsInGame = (game, seedByTeamId) => {
  const ids = [
    game?.team1?.id ?? game?.team1Id ?? game?.team1_id,
    game?.team2?.id ?? game?.team2Id ?? game?.team2_id
  ].filter((id) => id != null);

  return ids.map((id) => seedByTeamId?.get?.(id) ?? null).filter((seed) => seed != null);
};

const soloSeed = (game, seedByTeamId) => {
  const id = game?.team1?.id ?? game?.team1Id ?? game?.team1_id;
  return id == null ? null : (seedByTeamId?.get?.(id) ?? null);
};

/**
 * Sort real `games` rows into the seeded bracket's named slots.
 *
 * Slots are decided by *who is in the game*, not by arrival order, because
 * arrival order is what made the old bracket assign byes to whichever one-sided
 * row the query happened to return first. When the seeds are not known yet —
 * before the regular season ends, or for a game whose teams are still TBD —
 * games fall back to arrival order so the page still renders something.
 *
 * @param {Array<Object>} playoffGames rows from `playoffs.getPlayoffGames`
 * @param {Map<*, number>} seedByTeamId team id → seed (1-6)
 */
export function organizeSeededBracket(playoffGames, seedByTeamId) {
  const bracket = {
    byes: { 1: null, 2: null },
    r1: { '3v6': null, '4v5': null },
    semis: { semi1: null, semi2: null },
    championship: null,
    thirdPlace: null,
    fifthPlace: []
  };

  const spare = { byes: [], r1: [], semis: [] };

  for (const game of playoffGames || []) {
    switch (game?.type) {
      case 'bye': {
        const seed = soloSeed(game, seedByTeamId);
        if ((seed === 1 || seed === 2) && !bracket.byes[seed]) bracket.byes[seed] = game;
        else spare.byes.push(game);
        break;
      }
      case 'playoff_semifinals': {
        const seeds = seedsInGame(game, seedByTeamId);
        if (seeds.includes(1) && !bracket.semis.semi1) bracket.semis.semi1 = game;
        else if (seeds.includes(2) && !bracket.semis.semi2) bracket.semis.semi2 = game;
        else spare.semis.push(game);
        break;
      }
      case 'playoff_championship':
        bracket.championship = game;
        break;
      case 'playoff_third_place':
        bracket.thirdPlace = game;
        break;
      case 'playoff_fifth_place':
        bracket.fifthPlace.push(game);
        break;
      default:
        if (R1_TYPES.has(game?.type)) {
          const seeds = seedsInGame(game, seedByTeamId);
          const isTopGame = seeds.includes(6) || seeds.includes(3);
          const isLowerGame = seeds.includes(4) || seeds.includes(5);

          if (isTopGame && !bracket.r1['3v6']) bracket.r1['3v6'] = game;
          else if (isLowerGame && !bracket.r1['4v5']) bracket.r1['4v5'] = game;
          else spare.r1.push(game);
        }
        break;
    }
  }

  // Anything the seeds could not place takes the first empty slot of its round.
  for (const game of spare.byes) {
    if (!bracket.byes[1]) bracket.byes[1] = game;
    else if (!bracket.byes[2]) bracket.byes[2] = game;
  }
  for (const game of spare.r1) {
    if (!bracket.r1['3v6']) bracket.r1['3v6'] = game;
    else if (!bracket.r1['4v5']) bracket.r1['4v5'] = game;
  }
  for (const game of spare.semis) {
    if (!bracket.semis.semi1) bracket.semis.semi1 = game;
    else if (!bracket.semis.semi2) bracket.semis.semi2 = game;
  }

  return bracket;
}

export default {
  PLAYOFF_RESEED_YEAR,
  PLAYOFF_FIELD_SIZE,
  BYE_COUNT,
  usesSeededPlayoffs,
  compareStandings,
  sortByStandings,
  computeSeeds,
  playoffFieldInSeedOrder,
  reseedSemis,
  organizeSeededBracket
};
