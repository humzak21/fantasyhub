import { describe, it, expect } from 'vitest';

import {
  applyLiveScores,
  canBeLive,
  joinLiveWeek,
  liveStandingsWeek,
  overlayGame,
  overlayLineups
} from '../liveOverlay.js';
import { GAME_STATE } from '../../services/espnLiveScoreMapper.js';

const WEEK = 8;

const teams = [
  { id: 'team-a', espn_team_id: 6 },
  { id: 'team-b', espn_team_id: 2 },
  { id: 'team-c', espn_team_id: 3 },
  { id: 'team-d', espn_team_id: 8 }
];

const game = (overrides) => ({
  id: 'game-1',
  week: WEEK,
  type: 'regular',
  team1Id: 'team-a',
  team2Id: 'team-b',
  team1Score: null,
  team2Score: null,
  espn_matchup_id: 50,
  ...overrides
});

const games = [
  game(),
  game({ id: 'game-2', team1Id: 'team-c', team2Id: 'team-d', espn_matchup_id: 51 })
];

const side = (espnTeamId, points, projected) => ({ espnTeamId, points, projected });

const entry = (espnPlayerId, overrides) => ({
  espnPlayerId,
  playerName: `Player ${espnPlayerId}`,
  position: 'RB',
  proTeamId: 12, // KC
  lineupSlotId: 2,
  started: true,
  actualPoints: null,
  projectedPoints: 10,
  injuryStatus: 'ACTIVE',
  ...overrides
});

const raw = (overrides) => ({
  matchups: [
    { espnMatchupId: 50, home: side(6, 18.5, 132.8), away: side(2, 40, 119.4), espnWinner: 'UNDECIDED' },
    { espnMatchupId: 51, home: side(8, 7, 100), away: side(3, 9, 101), espnWinner: 'UNDECIDED' }
  ],
  lineups: { 6: [entry(1, { actualPoints: 18.5 })], 2: [entry(2)], 3: [entry(3)], 8: [entry(4)] },
  nflGames: { KC: { state: GAME_STATE.IN_PROGRESS } },
  live: true,
  windowOpen: true,
  refreshedAt: '2026-11-01T19:30:00Z',
  ...overrides
});

const join = (overrides, leagueGames = games) =>
  joinLiveWeek(raw(overrides), { teams, games: leagueGames, week: WEEK });

describe('canBeLive', () => {
  it('is on for a week with a game still to be scored', () => {
    expect(canBeLive({ week: WEEK, actualWeek: WEEK, games })).toBe(true);
  });

  it('holds last week until its scores land', () => {
    expect(canBeLive({ week: WEEK, actualWeek: WEEK + 1, games })).toBe(true);

    const scored = games.map((g) => ({ ...g, team1Score: 100, team2Score: 90 }));
    expect(canBeLive({ week: WEEK, actualWeek: WEEK + 1, games: scored })).toBe(false);
  });

  it('never runs for history, the future, or before the facts are known', () => {
    expect(canBeLive({ week: WEEK, actualWeek: WEEK + 2, games })).toBe(false);
    expect(canBeLive({ week: WEEK + 1, actualWeek: WEEK, games })).toBe(false);
    expect(canBeLive({ week: WEEK, actualWeek: null, games })).toBe(false);
    expect(canBeLive({ week: WEEK, actualWeek: WEEK, games: undefined })).toBe(false);
  });

  it('does not count a bye row as a game to wait for', () => {
    const byes = [game({ type: 'bye', team2Id: null })];
    expect(canBeLive({ week: WEEK, actualWeek: WEEK, games: byes })).toBe(false);
  });
});

describe('joinLiveWeek', () => {
  it('is null until something has been stored', () => {
    expect(joinLiveWeek({ refreshedAt: null }, { teams, games, week: WEEK })).toBeNull();
    expect(joinLiveWeek(null, { teams, games, week: WEEK })).toBeNull();
  });

  it('turns ESPN ids into this league\'s', () => {
    const live = join();

    expect(live.games['game-1'].team1).toEqual(side(6, 18.5, 132.8));
    expect(Object.keys(live.lineups).sort()).toEqual(['team-a', 'team-b', 'team-c', 'team-d']);
  });

  it('puts each side on its own team, whichever way ESPN has them', () => {
    expect(join().games['game-2']).toMatchObject({ team1: side(3, 9, 101), team2: side(8, 7, 100) });
  });

  it('falls back to the pair of teams for a game with no ESPN id', () => {
    const adopted = [game({ espn_matchup_id: null }), games[1]];
    expect(join({}, adopted).games['game-1'].team2).toEqual(side(2, 40, 119.4));
  });

  it('drops a game with a score, lineup and all: official wins', () => {
    const live = join({}, [game({ team1Score: 110, team2Score: 90 }), games[1]]);

    expect(live.games['game-1']).toBeUndefined();
    expect(live.lineups['team-a']).toBeUndefined();
    expect(live.games['game-2']).toBeDefined();
  });
});

describe('overlayGame', () => {
  it('carries the live side without touching the game\'s own scores', () => {
    const overlaid = overlayGame(games[0], join());

    expect(overlaid.live.team1.points).toBe(18.5);
    expect(overlaid.team1Score).toBeNull();
    expect(overlaid.team2Score).toBeNull();
  });

  it('has no live side with no snapshot', () => {
    expect(overlayGame(games[0], null).live).toBeNull();
  });
});

describe('overlayLineups', () => {
  const rosterRow = (espnPlayerId, overrides) => ({
    id: `row-${espnPlayerId}`,
    teamId: 'team-a',
    espnPlayerId,
    proTeamId: 12,
    rosterSlot: 'RB',
    started: true,
    position: 'RB',
    actualPoints: null,
    projectedPoints: 8,
    injuryStatus: 'ACTIVE',
    updatedAt: '2026-11-01T16:40:00Z',
    player: { name: `Player ${espnPlayerId}` },
    ...overrides
  });

  it('hands rows back untouched with no snapshot, or before they have loaded', () => {
    const rows = { 'team-a': [rosterRow(1)] };

    expect(overlayLineups(rows, null)).toBe(rows);
    expect(overlayLineups(undefined, join())).toBeUndefined();
  });

  it('leaves a team the snapshot has nothing on as it was', () => {
    const rows = { 'team-z': [rosterRow(9)] };
    expect(overlayLineups(rows, join())['team-z']).toBe(rows['team-z']);
  });

  it('prefers the live figure to a projection, and keeps a projection where there is none', () => {
    const live = join({
      lineups: { 6: [entry(1, { actualPoints: 18.5 }), entry(5, { projectedPoints: 12 })] }
    });
    const [played, waiting] = overlayLineups({ 'team-a': [rosterRow(1), rosterRow(5)] }, live)['team-a'];

    expect(played).toMatchObject({ id: 'row-1', actualPoints: 18.5, projectedPoints: 10 });
    expect(waiting).toMatchObject({ actualPoints: null, projectedPoints: 12 });
  });

  it('tags each row with its NFL game, and calls a team off the slate a bye', () => {
    const live = join({
      lineups: { 6: [entry(1), entry(2, { proTeamId: 2 })] },
      nflGames: { KC: { state: GAME_STATE.FINAL } }
    });
    const [kc, buf] = overlayLineups({ 'team-a': [] }, live)['team-a'];

    expect(kc.nflState).toBe(GAME_STATE.FINAL);
    expect(buf.nflState).toBe(GAME_STATE.NO_GAME);
  });

  it('reads an empty slate as unknown, not as a league of byes', () => {
    const live = join({ nflGames: {} });
    expect(overlayLineups({ 'team-a': [rosterRow(1)] }, live)['team-a'][0].nflState).toBeNull();
  });

  describe('whose lineup it is', () => {
    const benchedAt1255 = entry(1, { lineupSlotId: 20, started: false });
    const live = join({ lineups: { 6: [benchedAt1255, entry(7)] } });

    it('takes the snapshot when it is newer than the roster sync', () => {
      const rows = overlayLineups({ 'team-a': [rosterRow(1)] }, live)['team-a'];

      expect(rows.map((row) => row.espnPlayerId)).toEqual([1, 7]);
      expect(rows[0]).toMatchObject({ id: 'row-1', rosterSlot: 'BE', started: false });
    });

    it('renders a pickup with no players row from the snapshot alone', () => {
      const pickup = overlayLineups({ 'team-a': [rosterRow(1)] }, live)['team-a'][1];

      expect(pickup).toMatchObject({
        id: 'live-7',
        rosterSlot: 'RB',
        started: true,
        player: { name: 'Player 7', position: 'RB', teamAbbreviation: 'KC', proTeamId: 12 }
      });
    });

    it('keeps the roster when the snapshot is older, with the snapshot\'s points on it', () => {
      const thursday = join({
        lineups: { 6: [entry(1, { actualPoints: 18.5, lineupSlotId: 20, started: false }), entry(7)] },
        refreshedAt: '2026-10-30T03:00:00Z'
      });
      const rows = overlayLineups({ 'team-a': [rosterRow(1), rosterRow(5)] }, thursday)['team-a'];

      expect(rows.map((row) => row.espnPlayerId)).toEqual([1, 5]);
      expect(rows[0]).toMatchObject({ rosterSlot: 'RB', started: true, actualPoints: 18.5 });
      expect(rows[1]).toMatchObject({ actualPoints: null, projectedPoints: 8 });
    });
  });

  it('reads injury status the way the roster sync stores it', () => {
    const live = join({ lineups: { 6: [entry(1, { injuryStatus: 'O' })] } });
    const [row] = overlayLineups({ 'team-a': [] }, live)['team-a'];

    expect(row.injuryStatus).toBe('OUT');
  });
});

describe('liveStandingsWeek', () => {
  it('is this week while its games are unscored', () => {
    expect(liveStandingsWeek({ actualWeek: WEEK, games })).toBe(WEEK);
  });

  it('holds last week until its scores land, in the small hours of Tuesday', () => {
    expect(liveStandingsWeek({ actualWeek: WEEK + 1, games })).toBe(WEEK);
  });

  it('is nothing once every game is scored, or before the week is known', () => {
    const scored = games.map((g) => ({ ...g, team1Score: 100, team2Score: 90 }));

    expect(liveStandingsWeek({ actualWeek: WEEK, games: scored })).toBeNull();
    expect(liveStandingsWeek({ actualWeek: null, games })).toBeNull();
  });
});

describe('applyLiveScores', () => {
  const liveWith = (first, second) => ({
    games: { 'game-1': { team1: side(6, first, 100), team2: side(2, second, 100) } }
  });

  it('plays a game as if it ended now, without calling it complete', () => {
    const [game, untouched] = applyLiveScores(games, liveWith(18.5, 40));

    expect(game).toMatchObject({ team1Score: 18.5, team2Score: 40 });
    expect(game.isCompleted).toBeUndefined();
    expect(untouched).toBe(games[1]);
  });

  it('leaves a game at 0-0 alone: it has not started, and is not a tie', () => {
    expect(applyLiveScores(games, liveWith(0, 0))[0]).toBe(games[0]);
  });

  it('leaves the caller\'s games alone, and everything without a snapshot', () => {
    applyLiveScores(games, liveWith(18.5, 40));

    expect(games[0].team1Score).toBeNull();
    expect(applyLiveScores(games, null)).toEqual(games);
  });
});
