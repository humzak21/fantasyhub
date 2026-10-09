/**
 * Matchup facts: one push a day, at noon in the season's zone, with the most
 * unusual true thing the league's data can say about a member's week — about
 * them, about the franchise they play, or about the two of them.
 *
 * Pure, like the rest of `notificationPlanner.js`'s family: the sender
 * (`scripts/send-notifications.js --matchups`) reads the league once, and
 * everything else happens here.
 *
 * Rules that are load-bearing:
 *
 * - **Many candidates, the rarest one sent.** Every family below turns a
 *   comparison into a fact with a `score` for how unusual it is — 1st of 90
 *   team-seasons beats 6th, a first-ever streak beats a common one. Each day
 *   the highest-scoring fact the member has not been sent goes out.
 * - **Three subjects.** `self` facts are about the recipient and are honest:
 *   a best start and a worst start are both said. `opponent` facts are about
 *   this week's opponent and are only ever unflattering. `rivalry` facts are
 *   head-to-head, and are offered only to the side they flatter. The two
 *   members of a matchup therefore get different facts.
 * - **Nothing repeats.** An identical sentence is never sent to a member
 *   twice, and a family is not sent to them again for
 *   `FAMILY_COOLDOWN_DAYS`. Consecutive days avoid the same subject where a
 *   close alternative exists. The history is `matchup_fact_log`.
 * - **Every number is the league's own.** Games (`v_game_results`), teams,
 *   lineups (`team_week_lineups`), player weeks and pickups. A fact that needs
 *   data the league does not have is not offered, never filled with a zero.
 * - **"Through W weeks" compares like with like.** W is the active season's
 *   last scored regular-season week, and every other team-season is cut at
 *   the same week number.
 * - **Names, never pronouns.** The recipient is "you"; anybody else is their
 *   owner's first name (the full name if two current owners share it).
 */

import { ownerKey } from '../utils/ownerAliases.js';

export const MATCHUP_FACTS_TOPIC = 'matchup_facts';

/** Noon, in the season's zone. pg_cron fires at 16:00 and 17:00 UTC; one of them is noon. */
export const MATCHUP_FACT_HOUR = 12;

/** A family (a kind of fact) is not sent to the same member again for this long. */
export const FAMILY_COOLDOWN_DAYS = 21;

/**
 * How much a fact loses for each of the member's last `RECENT_SENDS` facts
 * that had the same subject, so a week mixes you, them and the rivalry.
 */
const SAME_SUBJECT_PENALTY = 12;
const RECENT_SENDS = 4;

const WEEKDAY_KEYS = ['tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'mon'];

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Points to one decimal; a margin under one point to two, so 0.04 is not "0.0". */
export function pts(value) {
  const abs = Math.abs(value);
  return value.toFixed(abs > 0 && abs < 1 ? 2 : 1);
}

export function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

const record = (w, l, t = 0) => (t ? `${w}-${l}-${t}` : `${w}-${l}`);

const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

const pct = (value) => `${Math.round(value * 100)}%`;

function listYears(years) {
  if (years.length <= 1) return String(years[0] ?? '');
  return `${years.slice(0, -1).join(', ')} and ${years[years.length - 1]}`;
}

const ROUND_NAMES = {
  playoff_first_round: 'first round',
  playoff_semifinals: 'semifinals',
  playoff_championship: 'championship'
};

/** "2023 week 9", or "the 2023 semifinals" for a bracket game. */
function when(game) {
  const round = ROUND_NAMES[game.type];
  return round ? `the ${game.year} ${round}` : `${game.year} week ${game.week}`;
}

/** 1-based rank of `value` among `values`, largest first (ties share the better rank). */
const rankDesc = (values, value) => values.filter((v) => v > value).length + 1;
const rankAsc = (values, value) => values.filter((v) => v < value).length + 1;

// ---------------------------------------------------------------------------
// The league, indexed once
// ---------------------------------------------------------------------------

/** A franchise across seasons: `franchise_id`, or the owner when a row has none. */
export const franchiseKeyOf = (team) =>
  team.franchiseId ?? (ownerKey(team.owner) ? `owner:${ownerKey(team.owner)}` : `team:${team.id}`);

const isPlayed = (row) =>
  Number.isFinite(row.pointsFor) && Number.isFinite(row.pointsAgainst) && ['W', 'L', 'T'].includes(row.result);

const sumBy = (rows, pick) => rows.reduce((sum, row) => sum + pick(row), 0);

/**
 * @param {object} input
 * @param {Array<{ id: string, year: number, isCompleted: boolean }>} input.seasons
 * @param {Array<{ id: string, seasonId: string, franchiseId: string|null, owner: string,
 *   madePlayoffs?: boolean|null, playoffFinish?: string|null, finalRank?: number|null }>} input.teams
 * @param {Array<{ seasonId: string, week: number, type: string, isPlayoff: boolean, isConsolation: boolean,
 *   teamId: string, opponentId: string, pointsFor: number|null, pointsAgainst: number|null,
 *   result: string|null }>} input.results one row per team per game
 * @param {Array<{ seasonId: string, week: number, teamId: string, starterPoints: number,
 *   optimalPoints: number, benchPoints: number }>} [input.lineups]
 * @param {Array<{ week: number, teamId: string, espnPlayerId: number, name: string|null,
 *   started: boolean, points: number|null }>} [input.playerWeeks] the active season's
 * @param {Array<{ type: string, week: number, espnPlayerIds: number[], from: (string|null)[],
 *   to: (string|null)[] }>} [input.pickups] the active season's adds (franchise ids)
 * @param {string} input.currentSeasonId
 */
export function indexLeague({
  seasons = [],
  teams = [],
  results = [],
  lineups = [],
  playerWeeks = [],
  pickups = [],
  currentSeasonId
}) {
  const seasonById = new Map(seasons.map((s) => [s.id, s]));
  const franchiseOfTeam = new Map(teams.map((t) => [t.id, franchiseKeyOf(t)]));

  // Each franchise's seasons, oldest first.
  const seasonsByFranchise = new Map();
  for (const team of teams) {
    const season = seasonById.get(team.seasonId);
    if (!season) continue;
    const key = franchiseKeyOf(team);
    if (!seasonsByFranchise.has(key)) seasonsByFranchise.set(key, []);
    seasonsByFranchise.get(key).push({ ...team, year: season.year, isCompleted: Boolean(season.isCompleted) });
  }
  for (const list of seasonsByFranchise.values()) list.sort((a, b) => a.year - b.year);

  // Every played game from each franchise's side, oldest first.
  const gamesByFranchise = new Map();
  for (const row of results) {
    if (!isPlayed(row)) continue;
    const season = seasonById.get(row.seasonId);
    const me = franchiseOfTeam.get(row.teamId);
    const them = franchiseOfTeam.get(row.opponentId);
    if (!season || !me || !them) continue;
    if (!gamesByFranchise.has(me)) gamesByFranchise.set(me, []);
    gamesByFranchise.get(me).push({
      seasonId: row.seasonId,
      year: season.year,
      week: row.week,
      type: row.type,
      phase: row.isPlayoff ? 'playoff' : row.isConsolation ? 'consolation' : 'regular',
      opponent: them,
      pf: row.pointsFor,
      pa: row.pointsAgainst,
      result: row.result
    });
  }
  for (const list of gamesByFranchise.values()) list.sort((a, b) => (a.year - b.year) || (a.week - b.week));

  // Regular-season games per team-season, and each week's field.
  const regular = new Map(); // `${seasonId}|${franchise}` → games by week
  const weekScores = new Map(); // `${seasonId}:${week}` → [{ franchise, pf }]
  const regularScores = [];
  for (const [key, games] of gamesByFranchise) {
    for (const game of games) {
      if (game.phase !== 'regular') continue;
      const ts = `${game.seasonId}|${key}`;
      if (!regular.has(ts)) regular.set(ts, []);
      regular.get(ts).push(game);
      regularScores.push(game.pf);
      const wk = `${game.seasonId}:${game.week}`;
      if (!weekScores.has(wk)) weekScores.set(wk, []);
      weekScores.get(wk).push({ franchise: key, pf: game.pf });
    }
  }
  regularScores.sort((a, b) => a - b);

  const currentWeeks = [...regular.entries()]
    .filter(([ts]) => ts.startsWith(`${currentSeasonId}|`))
    .flatMap(([, games]) => games.map((g) => g.week));
  const playedWeek = currentWeeks.length ? Math.max(...currentWeeks) : 0;

  // Names: the owner as of the franchise's latest season; first names unless
  // two franchises in the current season would share one.
  const latestOwner = new Map();
  for (const [key, list] of seasonsByFranchise) latestOwner.set(key, list[list.length - 1].owner?.trim() || 'Somebody');
  const currentKeys = teams.filter((t) => t.seasonId === currentSeasonId).map(franchiseKeyOf);
  const firstOf = (owner) => owner.split(/\s+/)[0];
  const firstCounts = new Map();
  for (const key of currentKeys) {
    const first = firstOf(latestOwner.get(key) ?? '');
    firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
  }
  const names = new Map();
  for (const [key, owner] of latestOwner) {
    const first = firstOf(owner);
    names.set(key, (firstCounts.get(first) ?? 0) > 1 ? owner : first);
  }

  const teamsInSeason = new Map();
  for (const team of teams) teamsInSeason.set(team.seasonId, (teamsInSeason.get(team.seasonId) ?? 0) + 1);

  // Lineups: `${seasonId}|${franchise}` → week → row.
  const lineupsByTeamSeason = new Map();
  for (const row of lineups) {
    const key = franchiseOfTeam.get(row.teamId);
    if (!key || !Number.isFinite(row.optimalPoints)) continue;
    const ts = `${row.seasonId}|${key}`;
    if (!lineupsByTeamSeason.has(ts)) lineupsByTeamSeason.set(ts, new Map());
    lineupsByTeamSeason.get(ts).set(row.week, row);
  }

  // The active season's started players, per franchise.
  const startersByFranchise = new Map();
  for (const row of playerWeeks) {
    const key = franchiseOfTeam.get(row.teamId);
    if (!key || !row.started || !Number.isFinite(row.points)) continue;
    if (!startersByFranchise.has(key)) startersByFranchise.set(key, []);
    startersByFranchise.get(key).push(row);
  }

  // The active season's free-agent and waiver adds, per franchise.
  const addsByFranchise = new Map();
  for (const event of pickups) {
    if (event.type !== 'WAIVER' && event.type !== 'FREEAGENT') continue;
    (event.espnPlayerIds ?? []).forEach((playerId, i) => {
      const to = event.to?.[i];
      if (!to || event.from?.[i] || !playerId) return;
      if (!addsByFranchise.has(to)) addsByFranchise.set(to, []);
      addsByFranchise.get(to).push({ espnPlayerId: playerId, week: event.week });
    });
  }

  return {
    currentSeasonId,
    seasonById,
    franchiseOfTeam,
    seasonsByFranchise,
    gamesByFranchise,
    regular,
    weekScores,
    regularScores,
    playedWeek,
    names,
    teamsInSeason,
    lineupsByTeamSeason,
    hasLineups: lineups.length > 0,
    startersByFranchise,
    hasPlayerWeeks: playerWeeks.length > 0,
    addsByFranchise,
    hasPickups: pickups.length > 0
  };
}

const nameOf = (index, key) => index.names.get(key) ?? 'Somebody';

/** How a sentence refers to its subject: "you" for the recipient, a name otherwise. */
function voiceOf(index, key, you) {
  if (you) {
    return { you, Name: 'You', name: 'you', Poss: 'Your', poss: 'your', Is: "You're", Has: "You've", like: 'like you' };
  }
  const n = nameOf(index, key);
  return { you, Name: n, name: n, Poss: `${n}'s`, poss: `${n}'s`, Is: `${n} is`, Has: `${n} has`, like: `like ${n}` };
}

// ---------------------------------------------------------------------------
// Facts about one franchise's season, either voice
// ---------------------------------------------------------------------------

/** Every franchise's regular-season games of one season, cut at `week`. */
function teamSeasonsThrough(index, week) {
  const out = [];
  for (const [ts, games] of index.regular) {
    const [seasonId, franchise] = ts.split('|');
    const cut = games.filter((g) => g.week <= week);
    // A team-season that had not played `week` games by then is not comparable.
    if (cut.length < week) continue;
    out.push({ seasonId, franchise, games: cut, pf: sumBy(cut, (g) => g.pf) });
  }
  return out;
}

const trailingRun = (values, holds) => {
  let n = 0;
  for (let i = values.length - 1; i >= 0 && holds(values[i], i); i -= 1) n += 1;
  return n;
};

/**
 * Season facts about `subject`, in its voice. Each carries `good`: true (it
 * flatters the subject), false (it does not), or null (neither — offered
 * only in the recipient's own voice).
 */
function seasonFacts(index, subject, v) {
  const facts = [];
  const add = (family, score, good, text, extra = {}) => facts.push({ family, score, good, text, ...extra });

  const W = index.playedWeek;
  const cur = index.regular.get(`${index.currentSeasonId}|${subject}`) ?? [];
  if (!cur.length) return facts;
  const w = cur.filter((g) => g.result === 'W').length;
  const l = cur.filter((g) => g.result === 'L').length;
  const t = cur.length - w - l;
  const myPf = sumBy(cur, (g) => g.pf);

  // --- Through W weeks: against your own seasons, and against everyone's ----
  if (W >= 2 && cur.length === W) {
    const all = teamSeasonsThrough(index, W);
    const own = all.filter((row) => row.franchise === subject && row.seasonId !== index.currentSeasonId);
    if (own.length >= 2) {
      const best = own.reduce((b, row) => (row.pf > b.pf ? row : b));
      const worst = own.reduce((b, row) => (row.pf < b.pf ? row : b));
      const year = (row) => index.seasonById.get(row.seasonId)?.year;
      const seasons = own.length + 1;
      if (myPf > best.pf) {
        add('start-own', 70 + 2 * seasons, true,
          `${v.Poss} ${pts(myPf)} points through ${W} weeks ${v.you ? 'are your' : `are ${v.poss}`} best start in ${seasons} seasons (previous best: ${pts(best.pf)} in ${year(best)}).`);
      } else if (myPf < worst.pf) {
        add('start-own', 70 + 2 * seasons, false,
          `${v.Poss} ${pts(myPf)} points through ${W} weeks ${v.you ? 'are your' : `are ${v.poss}`} worst start in ${seasons} seasons (previous low: ${pts(worst.pf)} in ${year(worst)}).`);
      }
    }

    // Where this start ranks among your own, when it is neither end.
    if (own.length >= 2 && myPf <= own.reduce((m, r) => Math.max(m, r.pf), -Infinity)
      && myPf >= own.reduce((m, r) => Math.min(m, r.pf), Infinity)) {
      const seasons = own.length + 1;
      const r = rankDesc(own.map((row) => row.pf), myPf);
      const fromTop = r <= seasons / 2;
      const place = fromTop ? r : seasons - r + 1;
      add('start-own-rank', 42 + 4 * (seasons - place), fromTop,
        `${v.Poss} ${pts(myPf)} points through ${W} weeks ${v.you ? 'are your' : `are ${v.poss}`} ${ordinal(place)}-${fromTop ? 'best' : 'worst'} start in ${seasons} seasons.`);
    }

    // Record through W against your own seasons: the best (or worst) since when.
    const ownRecords = own
      .map((row) => ({ year: index.seasonById.get(row.seasonId)?.year, wins: row.games.filter((g) => g.result === 'W').length }))
      .sort((a, b) => b.year - a.year);
    if (ownRecords.length >= 2) {
      const lastAsGood = ownRecords.find((r) => r.wins >= w);
      const lastAsBad = ownRecords.find((r) => r.wins <= w);
      if (!lastAsGood) {
        add('record-own', 72, true, `${v.Poss} ${record(w, l, t)} start is ${v.you ? 'your' : `${v.poss}`} best through ${W} weeks in ${ownRecords.length + 1} seasons.`);
      } else if (!lastAsBad) {
        add('record-own', 72, false, `${v.Poss} ${record(w, l, t)} start is ${v.you ? 'your' : `${v.poss}`} worst through ${W} weeks in ${ownRecords.length + 1} seasons.`);
      } else if (lastAsGood.year < ownRecords[0].year && w > l) {
        add('record-own', 52 + 4 * (ownRecords[0].year - lastAsGood.year), true,
          `${v.Poss} ${record(w, l, t)} start is ${v.you ? 'your' : `${v.poss}`} best through ${W} weeks since ${lastAsGood.year}.`);
      } else if (lastAsBad.year < ownRecords[0].year && l > w) {
        add('record-own', 52 + 4 * (ownRecords[0].year - lastAsBad.year), false,
          `${v.Poss} ${record(w, l, t)} start is ${v.you ? 'your' : `${v.poss}`} worst through ${W} weeks since ${lastAsBad.year}.`);
      }
    }

    const pfs = all.map((row) => row.pf);
    const top = rankDesc(pfs, myPf);
    const bottom = rankAsc(pfs, myPf);
    if (pfs.length >= 20 && top > 5 && bottom > 5) {
      const extremity = Math.abs(top - (pfs.length + 1) / 2) / (pfs.length / 2);
      add('start-league-rank', 35 + 25 * extremity, top < bottom,
        `${v.Poss} ${pts(myPf)} points through ${W} weeks rank ${ordinal(top)} of ${pfs.length} team-seasons in league history.`);
    }
    if (pfs.length >= 20 && top <= 5) {
      add('start-league', 97 - 6 * (top - 1), true,
        `${v.Poss} ${pts(myPf)} points through ${W} weeks ${top === 1 ? 'are the most' : `are the ${ordinal(top)}-most`} by anyone through ${W} weeks in league history.`);
    } else if (pfs.length >= 20 && bottom <= 5) {
      add('start-league', 97 - 6 * (bottom - 1), false,
        `${v.Poss} ${pts(myPf)} points through ${W} weeks ${bottom === 1 ? 'are the fewest' : `are the ${ordinal(bottom)}-fewest`} by anyone through ${W} weeks in league history.`);
    }

    // What became of every finished team-season that started the same way.
    const sameStart = all.filter((row) => {
      const season = index.seasonById.get(row.seasonId);
      if (!season?.isCompleted) return false;
      const rw = row.games.filter((g) => g.result === 'W').length;
      const rl = row.games.filter((g) => g.result === 'L').length;
      return rw === w && rl === l;
    });
    const outcomes = sameStart
      .map((row) => (index.seasonsByFranchise.get(row.franchise) ?? []).find((s) => s.seasonId === row.seasonId))
      .filter((s) => typeof s?.madePlayoffs === 'boolean');
    if (outcomes.length >= 4) {
      const made = outcomes.filter((s) => s.madePlayoffs).length;
      const champs = outcomes.filter((s) => s.playoffFinish === 'champion').length;
      const rate = made / outcomes.length;
      const extremity = Math.abs(rate - 0.5) * 2;
      const tail = champs && rate >= 0.5 ? `, and ${champs} won it all` : '';
      const text = `Teams that started ${record(w, l, t)}, ${v.like}, made the playoffs ${made} of ${outcomes.length} times${tail}.`;
      if (rate >= 0.75) add('start-odds', 55 + 35 * extremity, true, text);
      else if (rate <= 0.25) add('start-odds', 55 + 35 * extremity, false, text);
    }
  }

  // --- Against your own career ---------------------------------------------
  const career = (index.gamesByFranchise.get(subject) ?? [])
    .filter((g) => g.phase === 'regular' && g.seasonId !== index.currentSeasonId);
  if (career.length >= 14 && cur.length >= 2) {
    const careerAvg = sumBy(career, (g) => g.pf) / career.length;
    const seasonAvg = myPf / cur.length;
    const diff = seasonAvg - careerAvg;
    if (Math.abs(diff) >= 3) {
      add('avg-vs-career', 42 + Math.min(30, Math.abs(diff) * 1.5), diff > 0,
        `${v.Is} averaging ${pts(seasonAvg)} a week this season, ${pts(Math.abs(diff))} ${diff > 0 ? 'more' : 'fewer'} than ${v.poss} career average.`);
    }

    const allScores = [...career, ...cur].map((g) => g.pf);
    const bestGame = cur.reduce((b, g) => (g.pf > b.pf ? g : b));
    const worstGame = cur.reduce((b, g) => (g.pf < b.pf ? g : b));
    const bestRank = rankDesc(allScores, bestGame.pf);
    const worstRank = rankAsc(allScores, worstGame.pf);
    if (bestRank <= 10) {
      add('career-game', 70 - 3 * bestRank, true,
        `${v.Poss} ${pts(bestGame.pf)} in week ${bestGame.week} is ${v.you ? 'your' : v.poss} ${bestRank === 1 ? 'best' : `${ordinal(bestRank)}-best`} score in ${allScores.length} regular-season games.`,
        { game: bestGame });
    } else if (worstRank <= 10) {
      add('career-game', 70 - 3 * worstRank, false,
        `${v.Poss} ${pts(worstGame.pf)} in week ${worstGame.week} is ${v.you ? 'your' : v.poss} ${worstRank === 1 ? 'lowest' : `${ordinal(worstRank)}-lowest`} score in ${allScores.length} regular-season games.`,
        { game: worstGame });
    }
  }

  // --- Week-to-week shape -------------------------------------------------
  const scores = cur.map((g) => g.pf);
  if (cur.length >= 3) {
    const spread = Math.max(...scores) - Math.min(...scores);
    const spreads = [...index.regular.entries()]
      .filter(([ts, games]) => ts.startsWith(`${index.currentSeasonId}|`) && games.length >= 3)
      .map(([, games]) => Math.max(...games.map((g) => g.pf)) - Math.min(...games.map((g) => g.pf)));
    if (spreads.length >= 4 && rankAsc(spreads, spread) === 1) {
      add('consistency', 56, null,
        `${v.Poss} weekly scores have stayed within ${pts(spread)} points of each other, the steadiest in the league.`);
    } else if (spreads.length >= 4 && rankDesc(spreads, spread) === 1) {
      add('consistency', 56, null,
        `${v.Poss} weekly scores have swung by ${pts(spread)} points, the widest range in the league.`);
    }
  }
  const rising = trailingRun(scores, (s, i) => i > 0 && s > scores[i - 1]);
  const falling = trailingRun(scores, (s, i) => i > 0 && s < scores[i - 1]);
  const run = Math.max(rising, falling);
  if (run >= 3) {
    const up = rising >= 3;
    const path = scores.slice(-(run + 1)).map(pts).join(' → ');
    // When this franchise last did it.
    let last = null;
    for (const [ts, games] of index.regular) {
      const [seasonId, franchise] = ts.split('|');
      if (franchise !== subject || seasonId === index.currentSeasonId) continue;
      let r = 0;
      for (let i = 1; i < games.length; i += 1) {
        r = (up ? games[i].pf > games[i - 1].pf : games[i].pf < games[i - 1].pf) ? r + 1 : 0;
        if (r >= run) last = Math.max(last ?? 0, games[i].year);
      }
    }
    const since = last ? `, first time since ${last}` : (index.seasonsByFranchise.get(subject)?.length ?? 0) > 1 ? ', a first' : '';
    add(up ? 'trend-up' : 'trend-down', 58 + 7 * run + (since === ', a first' ? 10 : 0), up,
      `${v.Poss} score has gone ${up ? 'up' : 'down'} ${run} weeks in a row (${path})${since}.`);
  }

  const averages = cur.map((g) => {
    const field = index.weekScores.get(`${g.seasonId}:${g.week}`) ?? [];
    return field.length ? sumBy(field, (r) => r.pf) / field.length : null;
  });
  const above = trailingRun(cur, (g, i) => averages[i] != null && g.pf > averages[i]);
  const below = trailingRun(cur, (g, i) => averages[i] != null && g.pf < averages[i]);
  if (above >= 3) {
    add('vs-average', 50 + 7 * above, true, `${v.Has} beaten the league average ${above} weeks running.`);
  } else if (below >= 3) {
    add('vs-average', 50 + 7 * below, false, `${v.Has} been under the league average ${below} weeks straight.`);
  }

  if (cur.length >= 3) {
    const ranks = cur.slice(-3).map((g) =>
      rankDesc((index.weekScores.get(`${g.seasonId}:${g.week}`) ?? []).map((r) => r.pf), g.pf));
    const [a, b, c] = ranks;
    if ((a > b && b > c && a - c >= 6) || (a < b && b < c && c - a >= 6)) {
      const better = c < a;
      add('weekly-rank', 66, better,
        `${v.Has} finished ${ordinal(a)}, ${ordinal(b)} and ${ordinal(c)} in weekly scoring the last three weeks.`);
    }
  }

  // --- Luck and the margins -------------------------------------------------
  if (cur.length >= 3) {
    let expected = 0;
    for (const g of cur) {
      const field = index.weekScores.get(`${g.seasonId}:${g.week}`) ?? [];
      if (field.length < 2) continue;
      const beaten = field.filter((r) => r.franchise !== subject && r.pf < g.pf).length
        + field.filter((r) => r.franchise !== subject && r.pf === g.pf).length / 2;
      expected += beaten / (field.length - 1);
    }
    const luck = (w + t / 2) - expected;
    const shape = `${expected.toFixed(1)}-${(cur.length - expected).toFixed(1)}`;
    if (luck >= 1) {
      add('luck', 55 + 10 * luck, false,
        `${v.Is} ${record(w, l, t)}, but scored like a ${shape} team. That's luck.`);
    } else if (luck <= -1) {
      add('luck', 55 - 10 * luck, true,
        `${v.Is} ${record(w, l, t)}, but scored like a ${shape} team. The record is lying.`);
    }
  }

  const close = cur.filter((g) => Math.abs(g.pf - g.pa) <= 5 && g.result !== 'T');
  if (close.length >= 2) {
    const cw = close.filter((g) => g.result === 'W').length;
    if (cw === close.length || cw === 0) {
      add('close-season', 55 + 6 * close.length, cw > 0,
        `${v.Is} ${record(cw, close.length - cw)} in games decided by 5 points or fewer this season.`);
    }
  }

  // --- This season against the league -------------------------------------
  const seasonRows = [...index.regular.entries()]
    .filter(([ts]) => ts.startsWith(`${index.currentSeasonId}|`))
    .map(([ts, games]) => ({ franchise: ts.split('|')[1], pf: sumBy(games, (g) => g.pf), pa: sumBy(games, (g) => g.pa) }));
  if (seasonRows.length >= 4 && cur.length >= 2) {
    const pfRankTop = rankDesc(seasonRows.map((r) => r.pf), myPf);
    const pfRankBottom = rankAsc(seasonRows.map((r) => r.pf), myPf);
    if (pfRankTop <= 2) {
      add('season-points', 62 - 6 * (pfRankTop - 1), true,
        `${v.Has} scored the ${pfRankTop === 1 ? 'most' : '2nd-most'} points in the league this season (${pts(myPf)}).`);
    } else if (pfRankBottom <= 2) {
      add('season-points', 62 - 6 * (pfRankBottom - 1), false,
        `${v.Has} scored the ${pfRankBottom === 1 ? 'fewest' : '2nd-fewest'} points in the league this season (${pts(myPf)}).`);
    }
    const myPa = sumBy(cur, (g) => g.pa);
    if (rankDesc(seasonRows.map((r) => r.pa), myPa) === 1) {
      add('season-against', 58, null,
        `Opponents have scored ${pts(myPa)} against ${v.name} this season, the most in the league.`);
    }
  }

  const best = cur.reduce((b, g) => (g.pf > b.pf ? g : b));
  const worst = cur.reduce((b, g) => (g.pf < b.pf ? g : b));
  const fieldOf = (g) => index.weekScores.get(`${g.seasonId}:${g.week}`) ?? [];
  if (fieldOf(best).length > 2 && fieldOf(best).every((r) => r.franchise === subject || r.pf < best.pf)) {
    add('week-high', 56, true, `${v.Poss} ${pts(best.pf)} in week ${best.week} was the highest score in the league that week.`, { game: best });
  }
  if (fieldOf(worst).length > 2 && fieldOf(worst).every((r) => r.franchise === subject || r.pf > worst.pf)) {
    add('week-low', 60, false, `${v.Poss} ${pts(worst.pf)} in week ${worst.week} was the lowest score in the league that week.`, { game: worst });
  }

  // --- The coming week's number, all-time ----------------------------------
  const nextWeek = W + 1;
  const sameWeek = (index.gamesByFranchise.get(subject) ?? [])
    .filter((g) => g.phase === 'regular' && g.week === nextWeek && g.seasonId !== index.currentSeasonId);
  if (sameWeek.length >= 4) {
    const sw = sameWeek.filter((g) => g.result === 'W').length;
    const sl = sameWeek.filter((g) => g.result === 'L').length;
    if (Math.abs(sw - sl) >= 3) {
      add('week-number', 48 + 6 * Math.abs(sw - sl), sw > sl, `${v.Is} ${record(sw, sl)} all-time in week ${nextWeek}.`);
    }
  }

  // --- Lineups -------------------------------------------------------------
  const lineups = index.lineupsByTeamSeason.get(`${index.currentSeasonId}|${subject}`);
  if (lineups?.size) {
    const rows = [...lineups.values()];
    const benchiest = rows.reduce((b, r) => (r.benchPoints > b.benchPoints ? r : b));
    const weekRows = [...index.lineupsByTeamSeason.entries()]
      .filter(([ts]) => ts.startsWith(`${index.currentSeasonId}|`))
      .map(([, byWeek]) => byWeek.get(benchiest.week))
      .filter(Boolean);
    if (benchiest.benchPoints >= 25 && weekRows.length > 2 && weekRows.every((r) => r === benchiest || r.benchPoints < benchiest.benchPoints)) {
      add('bench-week', 60, false,
        `${v.Has} left ${pts(benchiest.benchPoints)} points on the bench in week ${benchiest.week}, the most in the league that week.`);
    }

    const efficiency = (byWeek) => {
      const list = [...byWeek.values()];
      const optimal = sumBy(list, (r) => r.optimalPoints);
      return optimal > 0 ? sumBy(list, (r) => r.starterPoints) / optimal : null;
    };
    const league = [...index.lineupsByTeamSeason.entries()]
      .filter(([ts]) => ts.startsWith(`${index.currentSeasonId}|`))
      .map(([, byWeek]) => efficiency(byWeek))
      .filter((e) => e != null);
    const mine = efficiency(lineups);
    if (mine != null && league.length >= 4) {
      if (rankDesc(league, mine) === 1) {
        add('efficiency', 64, true,
          `${v.Poss} lineups have scored ${pct(mine)} of ${v.poss} best possible points this season, best in the league.`);
      } else if (rankAsc(league, mine) === 1) {
        add('efficiency', 64, false,
          `${v.Poss} lineups have left ${pct(1 - mine)} of ${v.poss} possible points on the bench this season, worst in the league.`);
      }
    }

    const benchTotals = [...index.lineupsByTeamSeason.entries()]
      .filter(([ts]) => ts.startsWith(`${index.currentSeasonId}|`))
      .map(([, byWeek]) => sumBy([...byWeek.values()], (r) => r.benchPoints));
    const myBench = sumBy(rows, (r) => r.benchPoints);
    const benchRank = rankDesc(benchTotals, myBench);
    if (benchTotals.length >= 4 && benchRank <= 3) {
      add('bench-total', 58 - 4 * (benchRank - 1), false,
        `${v.Has} left ${pts(myBench)} points on the bench this season, the ${benchRank === 1 ? 'most' : `${ordinal(benchRank)}-most`} in the league.`);
    }
  }

  // --- Players --------------------------------------------------------------
  const starters = index.startersByFranchise.get(subject) ?? [];
  if (starters.length) {
    const byPlayer = new Map();
    for (const row of starters) {
      const p = byPlayer.get(row.espnPlayerId) ?? { name: row.name, points: 0, weeks: new Set() };
      p.points += row.points;
      p.weeks.add(row.week);
      byPlayer.set(row.espnPlayerId, p);
    }
    const total = sumBy(starters, (r) => r.points);
    const star = [...byPlayer.values()].reduce((b, p) => (p.points > b.points ? p : b));
    if (star.name && total > 0 && star.points / total >= 0.18) {
      add('star-share', 52 + 60 * (star.points / total - 0.2), null,
        `${star.name} has scored ${pct(star.points / total)} of ${v.poss} starters' points this season.`);
    }

    // The best game any of the subject's starters has had, against the league's.
    const bestRow = starters.reduce((b, r) => (r.points > b.points ? r : b));
    const leagueGames = [...index.startersByFranchise.values()].flat().map((r) => r.points);
    const gameRank = rankDesc(leagueGames, bestRow.points);
    if (bestRow.name && gameRank <= 10) {
      add('player-game', 66 - 3 * gameRank, true,
        `${bestRow.name}'s ${pts(bestRow.points)} in week ${bestRow.week} for ${v.name} is the ${gameRank === 1 ? 'best' : `${ordinal(gameRank)}-best`} game by any starter in the league this season.`);
    } else if (bestRow.name) {
      add('player-game', 38, null,
        `${bestRow.name}'s ${pts(bestRow.points)} in week ${bestRow.week} is the most any of ${v.poss} starters has scored this season.`);
    }

    // Who was the team's top scorer each week.
    const weeks = new Map();
    for (const row of starters) {
      const top = weeks.get(row.week);
      if (!top || row.points > top.points) weeks.set(row.week, row);
    }
    const tops = new Map();
    for (const row of weeks.values()) tops.set(row.espnPlayerId, (tops.get(row.espnPlayerId) ?? 0) + 1);
    const [topId, topWeeks] = [...tops.entries()].reduce((b, e) => (e[1] > b[1] ? e : b), [null, 0]);
    const topName = byPlayer.get(topId)?.name;
    if (topName && weeks.size >= 3 && topWeeks >= 3 && topWeeks / weeks.size >= 0.6) {
      add('top-scorer', 50 + 5 * topWeeks, null,
        `${topName} has been ${v.poss} top scorer in ${topWeeks} of ${weeks.size} weeks.`);
    }
  }

  // --- Pickups --------------------------------------------------------------
  if (index.hasPickups && index.hasPlayerWeeks) {
    const pickupPoints = (franchise) => {
      const adds = index.addsByFranchise.get(franchise) ?? [];
      const rows = index.startersByFranchise.get(franchise) ?? [];
      return sumBy(rows.filter((r) => adds.some((a) => a.espnPlayerId === r.espnPlayerId && r.week >= a.week)), (r) => r.points);
    };
    const keys = [...new Set([...index.regular.keys()]
      .filter((ts) => ts.startsWith(`${index.currentSeasonId}|`))
      .map((ts) => ts.split('|')[1]))];
    const all = keys.map(pickupPoints);
    const mine = pickupPoints(subject);
    if (keys.length >= 4 && mine > 0 && rankDesc(all, mine) === 1) {
      add('pickups', 63, true,
        `${v.Poss} waiver and free-agent pickups have scored ${pts(mine)} points in ${v.poss} lineup, the most in the league.`);
    } else if (keys.length >= 4 && rankAsc(all, mine) === 1 && W >= 3) {
      add('pickups', 63, false,
        `${v.Poss} waiver and free-agent pickups have scored ${pts(mine)} points in ${v.poss} lineup all season, the fewest in the league.`);
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Facts about the opponent's whole history (always unflattering)
// ---------------------------------------------------------------------------

function careerFacts(index, them, me) {
  const O = nameOf(index, them);
  const facts = [];
  const add = (family, score, text, extra = {}) => facts.push({ family, score, good: false, text, ...extra });
  const theirGames = index.gamesByFranchise.get(them) ?? [];
  const completed = (index.seasonsByFranchise.get(them) ?? []).filter((s) => s.isCompleted);

  if (completed.length) {
    const titles = completed.filter((s) => s.playoffFinish === 'champion').map((s) => s.year);
    if (!titles.length && completed.length >= 2) {
      add('titles', 65 + 3 * completed.length, `${O} has played ${completed.length} seasons in this league and won zero championships.`);
    } else if (titles.length) {
      const lastTitle = titles[titles.length - 1];
      const since = completed.filter((s) => s.year > lastTitle).length;
      if (since >= 2) add('titles', 45 + 5 * since, `${O} hasn't won a championship since ${lastTitle}.`);
    }

    const finals = completed.filter((s) => s.playoffFinish === '2nd').map((s) => s.year);
    if (finals.length) {
      add('finals-lost', 60 + 10 * finals.length, finals.length === 1
        ? `${O} lost the ${finals[0]} championship game.`
        : `${O} has lost ${finals.length} championship games (${listYears(finals)}).`);
    }

    const known = completed.filter((s) => typeof s.madePlayoffs === 'boolean');
    const missed = known.filter((s) => !s.madePlayoffs);
    if (known.length >= 2 && missed.length >= 2) {
      add('playoffs-missed', 40 + (40 * missed.length) / known.length, `${O} has missed the playoffs in ${missed.length} of ${known.length} seasons.`);
    }

    const lastPlace = completed
      .filter((s) => Number.isFinite(s.finalRank) && s.finalRank === index.teamsInSeason.get(s.seasonId))
      .map((s) => s.year);
    if (lastPlace.length) add('last-place', 85, `${O} finished dead last in ${listYears(lastPlace)}.`);
  }

  const bracket = theirGames.filter((g) => g.phase === 'playoff');
  if (bracket.length) {
    const w = bracket.filter((g) => g.result === 'W').length;
    const l = bracket.filter((g) => g.result === 'L').length;
    if (l > w) add('playoff-record', 50 + 8 * (l - w), `${O} is ${record(w, l)} in playoff games.`);
    const firstRound = bracket.filter((g) => g.type === 'playoff_first_round' && g.result === 'L');
    if (firstRound.length >= 2) {
      add('first-round-exits', 55 + 5 * firstRound.length, `${O} has gone out in the first round of the playoffs ${times(firstRound.length)}.`);
    }
  }

  const regular = theirGames.filter((g) => g.phase === 'regular');
  if (regular.length) {
    const w = regular.filter((g) => g.result === 'W').length;
    const l = regular.filter((g) => g.result === 'L').length;
    const t = regular.length - w - l;
    if (l > w) add('career-record', 55 + 3 * (l - w), `${O} is ${record(w, l, t)} all-time in the regular season.`);

    const low = regular.reduce((min, g) => (g.pf < min.pf ? g : min));
    const rank = rankAsc(index.regularScores, low.pf);
    add('career-low', rank <= 10 ? 95 - 3 * rank : 45, rank === 1
      ? `${O} owns the lowest score in league history: ${pts(low.pf)} in ${when(low)}.`
      : rank <= 10
        ? `${O}'s ${pts(low.pf)} in ${when(low)} is the ${ordinal(rank)}-lowest score in league history.`
        : `${O}'s lowest score ever: ${pts(low.pf)} in ${when(low)}.`, { game: low });

    const losses = regular.filter((g) => g.result === 'L');
    const worst = losses.reduce((max, g) => (!max || g.pa - g.pf > max.pa - max.pf ? g : max), null);
    if (worst && worst.pa - worst.pf >= 25) {
      const margin = worst.pa - worst.pf;
      const byMe = worst.opponent === me;
      add('worst-loss', 45 + margin / 3 + (byMe ? 20 : 0),
        `${O}'s worst beating ever: lost by ${pts(margin)} to ${byMe ? 'you' : nameOf(index, worst.opponent)} in ${when(worst)}.`, { game: worst });
    }

    let longest = null;
    let run = 0;
    let prevSeason = null;
    for (const g of regular) {
      if (g.seasonId !== prevSeason) run = 0;
      prevSeason = g.seasonId;
      run = g.result === 'L' ? run + 1 : 0;
      if (run > (longest?.length ?? 0)) longest = { length: run, year: g.year };
    }
    if (longest && longest.length >= 4) {
      add('losing-streak', 40 + 5 * longest.length, `${O} once lost ${longest.length} straight (${longest.year}).`);
    }

    const close = regular.filter((g) => Math.abs(g.pf - g.pa) <= 5 && g.result !== 'T');
    const cw = close.filter((g) => g.result === 'W').length;
    if (close.length >= 10 && cw / close.length <= 0.35) {
      add('close-career', 55 + 40 * (0.5 - cw / close.length), `${O} is ${record(cw, close.length - cw)} all-time in games decided by 5 points or fewer.`);
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Head to head (only to the side it flatters)
// ---------------------------------------------------------------------------

function rivalryFacts(index, me, them) {
  const O = nameOf(index, them);
  const facts = [];
  const add = (family, score, text, extra = {}) => facts.push({ family, score, good: true, text, ...extra });
  const myGames = index.gamesByFranchise.get(me) ?? [];
  const theirGames = index.gamesByFranchise.get(them) ?? [];
  const meetings = myGames.filter((g) => g.opponent === them);
  if (!meetings.length) return facts;

  const w = meetings.filter((g) => g.result === 'W').length;
  const l = meetings.filter((g) => g.result === 'L').length;
  const t = meetings.length - w - l;
  if (w > l && meetings.length >= 2) add('h2h-record', 50 + 8 * (w - l), `You're ${record(w, l, t)} all-time against ${O}.`);

  const streak = trailingRun(meetings, (g) => g.result === 'W');
  if (streak >= 2) add('h2h-streak', 60 + 8 * streak, `You've beaten ${O} ${streak} straight times.`);

  const last = meetings[meetings.length - 1];
  if (last.result === 'W' && streak < 2) {
    add('h2h-last', 55, `Last time you met, you beat ${O} ${pts(last.pf)}–${pts(last.pa)} (${when(last)}).`, { game: last });
  }

  const wins = meetings.filter((g) => g.result === 'W');
  const biggest = wins.reduce((b, g) => (!b || g.pf - g.pa > b.pf - b.pa ? g : b), null);
  if (biggest && biggest.pf - biggest.pa >= 20) {
    const margin = biggest.pf - biggest.pa;
    add('h2h-biggest-win', 40 + margin / 2,
      `Your biggest win over ${O}: ${pts(biggest.pf)}–${pts(biggest.pa)} in ${when(biggest)}, by ${pts(margin)}.`, { game: biggest });
  }

  const theirLow = wins.reduce((low, g) => (!low || g.pa < low.pa ? g : low), null);
  if (theirLow) add('h2h-their-low', 45, `${O}'s lowest score against you: ${pts(theirLow.pa)} (${when(theirLow)}).`, { game: theirLow });

  for (const g of wins.filter((game) => game.phase === 'playoff')) {
    add(`h2h-playoff`, g.type === 'playoff_championship' ? 97 : 90, g.type === 'playoff_championship'
      ? `You beat ${O} in the ${g.year} championship.`
      : `You knocked ${O} out of the ${g.year} playoffs (${ROUND_NAMES[g.type] ?? 'bracket'}).`, { game: g });
  }

  const others = theirGames.filter((g) => g.opponent !== me);
  if (meetings.length >= 3 && others.length >= 5) {
    const vsMe = sumBy(meetings, (g) => g.pa) / meetings.length;
    const vsRest = sumBy(others, (g) => g.pf) / others.length;
    const gap = vsRest - vsMe;
    if (gap >= 5) {
      add('h2h-their-average', 40 + gap * 2,
        `${O} averages ${pts(vsMe)} points against you, ${pts(gap)} fewer than against everyone else.`);
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// All of it
// ---------------------------------------------------------------------------

/**
 * Every fact worth sending `me`, strongest first: `{ key, family, subject,
 * score, text }`. `them` may be null (no game this week); then only facts
 * about `me` are offered. A second fact about the same game is dropped.
 */
export function buildMatchupFacts(index, me, them) {
  const facts = [];
  const push = (subject, fact) => facts.push({
    key: fact.text,
    family: `${subject}:${fact.family}`,
    subject,
    score: Math.max(0, Math.min(100, Math.round(fact.score))),
    text: fact.text,
    game: fact.game ? `${fact.game.seasonId}:${fact.game.week}` : null
  });

  for (const fact of seasonFacts(index, me, voiceOf(index, me, true))) push('self', fact);
  if (them) {
    for (const fact of seasonFacts(index, them, voiceOf(index, them, false))) if (fact.good === false) push('opponent', fact);
    for (const fact of careerFacts(index, them, me)) push('opponent', fact);
    for (const fact of rivalryFacts(index, me, them)) push('rivalry', fact);
  }

  const seen = new Set();
  return facts
    .sort((a, b) => (b.score - a.score) || a.key.localeCompare(b.key))
    .filter((fact) => {
      if (seen.has(fact.key)) return false;
      seen.add(fact.key);
      if (!fact.game) return true;
      const gameKey = `game:${fact.game}`;
      if (seen.has(gameKey)) return false;
      seen.add(gameKey);
      return true;
    });
}

/**
 * Today's fact for one member, given what they have been sent:
 * `[{ factKey, family, subject, sentAt: Date }]`. Never a sentence already
 * sent; a family sent within `FAMILY_COOLDOWN_DAYS` only when nothing else is
 * left; a subject the member has heard a lot of lately less likely.
 */
export function pickFact(facts, history = [], now = new Date()) {
  const sentKeys = new Set(history.map((h) => h.factKey));
  const cutoff = now.getTime() - FAMILY_COOLDOWN_DAYS * DAY_MS;
  const recentFamilies = new Set(history.filter((h) => h.sentAt.getTime() >= cutoff).map((h) => h.family));
  const recent = [...history].sort((a, b) => b.sentAt - a.sentAt).slice(0, RECENT_SENDS);

  const fresh = facts.filter((f) => !sentKeys.has(f.key));
  const pool = fresh.filter((f) => !recentFamilies.has(f.family));
  const candidates = pool.length ? pool : fresh;
  let best = null;
  let bestScore = -Infinity;
  for (const fact of candidates) {
    const score = fact.score - SAME_SUBJECT_PENALTY * recent.filter((h) => h.subject === fact.subject).length;
    if (score > bestScore) {
      best = fact;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The day's plan
// ---------------------------------------------------------------------------

/** "2026-10-13" for an instant, in a zone. */
function localDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function localHour(date, timeZone) {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date);
  return Number(hour);
}

const dayNumber = (isoDate) => Math.round(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);

/**
 * Which fantasy week and which of its days `now` is, in the season's zone.
 * Weeks start on `startDate` (a Tuesday) and run seven local days. Returns
 * null before the season or after its last week.
 */
export function matchupDay({ startDate, weekCount, timeZone }, now) {
  if (!startDate) return null;
  const elapsed = dayNumber(localDate(now, timeZone)) - dayNumber(startDate);
  if (elapsed < 0) return null;
  const week = Math.floor(elapsed / 7) + 1;
  if (weekCount && week > weekCount) return null;
  const dayIndex = elapsed % 7;
  return { week, dayIndex, dayKey: WEEKDAY_KEYS[dayIndex] };
}

/**
 * Today's matchup-fact notification, or none.
 *
 * @param {object} input
 * @param {Date} input.now
 * @param {{ id: string, startDate: string, weekCount: number, timeZone: string }} input.season
 * @param {ReturnType<typeof indexLeague>} input.index
 * @param {Array<{ teamId: string, opponentId: string|null }>} input.pairings this week's games, one row per team
 * @param {Map<string, string>} input.memberTeams user id → this season's team id
 * @param {Array<{ endpoint: string, userId: string, topics: string[] }>} input.subscriptions
 * @param {Map<string, object[]>} [input.history] user id → facts already sent (see `pickFact`)
 * @param {Set<string>} [input.sent] kinds already in notification_log for the week
 * @param {Set<string>} [input.excludedUserIds] accounts that are not approved members
 * @param {boolean} [input.atNoon] true for the cron: send only during the noon hour
 * @returns {Array<{ kind: string, week: number, recipients: object[] }>} each recipient carries its
 *   own `payload` and the `fact` it was sent
 */
export function planMatchupFactNotifications({
  now,
  season,
  index,
  pairings = [],
  memberTeams = new Map(),
  subscriptions = [],
  history = new Map(),
  sent = new Set(),
  excludedUserIds = new Set(),
  atNoon = false
}) {
  const day = matchupDay(season, now);
  if (!day) return [];
  if (atNoon && localHour(now, season.timeZone) !== MATCHUP_FACT_HOUR) return [];

  const kind = `${MATCHUP_FACTS_TOPIC}:${day.dayKey}`;
  if (sent.has(kind)) return [];

  const opponentOf = new Map(pairings.filter((p) => p.opponentId).map((p) => [p.teamId, p.opponentId]));
  const chosen = new Map(); // user id → fact, so a member's devices agree
  const recipients = [];

  for (const sub of subscriptions) {
    if (excludedUserIds.has(sub.userId) || !Array.isArray(sub.topics) || !sub.topics.includes(MATCHUP_FACTS_TOPIC)) continue;
    const teamId = memberTeams.get(sub.userId);
    const me = teamId && index.franchiseOfTeam.get(teamId);
    if (!me) continue;
    const opponentTeamId = opponentOf.get(teamId);
    const them = opponentTeamId ? index.franchiseOfTeam.get(opponentTeamId) ?? null : null;

    if (!chosen.has(sub.userId)) {
      chosen.set(sub.userId, pickFact(buildMatchupFacts(index, me, them), history.get(sub.userId) ?? [], now));
    }
    const fact = chosen.get(sub.userId);
    if (!fact) continue;

    recipients.push({
      ...sub,
      fact,
      payload: {
        title: them ? `Week ${day.week}: you vs ${nameOf(index, them)}` : `Week ${day.week}`,
        body: fact.text,
        url: '/schedule',
        tag: `matchup-fact-${season.id}-${day.week}-${day.dayKey}`
      }
    });
  }

  return recipients.length ? [{ kind, week: day.week, recipients }] : [];
}
