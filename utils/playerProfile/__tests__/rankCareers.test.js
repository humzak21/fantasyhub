import { describe, it, expect } from 'vitest';

import { rankCareers, neighbours } from '../rankCareers.js';

const career = (playerId, name, position, pointsPerGame, gamesPlayed, weeksRostered, weeksStarted) => ({
  playerId, espnPlayerId: Number(playerId.replace(/\D/g, '')) || null, name, position,
  pointsPerGame, gamesPlayed, weeksRostered, weeksStarted
});

const ROWS = [
  career('a', 'Alpha', 'RB', 20, 10, 12, 10),
  career('b', 'Bravo', 'RB', 15, 8, 8, 8),
  career('c', 'Charlie', 'RB', 15, 6, 10, 6),
  career('d', 'Delta', 'RB', 10, 5, 5, 5),
  career('e', 'Echo', 'RB', 30, 4, 4, 4), // one big month: under the floor
  career('f', 'Foxtrot', 'RB', null, 0, 3, 0), // rostered, never played
  career('q', 'Quebec', 'QB', 18, 12, 12, 12)
];

describe('rankCareers', () => {
  const ranking = rankCareers(ROWS);
  const at = (id) => ranking.byPlayerId[id];

  it('ranks within the position by points per game, competition style', () => {
    expect(['a', 'b', 'c', 'd'].map((id) => at(id).rank)).toEqual([1, 2, 2, 4]);
    expect(at('a').of).toBe(4);
    expect(at('q')).toMatchObject({ rank: 1, of: 1 });
  });

  it('holds the 5-game floor: under it a player keeps his PPG and has no rank', () => {
    expect(at('d').qualified).toBe(true);
    expect(at('e')).toMatchObject({ qualified: false, rank: null, of: null, pointsPerGame: 30, gamesPlayed: 4 });
    expect(ranking.positions.RB.map((e) => e.playerId)).toEqual(['a', 'b', 'c', 'd']);
    expect(ranking.minGames).toBe(5);
  });

  it('moves the floor when asked', () => {
    expect(rankCareers(ROWS, { minGames: 4 }).byPlayerId.e.rank).toBe(1);
    expect(rankCareers(ROWS, { minGames: 7 }).positions.RB.map((e) => e.playerId)).toEqual(['a', 'b']);
  });

  it('gives a player who never played no PPG, never 0', () => {
    expect(at('f')).toMatchObject({ pointsPerGame: null, qualified: false, rank: null, percentile: null, startPct: 0 });
  });

  it('ranks start % among the qualified', () => {
    expect(at('a').startPct).toBeCloseTo(10 / 12);
    expect(['a', 'b', 'c', 'd'].map((id) => at(id).startRank)).toEqual([3, 1, 4, 1]);
    expect(at('b').startOf).toBe(4);
  });

  it('reads percentile as the share of peers he beats or ties', () => {
    expect(at('a').percentile).toBe(1);
    expect(at('b').percentile).toBeCloseTo(2 / 3);
    expect(at('d').percentile).toBe(0);
    expect(at('q').percentile).toBeNull();
  });

  it('accepts numeric strings as PostgREST may send them', () => {
    const r = rankCareers([career('x', 'X', 'K', '9.5', '6', '6', '6')]);
    expect(r.byPlayerId.x).toMatchObject({ pointsPerGame: 9.5, gamesPlayed: 6, qualified: true, rank: 1 });
  });
});

describe('neighbours', () => {
  const ranking = rankCareers(ROWS);
  const ids = (list) => list.map((e) => e.playerId);

  it('has nobody above the top of a position', () => {
    expect(ids(neighbours(ranking, 'a'))).toEqual(['a', 'b', 'c']);
  });

  it('has nobody below the bottom', () => {
    expect(ids(neighbours(ranking, 'd'))).toEqual(['b', 'c', 'd']);
  });

  it('takes span either side in the middle', () => {
    expect(ids(neighbours(ranking, 'b', 1))).toEqual(['a', 'b', 'c']);
  });

  it('places an unqualified player where his PPG would sit', () => {
    expect(ids(neighbours(ranking, 'e'))).toEqual(['e', 'a', 'b']);
  });

  it('is empty without a PPG or a player', () => {
    expect(neighbours(ranking, 'f')).toEqual([]);
    expect(neighbours(ranking, 'nobody')).toEqual([]);
    expect(neighbours(null, 'a')).toEqual([]);
  });
});
