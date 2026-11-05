/**
 * One week of a made-up league, held in place by a fixed clock, with every call
 * to Supabase answered here.
 *
 * Real data would make this suite a function of the calendar: in the offseason
 * nothing is live, and on a Wednesday nothing is either. So week 4 of a six-team
 * league is frozen with one game in each state an overlay has to get right:
 *
 *   - **final**: `games` carries the score, and the snapshot must give way to it
 *   - **live**: a starter is on the field and another has yet to play
 *   - **projected**: nobody has kicked off
 *
 * Nothing leaves the browser. An unknown read answers empty and an unknown write
 * is refused, so a test cannot reach the real database by accident.
 */

const SEASON_ID = '00000000-0000-4000-8000-000000000001';

/** Sunday of week 4, with the early games on. */
export const FROZEN_AT = '2026-10-04T18:30:00Z';

const team = (id, name, owner, espnTeamId, divisionId, wins, losses) => ({
  id,
  season_id: SEASON_ID,
  name,
  owner,
  espn_team_id: espnTeamId,
  division_id: divisionId,
  franchise_id: `00000000-0000-4000-8000-0000000002${String(espnTeamId).padStart(2, '0')}`,
  wins,
  losses,
  ties: 0,
  points_for: 300,
  points_against: 290,
  point_differential: 10,
  win_percentage: wins / (wins + losses)
});

/**
 * One team carries a name as long as the league's real ones ("if we keep it a
 * buck, we ass", "Chop Wood Carry Water"), because a row that only ever meets
 * "Live Leaders" never has to shrink, and the full-season overflow this suite
 * guards against needs a name that does.
 */
export const TEAMS = [
  team('team-final-a', 'Final Winners', 'Fiona Final', 1, 1, 3, 0),
  team('team-final-b', 'Final Losers', 'Frank Final', 2, 1, 2, 1),
  team('team-live-a', 'Live Leaders', 'Lena Live', 3, 1, 1, 2),
  team('team-live-b', 'Live Chasers', 'Liam Live', 4, 2, 2, 1),
  team('team-early-a', 'Early Birds', 'Erin Early', 5, 2, 1, 2),
  team('team-early-b', 'Late Starters Who Keep It A Buck All Season Long', 'Luke Late', 6, 2, 0, 3)
];

const DIVISIONS = [
  { id: 1, season_id: SEASON_ID, name: 'North', display_order: 1 },
  { id: 2, season_id: SEASON_ID, name: 'South', display_order: 2 }
];

const game = (id, espnMatchupId, team1, team2, team1Score = null, team2Score = null) => ({
  id,
  season_id: SEASON_ID,
  week: 4,
  type: 'regular',
  team1_id: team1,
  team2_id: team2,
  team1_score: team1Score,
  team2_score: team2Score,
  winner_team_id: team1Score == null ? null : team1,
  is_completed: team1Score != null,
  espn_matchup_id: espnMatchupId
});

const GAMES = [
  game('game-final', 101, 'team-final-a', 'team-final-b', 121.2, 99.4),
  game('game-live', 102, 'team-live-a', 'team-live-b'),
  game('game-early', 103, 'team-early-a', 'team-early-b')
];

const SEASON = {
  id: SEASON_ID,
  year: 2026,
  name: '2026 Season',
  is_active: true,
  is_completed: false,
  start_date: '2026-09-08',
  timezone: 'America/New_York',
  regular_season_weeks: 14,
  playoff_weeks: 3,
  total_weeks: 17,
  league_size: 6,
  espn_league_id: '1',
  espn_season_year: 2026,
  teams: TEAMS
};

const entry = (espnPlayerId, proTeamId, actualPoints, projectedPoints, lineupSlotId = 2) => ({
  espnPlayerId,
  playerName: `Player ${espnPlayerId}`,
  position: 'RB',
  proTeamId,
  lineupSlotId,
  started: lineupSlotId !== 20,
  actualPoints,
  projectedPoints,
  injuryStatus: 'ACTIVE'
});

const side = (espnTeamId, points, projected) => ({ espnTeamId, points, projected });

const KC = 12;
const BUF = 2;
const GB = 9;

/** What `live-scores` answers. Team 1's week is over, which must change nothing. */
export const LIVE_WEEK = {
  matchups: [
    { espnMatchupId: 101, home: side(1, 121.2, 121.2), away: side(2, 99.4, 99.4), espnWinner: 'UNDECIDED' },
    { espnMatchupId: 102, home: side(3, 64.5, 110.3), away: side(4, 48.2, 95.1), espnWinner: 'UNDECIDED' },
    { espnMatchupId: 103, home: side(5, 0, 118.6), away: side(6, 0, 104.9), espnWinner: 'UNDECIDED' }
  ],
  lineups: {
    1: [entry(10, GB, 121.2, 110)],
    2: [entry(20, GB, 99.4, 105)],
    3: [entry(30, KC, 64.5, 70), entry(31, BUF, null, 40)],
    4: [entry(40, GB, 48.2, 50), entry(41, KC, null, 45)],
    5: [entry(50, BUF, null, 118.6)],
    6: [entry(60, BUF, null, 104.9)]
  },
  nflGames: {
    KC: { state: 'in_progress', detail: '7:10 - 2nd', clock: '7:10', period: 2 },
    GB: { state: 'final', detail: 'Final', clock: null, period: null },
    BUF: { state: 'not_started', detail: 'Sun 4:25 PM', clock: null, period: null }
  },
  live: true,
  windowOpen: true,
  refreshedAt: '2026-10-04T18:20:00Z'
};

/*
 * The players behind the snapshot's lineups, so a name on the Schedule card is
 * a link and the player page has someone to show. The Live Leaders' two
 * starters (30 and 31) carry a history; everybody else is a name.
 */
const playerId = (espnPlayerId) => `00000000-0000-4000-8000-000000000${String(espnPlayerId).padStart(3, '0')}`;

const PLAYER_NAMES = {
  10: 'Gus Green', 20: 'Pat Packer', 30: 'Rex Runner', 31: 'Sam Sunday',
  40: 'Lou Lambeau', 41: 'Kurt Chief', 50: 'Bo Buffalo', 60: 'Jim Kelly-Jones'
};

const PRO_TEAMS = { [KC]: 'KC', [BUF]: 'BUF', [GB]: 'GB' };

const PLAYERS = Object.entries(LIVE_WEEK.lineups).flatMap(([, entries]) => entries).map((e) => ({
  id: playerId(e.espnPlayerId),
  espn_player_id: e.espnPlayerId,
  name: PLAYER_NAMES[e.espnPlayerId],
  position: e.position,
  team_abbreviation: PRO_TEAMS[e.proTeamId],
  pro_team_id: e.proTeamId,
  projected_points: e.projectedPoints,
  injury_status: 'ACTIVE',
  is_active: true,
  jersey_number: null
}));

const ESPN_TEAM_TO_TEAM = Object.fromEntries(TEAMS.map((t) => [t.espn_team_id, t]));

/** Every snapshot lineup, as the roster sync left it the day before. */
const ROSTERS = Object.entries(LIVE_WEEK.lineups).flatMap(([espnTeamId, entries]) => entries.map((e) => {
  const owner = ESPN_TEAM_TO_TEAM[espnTeamId];
  const player = PLAYERS.find((row) => row.espn_player_id === e.espnPlayerId);
  return {
    id: `roster-${e.espnPlayerId}`,
    team_id: owner.id,
    player_id: player.id,
    roster_slot: e.started ? 'RB' : 'BE',
    acquisition_type: 'DRAFT',
    acquisition_week: null,
    added_date: null,
    cost: null,
    is_keeper: false,
    created_at: '2026-10-03T16:40:00Z',
    team: { id: owner.id, name: owner.name, owner: owner.owner, season_id: SEASON_ID },
    player
  };
}));

const PRIOR_SEASON_ID = '00000000-0000-4000-8000-000000002025';

/** A week of a player's history, as `v_player_week_lines` reports it. */
const weekLine = (espnPlayerId, { seasonId = SEASON_ID, year = 2026, week, teamId = 'team-live-a', points, projected, breakdown, overall, position, result = 'W' }) => {
  const team = TEAMS.find((t) => t.id === teamId);
  return {
    id: `line-${espnPlayerId}-${year}-${week}`,
    season_id: seasonId,
    year,
    week,
    player_id: playerId(espnPlayerId),
    espn_player_id: espnPlayerId,
    team_id: teamId,
    franchise_id: team.franchise_id,
    position: 'RB',
    roster_slot: 'RB',
    started: true,
    actual_points: points,
    projected_points: projected,
    pro_team_id: espnPlayerId === 30 ? KC : BUF,
    injury_status: 'ACTIVE',
    stat_breakdown: breakdown,
    appeared: true,
    overall_rank: overall,
    overall_of: 90,
    position_rank: position,
    position_of: 30,
    game_id: `game-${year}-${week}`,
    game_type: 'regular',
    team_score: result === 'W' ? 118.4 : 96.2,
    opponent_score: result === 'W' ? 101.0 : 110.7,
    opponent_team_id: 'team-live-b',
    opponent_franchise_id: TEAMS.find((t) => t.id === 'team-live-b').franchise_id,
    result,
    is_bye: false
  };
};

const rb = (car, rushYds, rushTd, rec, recYds, recTd = 0) =>
  ({ 23: car, 24: rushYds, 25: rushTd, 53: rec, 42: recYds, 43: recTd, 58: rec + 1, 210: 1 });

const PLAYER_WEEK_LINES = [
  weekLine(30, { seasonId: PRIOR_SEASON_ID, year: 2025, week: 12, teamId: 'team-final-a', points: 14.2, projected: 13.1, breakdown: rb(15, 64, 0, 3, 28), overall: 41, position: 15 }),
  weekLine(30, { seasonId: PRIOR_SEASON_ID, year: 2025, week: 13, teamId: 'team-final-a', points: 22.7, projected: 14.0, breakdown: rb(18, 92, 1, 4, 31), overall: 9, position: 4, result: 'L' }),
  weekLine(30, { seasonId: PRIOR_SEASON_ID, year: 2025, week: 14, teamId: 'team-final-a', points: 9.4, projected: 13.8, breakdown: rb(12, 41, 0, 2, 13), overall: 60, position: 22 }),
  weekLine(30, { week: 1, points: 18.6, projected: 15.2, breakdown: rb(17, 88, 1, 2, 18), overall: 18, position: 7 }),
  weekLine(30, { week: 2, points: 31.4, projected: 15.9, breakdown: rb(22, 131, 2, 4, 44), overall: 2, position: 1 }),
  weekLine(30, { week: 3, points: 12.1, projected: 16.4, breakdown: rb(14, 57, 0, 3, 34), overall: 47, position: 18, result: 'L' }),
  weekLine(31, { week: 1, points: 7.8, projected: 9.0, breakdown: rb(8, 30, 0, 2, 18), overall: 71, position: 25 }),
  weekLine(31, { week: 2, points: 16.3, projected: 9.4, breakdown: rb(10, 48, 1, 3, 25), overall: 30, position: 11 }),
  weekLine(31, { week: 3, points: 11.0, projected: 10.1, breakdown: rb(9, 39, 0, 4, 31), overall: 52, position: 20, result: 'L' })
];

const career = (espnPlayerId, extra) => {
  const lines = PLAYER_WEEK_LINES.filter((l) => l.espn_player_id === espnPlayerId);
  const points = lines.map((l) => l.actual_points);
  const total = points.reduce((a, b) => a + b, 0);
  return {
    player_id: playerId(espnPlayerId),
    espn_player_id: espnPlayerId,
    name: PLAYER_NAMES[espnPlayerId],
    position: 'RB',
    weeks_rostered: lines.length,
    weeks_started: lines.length,
    games_played: lines.length,
    started_games: lines.length,
    total_points: total,
    points_per_game: total / lines.length,
    started_points: total,
    bench_points: 0,
    best_points: Math.max(...points),
    worst_points: Math.min(...points),
    points_stddev: 6.1,
    seasons_played: new Set(lines.map((l) => l.season_id)).size,
    first_year: lines[0].year,
    last_year: lines[lines.length - 1].year,
    franchises: new Set(lines.map((l) => l.franchise_id)).size,
    last_team_id: lines[lines.length - 1].team_id,
    ...extra
  };
};

/** Enough qualified backs for a rank and its neighbours either side. */
const leagueBack = (n, ppg) => ({
  player_id: `00000000-0000-4000-8000-0000000009${String(n).padStart(2, '0')}`,
  espn_player_id: 900 + n,
  name: `League Back ${n}`,
  position: 'RB',
  weeks_rostered: 20,
  weeks_started: 15,
  games_played: 18,
  started_games: 14,
  total_points: ppg * 18,
  points_per_game: ppg,
  started_points: ppg * 14,
  bench_points: ppg * 4,
  best_points: ppg * 2,
  worst_points: 2,
  points_stddev: 5,
  seasons_played: 2,
  first_year: 2025,
  last_year: 2026,
  franchises: 1,
  last_team_id: 'team-final-b'
});

const PLAYER_CAREERS = [
  career(30),
  career(31),
  ...[19.1, 17.4, 16.2, 14.9, 12.3, 10.8].map((ppg, i) => leagueBack(i + 1, ppg))
];

const FRANCHISES = TEAMS.map((t) => ({
  id: t.franchise_id,
  owner_name: t.owner,
  display_name: t.owner,
  is_active: true,
  joined_year: 2020,
  left_year: null
}));

const TABLES = {
  seasons: [SEASON],
  v_active_season: [SEASON],
  teams: TEAMS,
  divisions: DIVISIONS,
  games: GAMES,
  league_franchises: FRANCHISES,
  rosters: ROSTERS,
  players: PLAYERS,
  v_player_week_lines: PLAYER_WEEK_LINES,
  v_player_careers: PLAYER_CAREERS,
  transaction_events: []
};

/*
 * Tables answered by their filters. Everything else answers its whole fixture
 * whatever it was asked, which the rest of this league was written against; a
 * player page asks for one player by id (and his one roster row), and has to
 * get that one. A filter on a column the rows do not carry, or on an embedded
 * table (`team.season_id`), is ignored.
 */
const FILTERED = new Set(['players', 'rosters', 'v_player_week_lines', 'v_player_careers']);

const NOT_FILTERS = new Set(['select', 'order', 'limit', 'offset']);

function applyFilters(rows, searchParams) {
  let out = rows;
  for (const [column, condition] of searchParams) {
    if (NOT_FILTERS.has(column) || column.includes('.')) continue;
    const eq = condition.match(/^eq\.(.*)$/);
    const inList = condition.match(/^in\.\((.*)\)$/);
    if (eq) out = out.filter((row) => !(column in row) || String(row[column]) === eq[1]);
    else if (inList) {
      const values = inList[1].split(',').map((v) => v.replace(/^"|"$/g, ''));
      out = out.filter((row) => !(column in row) || values.includes(String(row[column])));
    }
  }
  return out;
}

const RPCS = { is_approved_member: true, is_admin: false, is_parlay_commissioner: false };

const JWT = [
  'e30',
  Buffer.from(JSON.stringify({ exp: 4102444800, sub: 'viewer', role: 'authenticated' })).toString('base64url'),
  'signature'
].join('.');

/** A session for the team's owner: every name on a page is masked for anyone else. */
const sessionFor = (owner) => ({
  access_token: JWT,
  refresh_token: 'refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  user: {
    id: '00000000-0000-4000-8000-000000000003',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'viewer@example.test',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: {},
    user_metadata: { full_name: owner, name: owner }
  }
});

function answer(request, owner) {
  const { pathname } = new URL(request.url());

  if (pathname.endsWith('/functions/v1/live-scores')) return LIVE_WEEK;
  if (pathname.endsWith('/auth/v1/user')) return sessionFor(owner).user;

  const [, name] = pathname.match(/\/rest\/v1\/(?:rpc\/)?(.+)$/) ?? [];
  if (pathname.includes('/rpc/')) return RPCS[name] ?? [];

  const rows = TABLES[name] ?? [];
  return FILTERED.has(name) ? applyFilters(rows, new URL(request.url()).searchParams) : rows;
}

/**
 * Answer everything, as `owner`, and open `path` with the clock stopped.
 *
 * The session has to sit under the storage key supabase-js derives from the
 * project's URL, which only the build knows. So the first load reads the host
 * off a request, stores the session, and reloads.
 */
export async function openLeague(page, path, owner) {
  let host = null;

  await page.clock.setFixedTime(new Date(FROZEN_AT));

  await page.route(/\/(rest|auth|functions|storage)\/v1\//, async (route) => {
    const request = route.request();
    host ??= new URL(request.url()).hostname;

    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': '*',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*'
    };

    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    const isRead = request.method() === 'GET' || request.method() === 'HEAD';
    const isRpc = request.url().includes('/rpc/');
    const isLive = request.url().includes('/functions/v1/live-scores');
    if (!isRead && !isRpc && !isLive) return route.fulfill({ status: 403, headers: cors, json: { message: 'read-only' } });

    const body = answer(request, owner);
    const wantsOne = (request.headers().accept ?? '').includes('vnd.pgrst.object');

    if (wantsOne && Array.isArray(body)) {
      if (body.length === 0) {
        return route.fulfill({ status: 406, headers: cors, json: { code: 'PGRST116', message: 'no rows' } });
      }
      return route.fulfill({ status: 200, headers: cors, json: body[0] });
    }

    return route.fulfill({ status: 200, headers: cors, json: body });
  });

  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await hostKnown(() => host);

  await page.evaluate(
    ([key, session]) => localStorage.setItem(key, JSON.stringify(session)),
    [`sb-${host.split('.')[0]}-auth-token`, sessionFor(owner)]
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
}

/** The app talks to Supabase as soon as it mounts; wait for it to have tried. */
async function hostKnown(read) {
  for (let attempt = 0; attempt < 100 && !read(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!read()) throw new Error('The app never called Supabase. Was it built with VITE_SUPABASE_URL?');
}
