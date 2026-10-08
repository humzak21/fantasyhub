/**
 * Matchup facts: one push a day, at noon in the season's zone, telling each
 * member something unflattering about the franchise they play this week.
 *
 * Pure, like the rest of `notificationPlanner.js`'s family: the sender
 * (`scripts/send-notifications.js --matchups`) reads seasons, teams and
 * `v_game_results` once, and everything else happens here.
 *
 * Rules that are load-bearing:
 *
 * - **Every fact embarrasses the opponent, from the recipient's side.** A
 *   head-to-head fact is offered only when it favours the recipient ("you're
 *   6-2 against them", never "you're 2-6"); the rest are the opponent's own
 *   history — titles, playoff record, worst games, luck. The two members of a
 *   matchup get different facts about each other.
 * - **Every number is from `v_game_results` and `teams`.** A fact that needs
 *   data the league does not have is not offered, never filled with a zero.
 * - **The week's facts are ranked once and spread over its days.** Week N runs
 *   Tuesday to Monday. The strongest fact lands on Sunday, game day, the rest
 *   Tuesday onward (`DAY_ORDER`). A week with fewer facts than days skips the
 *   last days rather than repeating one. The inputs move only when Tuesday's
 *   sync writes the finished week, so a week's list does not shift under it.
 * - **Names, never pronouns.** The opponent is their owner's first name (the
 *   full name if two current owners share it), and the text repeats it.
 */

import { ownerKey } from '../utils/ownerAliases.js';

export const MATCHUP_FACTS_TOPIC = 'matchup_facts';

/** Noon, in the season's zone. pg_cron fires at 16:00 and 17:00 UTC; one of them is noon. */
export const MATCHUP_FACT_HOUR = 12;

const WEEKDAY_KEYS = ['tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'mon'];

/**
 * Which day of the week gets the 1st, 2nd, … strongest fact. Index into
 * WEEKDAY_KEYS: Sunday first, then Tuesday through Saturday, Monday last.
 */
export const DAY_ORDER = Object.freeze([5, 0, 1, 2, 3, 4, 6]);

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

// ---------------------------------------------------------------------------
// The league, indexed once
// ---------------------------------------------------------------------------

/** A franchise across seasons: `franchise_id`, or the owner when a row has none. */
export const franchiseKeyOf = (team) =>
  team.franchiseId ?? (ownerKey(team.owner) ? `owner:${ownerKey(team.owner)}` : `team:${team.id}`);

const isPlayed = (row) =>
  Number.isFinite(row.pointsFor) && Number.isFinite(row.pointsAgainst) && ['W', 'L', 'T'].includes(row.result);

/**
 * @param {object} input
 * @param {Array<{ id: string, year: number, isCompleted: boolean }>} input.seasons
 * @param {Array<{ id: string, seasonId: string, franchiseId: string|null, owner: string, userId?: string|null,
 *   madePlayoffs?: boolean|null, playoffFinish?: string|null, finalRank?: number|null }>} input.teams
 * @param {Array<{ seasonId: string, week: number, type: string, isRegular: boolean, isPlayoff: boolean,
 *   isConsolation: boolean, teamId: string, opponentId: string, pointsFor: number|null,
 *   pointsAgainst: number|null, result: string|null }>} input.results one row per team per game
 * @param {string} input.currentSeasonId
 */
export function indexLeague({ seasons = [], teams = [], results = [], currentSeasonId }) {
  const seasonById = new Map(seasons.map((s) => [s.id, s]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const franchiseOfTeam = new Map(teams.map((t) => [t.id, franchiseKeyOf(t)]));

  // Each franchise's seasons, newest last.
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

  // League-wide context: every regular-season score, and each week's teams.
  const regularScores = [];
  const weekScores = new Map(); // `${seasonId}:${week}` → [{ franchise, pf }]
  for (const [key, games] of gamesByFranchise) {
    for (const game of games) {
      if (game.phase !== 'regular') continue;
      regularScores.push(game.pf);
      const wk = `${game.seasonId}:${game.week}`;
      if (!weekScores.has(wk)) weekScores.set(wk, []);
      weekScores.get(wk).push({ franchise: key, pf: game.pf });
    }
  }
  regularScores.sort((a, b) => a - b);

  const teamsInSeason = new Map();
  for (const team of teams) teamsInSeason.set(team.seasonId, (teamsInSeason.get(team.seasonId) ?? 0) + 1);

  return {
    currentSeasonId,
    seasonById,
    teamById,
    franchiseOfTeam,
    seasonsByFranchise,
    gamesByFranchise,
    names,
    regularScores,
    weekScores,
    teamsInSeason
  };
}

const nameOf = (index, key) => index.names.get(key) ?? 'Somebody';

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

/**
 * Every fact worth sending `me` about `them`, strongest first. Each is
 * `{ key, score, text }`; `score` (0-100) is how hard it lands.
 */
export function buildMatchupFacts(index, me, them) {
  const O = nameOf(index, them);
  const facts = [];
  // `game` names the one game a fact is about, so two facts about the same
  // game (the opponent's worst beating, and it was your biggest win) send once.
  const add = (key, score, text, game = null) => facts.push({
    key,
    score: Math.min(100, Math.round(score)),
    text,
    game: game ? `${game.seasonId}:${game.week}` : null
  });

  const myGames = index.gamesByFranchise.get(me) ?? [];
  const theirGames = index.gamesByFranchise.get(them) ?? [];
  const meetings = myGames.filter((g) => g.opponent === them);

  // --- Head to head, only where it favours `me` -----------------------------
  if (meetings.length) {
    const w = meetings.filter((g) => g.result === 'W').length;
    const l = meetings.filter((g) => g.result === 'L').length;
    const t = meetings.length - w - l;
    if (w > l && meetings.length >= 2) add('h2h-record', 50 + 8 * (w - l), `You're ${record(w, l, t)} all-time against ${O}.`);

    let streak = 0;
    for (let i = meetings.length - 1; i >= 0 && meetings[i].result === 'W'; i -= 1) streak += 1;
    if (streak >= 2) add('h2h-streak', 60 + 8 * streak, `You've beaten ${O} ${streak} straight times.`);

    const last = meetings[meetings.length - 1];
    if (last.result === 'W' && streak < 2) {
      add('h2h-last', 55, `Last time you met, you beat ${O} ${pts(last.pf)}–${pts(last.pa)} (${when(last)}).`, last);
    }

    const wins = meetings.filter((g) => g.result === 'W');
    const biggest = wins.reduce((best, g) => (!best || g.pf - g.pa > best.pf - best.pa ? g : best), null);
    if (biggest && biggest.pf - biggest.pa >= 20) {
      const margin = biggest.pf - biggest.pa;
      add('h2h-biggest-win', 40 + margin / 2,
        `Your biggest win over ${O}: ${pts(biggest.pf)}–${pts(biggest.pa)} in ${when(biggest)}, by ${pts(margin)}.`, biggest);
    }

    const theirLow = wins.reduce((low, g) => (!low || g.pa < low.pa ? g : low), null);
    if (theirLow) {
      add('h2h-their-low', 45, `${O}'s lowest score against you: ${pts(theirLow.pa)} (${when(theirLow)}).`, theirLow);
    }

    for (const g of wins.filter((game) => game.phase === 'playoff')) {
      const text = g.type === 'playoff_championship'
        ? `You beat ${O} in the ${g.year} championship.`
        : `You knocked ${O} out of the ${g.year} playoffs (${ROUND_NAMES[g.type] ?? 'bracket'}).`;
      add(`h2h-playoff-${g.year}`, g.type === 'playoff_championship' ? 97 : 90, text, g);
    }

    // How `them` scores against `me` compared with against everyone else.
    const others = theirGames.filter((g) => g.opponent !== me);
    if (meetings.length >= 3 && others.length >= 5) {
      const vsMe = meetings.reduce((sum, g) => sum + g.pa, 0) / meetings.length;
      const vsRest = others.reduce((sum, g) => sum + g.pf, 0) / others.length;
      const gap = vsRest - vsMe;
      if (gap >= 5) {
        add('h2h-their-average', 40 + gap * 2,
          `${O} averages ${pts(vsMe)} points against you, ${pts(gap)} fewer than against everyone else.`);
      }
    }
  }

  // --- Their history -------------------------------------------------------
  const theirSeasons = index.seasonsByFranchise.get(them) ?? [];
  const completed = theirSeasons.filter((s) => s.isCompleted);

  if (completed.length) {
    const titles = completed.filter((s) => s.playoffFinish === 'champion').map((s) => s.year);
    if (!titles.length && completed.length >= 2) {
      add('titles-none', 65 + 3 * completed.length,
        `${O} has played ${completed.length} seasons in this league and won zero championships.`);
    } else if (titles.length) {
      const lastTitle = titles[titles.length - 1];
      const since = completed.filter((s) => s.year > lastTitle).length;
      if (since >= 2) add('titles-drought', 45 + 5 * since, `${O} hasn't won a championship since ${lastTitle}.`);
    }

    const finals = completed.filter((s) => s.playoffFinish === '2nd').map((s) => s.year);
    if (finals.length) {
      add('finals-lost', 60 + 10 * finals.length,
        finals.length === 1
          ? `${O} lost the ${finals[0]} championship game.`
          : `${O} has lost ${finals.length} championship games (${listYears(finals)}).`);
    }

    const known = completed.filter((s) => typeof s.madePlayoffs === 'boolean');
    const missed = known.filter((s) => !s.madePlayoffs);
    if (known.length >= 2 && missed.length >= 2) {
      add('playoffs-missed', 40 + (40 * missed.length) / known.length,
        `${O} has missed the playoffs in ${missed.length} of ${known.length} seasons.`);
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
      add('first-round-exits', 55 + 5 * firstRound.length,
        `${O} has gone out in the first round of the playoffs ${times(firstRound.length)}.`);
    }
  }

  const regular = theirGames.filter((g) => g.phase === 'regular');
  if (regular.length) {
    const w = regular.filter((g) => g.result === 'W').length;
    const l = regular.filter((g) => g.result === 'L').length;
    const t = regular.length - w - l;
    if (l > w) add('career-record', 55 + 3 * (l - w), `${O} is ${record(w, l, t)} all-time in the regular season.`);

    const low = regular.reduce((min, g) => (!min || g.pf < min.pf ? g : min), null);
    const rank = index.regularScores.filter((score) => score < low.pf).length + 1;
    add('career-low', rank <= 10 ? 95 - 3 * rank : 45,
      rank === 1
        ? `${O} owns the lowest score in league history: ${pts(low.pf)} in ${when(low)}.`
        : rank <= 10
          ? `${O}'s ${pts(low.pf)} in ${when(low)} is the ${ordinal(rank)}-lowest score in league history.`
          : `${O}'s lowest score ever: ${pts(low.pf)} in ${when(low)}.`, low);

    const losses = regular.filter((g) => g.result === 'L');
    const worst = losses.reduce((max, g) => (!max || g.pa - g.pf > max.pa - max.pf ? g : max), null);
    if (worst && worst.pa - worst.pf >= 25) {
      const margin = worst.pa - worst.pf;
      const byMe = worst.opponent === me;
      add('worst-loss', 45 + margin / 3 + (byMe ? 20 : 0),
        `${O}'s worst beating ever: lost by ${pts(margin)} to ${byMe ? 'you' : nameOf(index, worst.opponent)} in ${when(worst)}.`, worst);
    }

    // Longest losing run inside one regular season.
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
  }

  // --- This season ---------------------------------------------------------
  const current = regular.filter((g) => g.seasonId === index.currentSeasonId);
  if (current.length >= 2) {
    const w = current.filter((g) => g.result === 'W').length;
    const l = current.filter((g) => g.result === 'L').length;
    const t = current.length - w - l;
    if (l > w) add('season-record', 45 + 5 * (l - w), `${O} is ${record(w, l, t)} this season.`);

    let losing = 0;
    for (let i = current.length - 1; i >= 0 && current[i].result === 'L'; i -= 1) losing += 1;
    if (losing >= 2) add('season-skid', 50 + 8 * losing, `${O} has lost ${losing} straight.`);

    // All-play: the share of the league `them` outscored each week.
    let expected = 0;
    let weeks = 0;
    for (const g of current) {
      const field = index.weekScores.get(`${g.seasonId}:${g.week}`) ?? [];
      if (field.length < 2) continue;
      const beaten = field.filter((row) => row.franchise !== them && row.pf < g.pf).length
        + field.filter((row) => row.franchise !== them && row.pf === g.pf).length / 2;
      expected += beaten / (field.length - 1);
      weeks += 1;
    }
    if (weeks === current.length) {
      const luck = (w + t / 2) - expected;
      if (luck >= 1) {
        add('season-luck', 55 + 10 * luck,
          `${O} is ${record(w, l, t)}, but scored like a ${expected.toFixed(1)}-${(current.length - expected).toFixed(1)} team. That's luck.`);
      }
    }

    // Their worst week, if it was the league's worst that week.
    const worstWeek = current.reduce((min, g) => (!min || g.pf < min.pf ? g : min), null);
    const field = index.weekScores.get(`${worstWeek.seasonId}:${worstWeek.week}`) ?? [];
    if (field.length > 2 && field.every((row) => row.franchise === them || row.pf > worstWeek.pf)) {
      add('season-week-low', 60,
        `${O} scored ${pts(worstWeek.pf)} in week ${worstWeek.week}, the lowest in the league that week.`, worstWeek);
    }

    // Points for, among this season's teams.
    const totals = new Map();
    for (const [key, games] of index.gamesByFranchise) {
      const pf = games.filter((g) => g.phase === 'regular' && g.seasonId === index.currentSeasonId)
        .reduce((sum, g) => sum + g.pf, 0);
      if (pf > 0) totals.set(key, pf);
    }
    const mine = totals.get(them);
    const fromBottom = [...totals.values()].filter((pf) => pf < mine).length + 1;
    if (totals.size >= 4 && fromBottom <= 3) {
      add('season-points', 50 + 10 * (4 - fromBottom),
        fromBottom === 1
          ? `${O} has scored the fewest points in the league this season.`
          : `${O} has scored the ${ordinal(fromBottom)}-fewest points in the league this season.`);
    }
  }

  const seen = new Set();
  return facts
    .sort((a, b) => (b.score - a.score) || a.key.localeCompare(b.key))
    .filter((fact) => {
      if (!fact.game) return true;
      if (seen.has(fact.game)) return false;
      seen.add(fact.game);
      return true;
    });
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

/** The fact for a day of the week, or null when the week has run out of them. */
export function factForDay(facts, dayIndex) {
  const rank = DAY_ORDER.indexOf(dayIndex);
  return rank >= 0 ? facts[rank] ?? null : null;
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
 * @param {Set<string>} [input.sent] kinds already in notification_log for the week
 * @param {Set<string>} [input.excludedUserIds] accounts that are not approved members
 * @param {boolean} [input.atNoon] true for the cron: send only during the noon hour
 * @returns {Array<{ kind: string, week: number, recipients: object[] }>} each recipient carries its own payload
 */
export function planMatchupFactNotifications({
  now,
  season,
  index,
  pairings = [],
  memberTeams = new Map(),
  subscriptions = [],
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
  const factCache = new Map();
  const recipients = [];

  for (const sub of subscriptions) {
    if (excludedUserIds.has(sub.userId) || !Array.isArray(sub.topics) || !sub.topics.includes(MATCHUP_FACTS_TOPIC)) continue;
    const teamId = memberTeams.get(sub.userId);
    const opponentTeamId = teamId && opponentOf.get(teamId);
    if (!opponentTeamId) continue;

    const me = index.franchiseOfTeam.get(teamId);
    const them = index.franchiseOfTeam.get(opponentTeamId);
    if (!me || !them) continue;

    const pairKey = `${me}→${them}`;
    if (!factCache.has(pairKey)) factCache.set(pairKey, buildMatchupFacts(index, me, them));
    const fact = factForDay(factCache.get(pairKey), day.dayIndex);
    if (!fact) continue;

    recipients.push({
      ...sub,
      factKey: fact.key,
      payload: {
        title: `Week ${day.week}: you vs ${nameOf(index, them)}`,
        body: fact.text,
        url: '/schedule',
        tag: `matchup-fact-${season.id}-${day.week}-${day.dayKey}`
      }
    });
  }

  return recipients.length ? [{ kind, week: day.week, recipients }] : [];
}
