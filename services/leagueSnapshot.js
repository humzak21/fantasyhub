/**
 * The league chat's snapshot: the league's history as a small SQLite database
 * the model can query (JITS-42).
 *
 * Nothing here is a prepared answer. The tables are the league's own rows,
 * reshaped so a question needs no joins it cannot get right: every game twice,
 * once from each side; every person by their owner name rather than a uuid.
 * The model writes the query, the snapshot runs it, and the answer is checked
 * against what came back.
 *
 * It is a copy on purpose. A query a member's question produced runs against
 * an in-memory database holding only what the site already shows members, so
 * there is nothing it can change and nothing private it can read.
 *
 * Pure: `buildSnapshotTables` shapes rows, `writeSnapshot` and `runQuery` take
 * the sql.js module, which the build script (Node) and the edge function (Deno)
 * each load their own way.
 */

import { canonicalOwnerName, ownerKey } from '../utils/ownerAliases.js';
import { getNFLTeamAbbreviation } from './db/espnMapping.js';

/**
 * Every table and column the model may query, with the sentence it reads about
 * each. The DDL and the prompt's schema are both written from this, so they
 * cannot disagree.
 */
export const SNAPSHOT_TABLES = [
  {
    name: 'about',
    doc: 'One row per setting about this snapshot.',
    columns: [
      ['key', 'TEXT', "'built_at', 'first_season' (year), 'current_season' (year), 'current_week' (the week in progress), 'last_scored_week' (latest week of the current season with final scores)"],
      ['value', 'TEXT', '']
    ]
  },
  {
    name: 'members',
    doc: 'Every person who has had a team, by the name used everywhere else in this database.',
    columns: [
      ['owner', 'TEXT', 'full name, e.g. "Humza Khalil"'],
      ['first_season', 'INTEGER', ''],
      ['last_season', 'INTEGER', ''],
      ['seasons_played', 'INTEGER', '']
    ]
  },
  {
    name: 'seasons',
    doc: 'One row per season (year). The league started in 2020.',
    columns: [
      ['season', 'INTEGER', 'year'],
      ['is_completed', 'INTEGER', '1 once the championship has been played'],
      ['regular_season_weeks', 'INTEGER', ''],
      ['playoff_weeks', 'INTEGER', ''],
      ['champion', 'TEXT', 'owner; NULL until the season is completed'],
      ['runner_up', 'TEXT', 'owner who lost the championship game']
    ]
  },
  {
    name: 'teams',
    doc: 'One row per owner per season. Records and points are regular season only.',
    columns: [
      ['season', 'INTEGER', ''],
      ['owner', 'TEXT', ''],
      ['team_name', 'TEXT', 'what the team was called that season'],
      ['division', 'TEXT', ''],
      ['wins', 'INTEGER', 'regular season'],
      ['losses', 'INTEGER', 'regular season'],
      ['ties', 'INTEGER', 'regular season'],
      ['points_for', 'REAL', 'regular season'],
      ['points_against', 'REAL', 'regular season'],
      ['made_playoffs', 'INTEGER', '1/0; NULL while the season is in progress'],
      ['playoff_seed', 'INTEGER', ''],
      ['playoff_finish', 'TEXT', "'champion', '2nd' … '6th', or 'none' (missed the bracket)"],
      ['final_rank', 'INTEGER', '1 = champion … last place']
    ]
  },
  {
    name: 'games',
    doc: 'Every matchup, TWICE: once from each side (owner vs opponent). Count one side only when counting games. Unplayed games have result NULL.',
    columns: [
      ['season', 'INTEGER', ''],
      ['week', 'INTEGER', ''],
      ['phase', 'TEXT', "'regular', 'playoff' (the bracket) or 'consolation'"],
      ['round', 'TEXT', "for postseason games: 'first round', 'semifinal', 'championship', 'placement', 'consolation'"],
      ['owner', 'TEXT', ''],
      ['opponent', 'TEXT', ''],
      ['points_for', 'REAL', "owner's score"],
      ['points_against', 'REAL', "opponent's score"],
      ['result', 'TEXT', "'W', 'L', 'T' for owner; NULL if not played yet"],
      ['margin', 'REAL', 'points_for - points_against']
    ]
  },
  {
    name: 'lineups',
    doc: 'One row per player on a roster per week (2020 onward, except 2024 week 1). started = 1 for the starting lineup.',
    columns: [
      ['season', 'INTEGER', ''],
      ['week', 'INTEGER', ''],
      ['owner', 'TEXT', 'whose roster'],
      ['player', 'TEXT', 'player name'],
      ['position', 'TEXT', "'QB','RB','WR','TE','K','D/ST'"],
      ['slot', 'TEXT', "lineup slot: 'QB','RB','WR','TE','FLEX','D/ST','K','BE' (bench),'IR'"],
      ['started', 'INTEGER', '1 or 0'],
      ['points', 'REAL', 'fantasy points scored; NULL if not played yet'],
      ['projected', 'REAL', "ESPN's projection"],
      ['nfl_team', 'TEXT', 'e.g. "KC"']
    ]
  },
  {
    name: 'team_weeks',
    doc: 'One row per owner per scored week: lineup totals.',
    columns: [
      ['season', 'INTEGER', ''],
      ['week', 'INTEGER', ''],
      ['owner', 'TEXT', ''],
      ['starter_points', 'REAL', 'points from the starting lineup'],
      ['optimal_points', 'REAL', 'the best possible lineup from the same roster'],
      ['bench_points', 'REAL', 'optimal_points - starter_points (points left on the bench)'],
      ['starters_scoring', 'INTEGER', 'starters who scored more than 0']
    ]
  },
  {
    name: 'transactions',
    doc: 'Every executed waiver claim, free-agent pickup and trade, one row per player per side. Drops are only listed inside trades; transaction_totals.drops has each season\'s drop count.',
    columns: [
      ['season', 'INTEGER', ''],
      ['week', 'INTEGER', ''],
      ['date', 'TEXT', 'ISO date processed'],
      ['type', 'TEXT', "'waiver', 'free_agent' or 'trade'"],
      ['owner', 'TEXT', ''],
      ['action', 'TEXT', "'added', 'dropped', 'traded_for', 'traded_away'"],
      ['player', 'TEXT', ''],
      ['position', 'TEXT', ''],
      ['other_owner', 'TEXT', 'the other side of a trade; NULL otherwise'],
      ['bid', 'REAL', 'FAAB dollars on a winning waiver claim'],
      ['transaction_id', 'TEXT', 'shared by every row of one move']
    ]
  },
  {
    name: 'transaction_totals',
    doc: "ESPN's season counts per owner. The commissioner's trade count is inflated: trades they executed for others count as theirs.",
    columns: [
      ['season', 'INTEGER', ''],
      ['owner', 'TEXT', ''],
      ['waiver_claims', 'INTEGER', ''],
      ['free_agent_adds', 'INTEGER', ''],
      ['drops', 'INTEGER', ''],
      ['trades', 'INTEGER', ''],
      ['faab_spent', 'REAL', '']
    ]
  },
  {
    name: 'power_rankings',
    doc: "The site's power ranking per owner per week (2025 onward). Week N is the ranking going INTO week N.",
    columns: [
      ['season', 'INTEGER', ''],
      ['week', 'INTEGER', ''],
      ['owner', 'TEXT', ''],
      ['rank', 'INTEGER', '1 = best'],
      ['power_rating', 'REAL', '0-100']
    ]
  },
  {
    name: 'awards',
    doc: 'Season awards. category voted = decided by league ballot.',
    columns: [
      ['season', 'INTEGER', ''],
      ['award', 'TEXT', ''],
      ['winner', 'TEXT', 'owner'],
      ['category', 'TEXT', "'voted' or 'stat'"]
    ]
  }
];

const TYPE_ROUND = {
  playoff_first_round: 'first round',
  playoff_semifinals: 'semifinal',
  playoff_championship: 'championship',
  playoff: 'placement'
};

/** 'regular' | 'playoff' | 'consolation', by the rule `v_game_results` uses. */
export function phaseOfType(type) {
  const t = String(type ?? 'regular');
  if (t.startsWith('playoff_consolation')) return 'consolation';
  if (t.startsWith('playoff')) return 'playoff';
  return 'regular';
}

const TX_TYPES = { WAIVER: 'waiver', FREEAGENT: 'free_agent', TRADE_ACCEPT: 'trade' };
const round2 = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 100) / 100);
const bool = (b) => (b == null ? null : b ? 1 : 0);

/**
 * Shape the league's rows into the snapshot's tables.
 *
 * @param {object} sources from `services/db/leagueChat.js::getLeagueSnapshotSources`
 * @param {{ now?: Date }} [options]
 * @returns {{ tables: Record<string, object[]>, meta: object }}
 */
export function buildSnapshotTables(sources, { now = new Date() } = {}) {
  const {
    seasons = [], teams = [], divisions = [], games = [], playerWeeks = [], players = [],
    teamWeeks = [], transactionEvents = [], transactionTotals = [], rankings = [], awards = [],
    currentSeasonId = null, currentWeek = null
  } = sources;

  const yearOf = new Map(seasons.map((s) => [s.id, s.year]));
  const seasonById = new Map(seasons.map((s) => [s.id, s]));

  // One name per franchise: its owner as of its latest season.
  const franchiseOf = (team) => team.franchiseId ?? `owner:${ownerKey(team.owner)}`;
  const latest = new Map(); // franchise → { year, owner }
  for (const team of teams) {
    const year = yearOf.get(team.seasonId);
    if (year == null || !team.owner?.trim()) continue;
    const key = franchiseOf(team);
    const prev = latest.get(key);
    if (!prev || year >= prev.year) latest.set(key, { year, owner: canonicalOwnerName(team.owner.trim()) });
  }
  const nameOfFranchise = (key) => latest.get(key)?.owner ?? null;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const ownerOfTeam = (teamId) => {
    const team = teamById.get(teamId);
    return team ? nameOfFranchise(franchiseOf(team)) : null;
  };
  const divisionName = new Map(divisions.map((d) => [d.id, d.name]));

  // -- games, both sides ----------------------------------------------------
  const gameRows = [];
  for (const g of games) {
    const year = yearOf.get(g.seasonId);
    if (year == null || !g.team2Id || g.type === 'bye') continue;
    const a = ownerOfTeam(g.team1Id);
    const b = ownerOfTeam(g.team2Id);
    if (!a || !b) continue;
    const phase = phaseOfType(g.type);
    const round = phase === 'regular' ? null : phase === 'consolation' ? 'consolation' : TYPE_ROUND[g.type] ?? 'placement';
    const s1 = round2(g.team1Score);
    const s2 = round2(g.team2Score);
    const played = Boolean(g.isCompleted) && s1 != null && s2 != null;
    const res = (x, y) => (!played ? null : x > y ? 'W' : x < y ? 'L' : 'T');
    gameRows.push(
      { season: year, week: g.week, phase, round, owner: a, opponent: b, points_for: played ? s1 : null, points_against: played ? s2 : null, result: res(s1, s2), margin: played ? round2(s1 - s2) : null },
      { season: year, week: g.week, phase, round, owner: b, opponent: a, points_for: played ? s2 : null, points_against: played ? s1 : null, result: res(s2, s1), margin: played ? round2(s2 - s1) : null }
    );
  }
  gameRows.sort((x, y) => (x.season - y.season) || (x.week - y.week) || x.owner.localeCompare(y.owner));

  // -- teams: regular-season record from the games, placements as stored ----
  const record = new Map(); // `${year}|${owner}`
  for (const r of gameRows) {
    if (r.phase !== 'regular' || !r.result) continue;
    const k = `${r.season}|${r.owner}`;
    const t = record.get(k) ?? { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    if (r.result === 'W') t.w += 1; else if (r.result === 'L') t.l += 1; else t.t += 1;
    t.pf += r.points_for;
    t.pa += r.points_against;
    record.set(k, t);
  }
  const teamRows = [];
  for (const team of teams) {
    const season = seasonById.get(team.seasonId);
    const owner = ownerOfTeam(team.id);
    if (!season || !owner) continue;
    const r = record.get(`${season.year}|${owner}`) ?? { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    const done = Boolean(season.isCompleted);
    teamRows.push({
      season: season.year,
      owner,
      team_name: team.name ?? null,
      division: divisionName.get(team.divisionId) ?? null,
      wins: r.w,
      losses: r.l,
      ties: r.t,
      points_for: round2(r.pf),
      points_against: round2(r.pa),
      made_playoffs: done ? bool(team.madePlayoffs) : null,
      playoff_seed: done ? team.playoffSeed ?? null : null,
      playoff_finish: done ? team.playoffFinish ?? null : null,
      final_rank: done ? team.finalRank ?? null : null
    });
  }
  teamRows.sort((x, y) => (x.season - y.season) || x.owner.localeCompare(y.owner));

  // -- members and seasons ---------------------------------------------------
  const spans = new Map();
  for (const t of teamRows) {
    const s = spans.get(t.owner) ?? { first: t.season, last: t.season, n: 0 };
    s.first = Math.min(s.first, t.season);
    s.last = Math.max(s.last, t.season);
    s.n += 1;
    spans.set(t.owner, s);
  }
  const memberRows = [...spans].map(([owner, s]) => ({ owner, first_season: s.first, last_season: s.last, seasons_played: s.n }))
    .sort((x, y) => x.owner.localeCompare(y.owner));

  const seasonRows = seasons.map((s) => {
    const done = Boolean(s.isCompleted);
    const placed = (finish) => (done ? teamRows.find((t) => t.season === s.year && t.playoff_finish === finish)?.owner ?? null : null);
    return {
      season: s.year,
      is_completed: done ? 1 : 0,
      regular_season_weeks: s.regularSeasonWeeks ?? null,
      playoff_weeks: s.playoffWeeks ?? null,
      champion: placed('champion'),
      runner_up: placed('2nd')
    };
  }).sort((x, y) => x.season - y.season);

  // -- lineups -----------------------------------------------------------------
  const playerById = new Map(players.map((p) => [p.id, p]));
  const playerByEspn = new Map(players.filter((p) => p.espnPlayerId != null).map((p) => [Number(p.espnPlayerId), p]));
  const lineupRows = [];
  for (const row of playerWeeks) {
    const year = yearOf.get(row.seasonId);
    const owner = ownerOfTeam(row.teamId);
    if (year == null || !owner) continue;
    const player = playerById.get(row.playerId);
    lineupRows.push({
      season: year,
      week: row.week,
      owner,
      player: player?.name ?? `ESPN player ${row.espnPlayerId ?? '?'}`,
      position: row.position ?? player?.position ?? null,
      slot: row.rosterSlot ?? null,
      started: row.started ? 1 : 0,
      points: round2(row.actualPoints),
      projected: round2(row.projectedPoints),
      nfl_team: getNFLTeamAbbreviation(row.proTeamId) ?? null
    });
  }

  const teamWeekRows = [];
  for (const row of teamWeeks) {
    const year = yearOf.get(row.seasonId);
    const owner = ownerOfTeam(row.teamId);
    if (year == null || !owner) continue;
    teamWeekRows.push({
      season: year,
      week: row.week,
      owner,
      starter_points: round2(row.starterPoints),
      optimal_points: round2(row.optimalPoints),
      bench_points: round2(row.optimalPoints - row.starterPoints),
      starters_scoring: row.startersScoring ?? null
    });
  }

  // -- transactions, one row per player per side ---------------------------------
  const franchiseOwner = (franchiseId) => (franchiseId ? nameOfFranchise(franchiseId) : null);
  const txRows = [];
  for (const ev of transactionEvents) {
    const year = yearOf.get(ev.seasonId);
    const type = TX_TYPES[ev.type];
    if (year == null || !type) continue;
    const ids = ev.espnPlayerIds ?? [];
    const from = ev.playerFromFranchiseIds;
    const to = ev.playerToFranchiseIds;
    const base = { season: year, week: ev.scoringPeriod ?? null, date: ev.processedAt ? String(ev.processedAt).slice(0, 10) : null, type, transaction_id: ev.id };
    ids.forEach((espnId, i) => {
      const p = playerByEspn.get(Number(espnId));
      const player = p?.name ?? `ESPN player ${espnId}`;
      const position = p?.position ?? null;
      const giver = from ? franchiseOwner(from[i]) : null;
      const taker = to ? franchiseOwner(to[i]) : null;
      if (!from && !to) {
        txRows.push({ ...base, owner: franchiseOwner(ev.franchiseId), action: type === 'trade' ? 'traded_for' : 'added', player, position, other_owner: null, bid: type === 'waiver' ? ev.bidAmount ?? null : null });
        return;
      }
      if (taker) {
        txRows.push({ ...base, owner: taker, action: type === 'trade' ? 'traded_for' : 'added', player, position, other_owner: type === 'trade' ? giver : null, bid: type === 'waiver' && taker === franchiseOwner(ev.franchiseId) ? ev.bidAmount ?? null : null });
      }
      if (giver) {
        txRows.push({ ...base, owner: giver, action: type === 'trade' && taker ? 'traded_away' : 'dropped', player, position, other_owner: type === 'trade' ? taker : null, bid: null });
      }
    });
  }

  const totalRows = [];
  for (const row of transactionTotals) {
    const year = yearOf.get(row.seasonId);
    const owner = row.franchiseId ? franchiseOwner(row.franchiseId) : null;
    if (year == null) continue;
    totalRows.push({
      season: year,
      owner: owner ?? canonicalOwnerName(row.ownerName ?? ''),
      waiver_claims: row.waiverClaims ?? null,
      free_agent_adds: row.freeAgentAdds ?? null,
      drops: row.drops ?? null,
      trades: row.trades ?? null,
      faab_spent: round2(row.faabSpent)
    });
  }

  const rankingRows = [];
  for (const row of rankings) {
    const year = yearOf.get(row.seasonId);
    const owner = ownerOfTeam(row.teamId);
    if (year == null || !owner) continue;
    rankingRows.push({ season: year, week: row.weekNumber, owner, rank: row.rank, power_rating: round2(row.powerRating) });
  }

  const awardRows = [];
  for (const row of awards) {
    const year = yearOf.get(row.seasonId);
    const winner = row.winnerFranchiseId ? franchiseOwner(row.winnerFranchiseId) : row.winnerTeamId ? ownerOfTeam(row.winnerTeamId) : null;
    if (year == null || !row.title) continue;
    awardRows.push({ season: year, award: row.title, winner, category: row.category === 'voted' ? 'voted' : 'stat' });
  }

  // -- about -------------------------------------------------------------------
  const currentYear = yearOf.get(currentSeasonId) ?? null;
  const scoredWeeks = gameRows.filter((r) => r.season === currentYear && r.phase === 'regular' && r.result).map((r) => r.week);
  const lastScoredWeek = scoredWeeks.length ? Math.max(...scoredWeeks) : null;
  const aboutRows = [
    { key: 'built_at', value: now.toISOString() },
    { key: 'first_season', value: seasonRows.length ? String(seasonRows[0].season) : null },
    { key: 'current_season', value: currentYear == null ? null : String(currentYear) },
    { key: 'current_week', value: currentWeek == null ? null : String(currentWeek) },
    { key: 'last_scored_week', value: lastScoredWeek == null ? null : String(lastScoredWeek) }
  ];

  return {
    tables: {
      about: aboutRows,
      members: memberRows,
      seasons: seasonRows,
      teams: teamRows,
      games: gameRows,
      lineups: lineupRows,
      team_weeks: teamWeekRows,
      transactions: txRows,
      transaction_totals: totalRows,
      power_rankings: rankingRows,
      awards: awardRows
    },
    meta: { builtAt: now.toISOString(), currentYear, currentWeek, lastScoredWeek, members: memberRows.map((m) => m.owner) }
  };
}

/** The schema as the model reads it. */
export function describeSchema(tables = SNAPSHOT_TABLES) {
  return tables.map((t) => {
    const cols = t.columns.map(([name, type, doc]) => `  ${name} ${type}${doc ? ` -- ${doc}` : ''}`).join('\n');
    return `TABLE ${t.name} -- ${t.doc}\n${cols}`;
  }).join('\n\n');
}

/**
 * Write the tables into a fresh SQLite database and return its bytes.
 *
 * @param {object} SQL the initialised sql.js module
 * @param {Record<string, object[]>} tables from `buildSnapshotTables`
 * @returns {Uint8Array}
 */
export function writeSnapshot(SQL, tables) {
  const db = new SQL.Database();
  try {
    db.run('BEGIN');
    for (const t of SNAPSHOT_TABLES) {
      const names = t.columns.map(([name]) => name);
      db.run(`CREATE TABLE ${t.name} (${t.columns.map(([name, type]) => `${name} ${type}`).join(', ')})`);
      const insert = db.prepare(`INSERT INTO ${t.name} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`);
      for (const row of tables[t.name] ?? []) insert.run(names.map((n) => row[n] ?? null));
      insert.free();
    }
    db.run('CREATE INDEX games_owner ON games (owner, season, week)');
    db.run('CREATE INDEX lineups_owner ON lineups (owner, season, week)');
    db.run('CREATE INDEX lineups_player ON lineups (player)');
    db.run('COMMIT');
    return db.export();
  } finally {
    db.close();
  }
}

export const MAX_RESULT_ROWS = 200;

/**
 * Run one read-only query against an open snapshot.
 *
 * The snapshot is an in-memory copy, so nothing a query does can reach the
 * league; this guard is about keeping a confused model to one SELECT.
 *
 * @param {object} db an open sql.js Database
 * @param {string} sql
 * @returns {{ ok: true, columns: string[], rows: any[][], rowCount: number, truncated: boolean } | { ok: false, error: string }}
 */
export function runQuery(db, sql, { maxRows = MAX_RESULT_ROWS } = {}) {
  const text = String(sql ?? '').trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(text)) return { ok: false, error: 'Only a single SELECT (or WITH … SELECT) query is allowed.' };
  if (text.includes(';')) return { ok: false, error: 'One statement at a time: remove the semicolons.' };
  if (/\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|replace)\b/i.test(text.replace(/'[^']*'/g, "''"))) {
    return { ok: false, error: 'Only reading is allowed.' };
  }
  let stmt;
  try {
    stmt = db.prepare(text);
    const columns = stmt.getColumnNames();
    const rows = [];
    let rowCount = 0;
    while (stmt.step()) {
      rowCount += 1;
      if (rows.length < maxRows) rows.push(stmt.get().map((v) => (typeof v === 'number' ? round2(v) : v)));
    }
    return { ok: true, columns, rows, rowCount, truncated: rowCount > rows.length };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  } finally {
    stmt?.free();
  }
}
