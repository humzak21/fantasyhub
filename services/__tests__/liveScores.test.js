import { describe, it, expect } from 'vitest';

import {
  EMPTY_LIVE_WEEK,
  LIVE_REFRESH_TTL_MS,
  LIVE_TAIL_MS,
  anyNflGameLive,
  buildLiveSnapshot,
  isRefreshableWeek,
  mapLiveLineups,
  mapLiveMatchups,
  mapNflGames,
  planLiveRead,
  toLiveResponse
} from '../liveScores.js';
import { ESPNScheduleFetcher } from '../espnScheduleFetcher.js';
import { GAME_STATE } from '../espnLiveScoreMapper.js';

const WEEK = 8;

const playerEntry = ({ id, slot, applied = 0, projected = 10, played = false }) => ({
  lineupSlotId: slot,
  playerPoolEntry: {
    id,
    appliedStatTotal: applied,
    player: {
      id,
      fullName: `Player ${id}`,
      defaultPositionId: 2,
      proTeamId: 12,
      injuryStatus: 'ACTIVE',
      stats: [
        { statSourceId: 1, statSplitTypeId: 1, scoringPeriodId: WEEK, appliedTotal: projected, stats: { 1: 1 } },
        ...(played
          ? [{ statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: WEEK, appliedTotal: applied, stats: { 25: 1 } }]
          : [])
      ]
    }
  }
});

/** The shape ESPN served mid-week on 2026-11-02, cut down to what is read. */
const rawMatchup = {
  id: 50,
  matchupPeriodId: WEEK,
  winner: 'UNDECIDED',
  home: {
    teamId: 6,
    totalPoints: 0,
    totalPointsLive: 18.5,
    totalProjectedPoints: 126.5,
    totalProjectedPointsLive: 132.85,
    rosterForCurrentScoringPeriod: {
      entries: [
        playerEntry({ id: 1, slot: 2, applied: 18.5, played: true }),
        playerEntry({ id: 2, slot: 2 }),
        playerEntry({ id: 3, slot: 20 })
      ]
    }
  },
  away: {
    teamId: 2,
    totalPoints: 0,
    totalPointsLive: 0,
    totalProjectedPoints: 108.97,
    totalProjectedPointsLive: 119.47,
    rosterForCurrentScoringPeriod: { entries: [playerEntry({ id: 4, slot: 0 })] }
  }
};

const parsed = new ESPNScheduleFetcher('1', 2026).parseMatchupData(rawMatchup, [], {}, []);
const weekData = { week: WEEK, matchups: [parsed] };

const scoreboard = {
  events: [
    {
      id: '1',
      status: { type: { state: 'in', shortDetail: '7:10 - 2nd' }, displayClock: '7:10', period: 2 },
      competitions: [{ competitors: [{ team: { abbreviation: 'KC' } }, { team: { abbreviation: 'WAS' } }] }]
    },
    {
      id: '2',
      status: { type: { state: 'post', shortDetail: 'Final' } },
      competitions: [{ competitors: [{ team: { abbreviation: 'GB' } }, { team: { abbreviation: 'DET' } }] }]
    }
  ]
};

describe('mapLiveMatchups', () => {
  it('reads the score so far from totalPointsLive, not the settled totalPoints', () => {
    const [matchup] = mapLiveMatchups(weekData.matchups);

    expect(matchup).toEqual({
      espnMatchupId: 50,
      home: { espnTeamId: 6, points: 18.5, projected: 132.85 },
      away: { espnTeamId: 2, points: 0, projected: 119.47 },
      espnWinner: 'UNDECIDED'
    });
  });

  it('leaves a week that has not begun without a score, with the pregame projection', () => {
    const { totalPointsLive, totalProjectedPointsLive, ...home } = rawMatchup.home;
    const future = new ESPNScheduleFetcher('1', 2026).parseMatchupData({ ...rawMatchup, home }, [], {}, []);

    expect(mapLiveMatchups([future])[0].home).toEqual({ espnTeamId: 6, points: null, projected: 126.5 });
  });

  it('keeps the score of a settled matchup', () => {
    const { totalPointsLive, ...home } = { ...rawMatchup.home, totalPoints: 121.2 };
    const settled = new ESPNScheduleFetcher('1', 2026).parseMatchupData(
      { ...rawMatchup, winner: 'HOME', home },
      [],
      {},
      []
    );

    expect(mapLiveMatchups([settled])[0].home.points).toBe(121.2);
  });

  it('has no away side on a bye', () => {
    const { away, ...bye } = rawMatchup;
    const [matchup] = mapLiveMatchups([new ESPNScheduleFetcher('1', 2026).parseMatchupData(bye, [], {}, [])]);

    expect(matchup.home.espnTeamId).toBe(6);
    expect(matchup.away).toBeNull();
  });
});

describe('mapLiveLineups', () => {
  const lineups = mapLiveLineups(weekData.matchups, WEEK);

  it('groups by ESPN team, bench included', () => {
    expect(Object.keys(lineups).sort()).toEqual(['2', '6']);
    expect(lineups[6]).toHaveLength(3);
    expect(lineups[6].map((row) => row.started)).toEqual([true, true, false]);
  });

  it('holds a 0 before kickoff as no actual, and a stat line as a real figure', () => {
    expect(lineups[6][0]).toMatchObject({ actualPoints: 18.5, projectedPoints: 10 });
    expect(lineups[6][1]).toMatchObject({ actualPoints: null, projectedPoints: 10 });
  });

  it('counts a finished game with no stat line as a real 0', () => {
    const final = mapLiveLineups(weekData.matchups, WEEK, { KC: { state: GAME_STATE.FINAL } });
    const playing = mapLiveLineups(weekData.matchups, WEEK, { KC: { state: GAME_STATE.IN_PROGRESS } });

    expect(final[6][1].actualPoints).toBe(0);
    expect(playing[6][1].actualPoints).toBeNull();
  });

  it('leaves the stat breakdown behind', () => {
    expect(lineups[6][0]).not.toHaveProperty('statBreakdown');
  });
});

describe('mapNflGames', () => {
  const games = mapNflGames(scoreboard);

  it('keys both teams of a game by the abbreviation both payloads agree on', () => {
    expect(games.KC).toEqual({ state: GAME_STATE.IN_PROGRESS, detail: '7:10 - 2nd', clock: '7:10', period: 2 });
    expect(games.WSH).toEqual(games.KC);
  });

  it('says whether any game is on', () => {
    expect(anyNflGameLive(games)).toBe(true);
    expect(anyNflGameLive({ GB: games.GB })).toBe(false);
  });
});

describe('buildLiveSnapshot', () => {
  it('writes the columns of one refresh', () => {
    const snapshot = buildLiveSnapshot({ weekData, week: WEEK, scoreboard });

    expect(snapshot.matchups).toHaveLength(1);
    expect(Object.keys(snapshot.lineups)).toHaveLength(2);
    expect(snapshot.nfl_games.KC.state).toBe(GAME_STATE.IN_PROGRESS);
    expect(snapshot.live).toBe(true);
  });

  it('is not live once every game has finished', () => {
    const finished = { events: [scoreboard.events[1]] };
    expect(buildLiveSnapshot({ weekData, week: WEEK, scoreboard: finished }).live).toBe(false);
  });

  it('keeps the last NFL games when the scoreboard failed, and trusts the window', () => {
    const previous = { nfl_games: { KC: { state: GAME_STATE.FINAL } } };
    const snapshot = buildLiveSnapshot({ weekData, week: WEEK, scoreboard: null, previous, windowOpen: true });

    expect(snapshot.nfl_games).toEqual(previous.nfl_games);
    expect(snapshot.live).toBe(true);
  });
});

describe('isRefreshableWeek', () => {
  it('allows this week and last week, and nothing else', () => {
    expect(isRefreshableWeek(8, 8)).toBe(true);
    expect(isRefreshableWeek(7, 8)).toBe(true);
    expect(isRefreshableWeek(6, 8)).toBe(false);
    expect(isRefreshableWeek(9, 8)).toBe(false);
  });
});

describe('planLiveRead', () => {
  const sunday = new Date('2026-11-01T19:00:00Z');
  const kickoffs = ['2026-11-01T18:00:00Z'];
  const base = { now: sunday, week: WEEK, actualWeek: WEEK, kickoffs };
  const ago = (ms) => new Date(sunday.getTime() - ms).toISOString();

  it('refreshes inside a window once the TTL has lapsed', () => {
    const snapshot = { refreshed_at: ago(LIVE_REFRESH_TTL_MS), live: true };
    expect(planLiveRead({ ...base, snapshot })).toMatchObject({ windowOpen: true, refresh: true });
  });

  it('serves the snapshot inside the TTL', () => {
    const snapshot = { refreshed_at: ago(LIVE_REFRESH_TTL_MS - 1000), live: true };
    expect(planLiveRead({ ...base, snapshot }).refresh).toBe(false);
  });

  it('refreshes when nothing is stored yet', () => {
    expect(planLiveRead(base).refresh).toBe(true);
  });

  it('does nothing outside a window with no game on', () => {
    const wednesday = new Date('2026-11-04T19:00:00Z');
    const snapshot = { refreshed_at: '2026-11-03T01:00:00Z', live: false };

    expect(planLiveRead({ ...base, now: wednesday, snapshot })).toEqual({
      windowOpen: false,
      live: false,
      refresh: false
    });
  });

  it('takes one more look past the window while the row still says a game is on', () => {
    const after = new Date('2026-11-02T00:00:00Z');
    const snapshot = { refreshed_at: '2026-11-01T22:30:00Z', live: true };

    expect(planLiveRead({ ...base, now: after, snapshot })).toMatchObject({
      windowOpen: false,
      live: true,
      refresh: true
    });
  });

  it('stops believing a row that has not been refreshed for hours', () => {
    const later = new Date(Date.parse('2026-11-01T22:30:00Z') + LIVE_TAIL_MS);
    const snapshot = { refreshed_at: '2026-11-01T22:30:00Z', live: true };

    expect(planLiveRead({ ...base, now: later, snapshot })).toMatchObject({ live: false, refresh: false });
  });

  it('never refreshes a week nobody is playing, however the window reads', () => {
    expect(planLiveRead({ ...base, week: 3 }).refresh).toBe(false);
    expect(planLiveRead({ ...base, week: 9 }).refresh).toBe(false);
  });
});

describe('toLiveResponse', () => {
  it('answers empty before the first refresh, but still reports the window', () => {
    expect(toLiveResponse(null, { windowOpen: true })).toEqual({ ...EMPTY_LIVE_WEEK, windowOpen: true });
    expect(toLiveResponse({ refreshed_at: null, live: false }, {}).refreshedAt).toBeNull();
  });

  it('camel-cases the stored row', () => {
    const response = toLiveResponse(
      { matchups: [1], lineups: { 6: [] }, nfl_games: { KC: {} }, refreshed_at: 'then' },
      { live: true, windowOpen: true }
    );

    expect(response).toEqual({
      matchups: [1],
      lineups: { 6: [] },
      nflGames: { KC: {} },
      live: true,
      windowOpen: true,
      refreshedAt: 'then'
    });
  });
});
