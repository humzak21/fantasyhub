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

export const TEAMS = [
  team('team-final-a', 'Final Winners', 'Fiona Final', 1, 1, 3, 0),
  team('team-final-b', 'Final Losers', 'Frank Final', 2, 1, 2, 1),
  team('team-live-a', 'Live Leaders', 'Lena Live', 3, 1, 1, 2),
  team('team-live-b', 'Live Chasers', 'Liam Live', 4, 2, 2, 1),
  team('team-early-a', 'Early Birds', 'Erin Early', 5, 2, 1, 2),
  team('team-early-b', 'Late Starters', 'Luke Late', 6, 2, 0, 3)
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

const TABLES = { seasons: [SEASON], v_active_season: [SEASON], teams: TEAMS, divisions: DIVISIONS, games: GAMES };

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

  return TABLES[name] ?? [];
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
