import { describe, it, expect } from 'vitest';

import {
  POSITION_SPREADS,
  calibrateSpreads,
  countOutlooks,
  fractionLeft,
  pickOutlook,
  sideOutlook
} from '../pickOutlook.js';
import { GAME_STATE } from '../../../../services/espnLiveScoreMapper.js';

const { NOT_STARTED, IN_PROGRESS, FINAL, NO_GAME } = GAME_STATE;

const starter = (nflState, overrides) => ({
  started: true,
  rosterSlot: 'RB',
  position: 'RB',
  proTeamId: 12,
  actualPoints: null,
  projectedPoints: 12,
  nflState,
  ...overrides
});

const lineup = (count, nflState, overrides) => Array.from({ length: count }, () => starter(nflState, overrides));

const game = (overrides) => ({
  id: 'g1',
  team1: { id: 'a' },
  team2: { id: 'b' },
  isCompleted: false,
  winnerTeamId: null,
  ...overrides
});

const outlook = ({ a, b, picked = 'a', liveSides = null, nflGames = {} }) =>
  pickOutlook({ game: game(), pickedTeamId: picked, rowsByTeam: { a, b }, liveSides, nflGames });

describe('fractionLeft', () => {
  it('counts a game not yet started as all to come, and a finished one as none', () => {
    expect(fractionLeft(NOT_STARTED)).toBe(1);
    expect(fractionLeft(FINAL)).toBe(0);
    expect(fractionLeft(NO_GAME)).toBe(0);
  });

  it('reads the quarter and the clock', () => {
    expect(fractionLeft(IN_PROGRESS, { period: 1, clock: '15:00' })).toBe(1);
    expect(fractionLeft(IN_PROGRESS, { period: 3, clock: '15:00' })).toBe(0.5);
    expect(fractionLeft(IN_PROGRESS, { period: 4, clock: '7:30' })).toBe(0.125);
  });

  it('leaves a little for overtime, and assumes the middle with no clock', () => {
    expect(fractionLeft(IN_PROGRESS, { period: 5, clock: '10:00' })).toBeCloseTo(0.05);
    expect(fractionLeft(IN_PROGRESS, null)).toBe(0.5);
  });
});

describe('sideOutlook', () => {
  it('counts starters only', () => {
    const rows = [starter(NOT_STARTED), starter(NOT_STARTED, { started: false, rosterSlot: 'BE' })];
    expect(sideOutlook({ rows }).left).toBe(1);
  });

  it('prefers ESPN\'s own score and projection to the rows\' sums', () => {
    const rows = [starter(IN_PROGRESS, { actualPoints: 5 })];

    expect(sideOutlook({ rows })).toMatchObject({ points: 5 });
    expect(sideOutlook({ rows, live: { points: 5.5, projected: 19 } })).toMatchObject({
      points: 5.5,
      expected: 19
    });
  });

  it('shrinks the uncertainty as a game runs down', () => {
    const nflGames = { KC: { state: IN_PROGRESS, period: 3, clock: '15:00' } };
    const halfway = sideOutlook({ rows: [starter(IN_PROGRESS)], nflGames });
    const fresh = sideOutlook({ rows: [starter(NOT_STARTED)], nflGames });

    expect(fresh.variance).toBeCloseTo(POSITION_SPREADS.RB ** 2);
    expect(halfway.variance).toBeCloseTo(fresh.variance / 2);
  });

  it('expects nothing from a starter on a bye', () => {
    expect(sideOutlook({ rows: [starter(NO_GAME)] })).toMatchObject({ left: 0, expected: 0 });
  });
});

describe('pickOutlook, once official', () => {
  it('says hit or miss, and only then', () => {
    const finished = game({ isCompleted: true, winnerTeamId: 'a' });

    expect(pickOutlook({ game: finished, pickedTeamId: 'a' }).label).toBe('Hit');
    expect(pickOutlook({ game: finished, pickedTeamId: 'b' }).label).toBe('Miss');
  });

  it('calls a tie a miss, as the scoring does, and says why', () => {
    const tied = pickOutlook({ game: game({ isCompleted: true }), pickedTeamId: 'a' });
    expect(tied).toMatchObject({ label: 'Miss', detail: 'the game tied' });
  });
});

describe('pickOutlook, with nothing to say', () => {
  it('has no chip without a pick, on a bye, or without lineups', () => {
    expect(outlook({ a: lineup(9, NOT_STARTED), b: lineup(9, NOT_STARTED), picked: null })).toBeNull();
    expect(pickOutlook({ game: game({ team2: null }), pickedTeamId: 'a' })).toBeNull();
    expect(outlook({ a: [], b: [] })).toBeNull();
  });

  it('has no chip for a pick on neither team, a pairing that has changed', () => {
    expect(outlook({ a: lineup(9, NOT_STARTED), b: lineup(9, NOT_STARTED), picked: 'c' })).toBeNull();
  });

  it('says nothing about a favourite or a close pick before kickoff', () => {
    expect(outlook({ a: lineup(9, NOT_STARTED, { projectedPoints: 14 }), b: lineup(9, NOT_STARTED) })).toBeNull();
  });
});

describe('pickOutlook, before kickoff', () => {
  it('marks a pick that projects at least 8 behind as an underdog', () => {
    const chip = outlook({ a: lineup(9, NOT_STARTED), b: lineup(9, NOT_STARTED, { projectedPoints: 13 }) });
    expect(chip).toMatchObject({ key: 'underdog', detail: 'projected 9.0 behind' });
  });

  it('works from projections alone, before the overlay has touched the rows', () => {
    const chip = outlook({
      a: lineup(9, undefined, { nflState: undefined }),
      b: lineup(9, undefined, { nflState: undefined, projectedPoints: 13 })
    });
    expect(chip.key).toBe('underdog');
  });
});

describe('pickOutlook, in play', () => {
  const played = (points) => starter(FINAL, { actualPoints: points });

  it('locks when the other side has nobody left and trails', () => {
    const chip = outlook({
      a: [played(60), starter(NOT_STARTED)],
      b: [played(50)],
      liveSides: { team1: { points: 60 }, team2: { points: 50 } }
    });
    expect(chip).toMatchObject({ key: 'locked', detail: 'opponent has nobody left', variant: 'success' });
  });

  it('is lost when the picked side has nobody left and trails', () => {
    const chip = outlook({ a: [played(50)], b: [played(60), starter(NOT_STARTED)] });
    expect(chip).toMatchObject({ key: 'lost', detail: 'lost by 10.0', variant: 'destructive' });
  });

  it('is safe at 90% or better', () => {
    const chip = outlook({
      a: [played(100), starter(NOT_STARTED)],
      b: [played(40), starter(NOT_STARTED)]
    });
    expect(chip).toMatchObject({ key: 'safe', variant: 'success' });
    expect(chip.probability).toBeGreaterThanOrEqual(0.9);
  });

  it('is a coin flip when the two are level', () => {
    const chip = outlook({
      a: [played(50), starter(NOT_STARTED)],
      b: [played(50), starter(NOT_STARTED)]
    });
    expect(chip.key).toBe('coinFlip');
    expect(chip.probability).toBeCloseTo(0.5);
  });

  it('is on track with a real edge short of safe', () => {
    const chip = outlook({
      a: [played(60), starter(NOT_STARTED)],
      b: [played(50), starter(NOT_STARTED)]
    });
    expect(chip.key).toBe('onTrack');
  });

  it('is in danger behind, and says what it needs', () => {
    const chip = outlook({
      a: [played(50), starter(NOT_STARTED), starter(NOT_STARTED)],
      b: [played(68), starter(NOT_STARTED)]
    });
    expect(chip).toMatchObject({ key: 'inDanger', detail: 'needs 30.0 from 2 players' });
  });

  it('says what it needs even when the opponent has finished', () => {
    const chip = outlook({
      a: [played(97.3), starter(NOT_STARTED, { projectedPoints: 5.8 })],
      b: [played(122.6)]
    });
    expect(chip).toMatchObject({ key: 'inDanger', detail: 'needs 25.3 from 1 player' });
  });

  it('says what can catch a lead', () => {
    const chip = outlook({
      a: [played(80), starter(NOT_STARTED)],
      b: [played(50), starter(NOT_STARTED), starter(NOT_STARTED)]
    });
    expect(chip.detail).toBe('opponent has 2 left');
  });

  it('never reads red while the pick can still hit', () => {
    const chip = outlook({
      a: [played(10), starter(NOT_STARTED)],
      b: [played(100), starter(NOT_STARTED)]
    });
    expect(chip.variant).not.toBe('destructive');
  });

  it('calls an upset when an underdog pick leads', () => {
    const chip = outlook({
      a: [played(40), starter(NOT_STARTED, { projectedPoints: 2 })],
      b: [played(30), starter(NOT_STARTED, { projectedPoints: 25 })]
    });
    expect(chip).toMatchObject({ key: 'upsetAlert', trailing: false });
  });

  it('calls an upset when a favourite trails with more left on the other side', () => {
    const chip = outlook({
      a: [played(50), starter(NOT_STARTED, { projectedPoints: 35 })],
      b: [played(60), starter(NOT_STARTED), starter(NOT_STARTED)],
      liveSides: { team1: { points: 50, projected: 85 }, team2: { points: 60, projected: 84 } }
    });
    expect(chip).toMatchObject({ key: 'upsetAlert', trailing: true });
  });

  it('takes the picked side\'s view from either team', () => {
    const rows = {
      a: [played(100), starter(NOT_STARTED)],
      b: [played(40), starter(NOT_STARTED)]
    };
    const chip = pickOutlook({ game: game(), pickedTeamId: 'b', rowsByTeam: rows });
    expect(chip.key).toBe('inDanger');
  });

  it('reads a game on the field as under way, before a point is scored', () => {
    const chip = outlook({ a: lineup(9, IN_PROGRESS), b: lineup(9, NOT_STARTED) });
    expect(chip).not.toBeNull();
  });
});

describe('countOutlooks', () => {
  it('counts what is safe and what is in danger', () => {
    expect(
      countOutlooks([
        { key: 'hit' },
        { key: 'locked' },
        { key: 'safe' },
        { key: 'onTrack' },
        { key: 'inDanger' },
        { key: 'upsetAlert', trailing: true },
        { key: 'upsetAlert', trailing: false },
        { key: 'lost' },
        null
      ])
    ).toEqual({ live: true, safe: 3, danger: 2 });
  });

  it('is not live on underdog chips alone, which are about kickoff', () => {
    expect(countOutlooks([{ key: 'underdog' }, null]).live).toBe(false);
  });
});

describe('calibrateSpreads', () => {
  it('measures the root-mean-square miss by position', () => {
    const rows = [
      { position: 'RB', projectedPoints: 10, actualPoints: 13 },
      { position: 'RB', projectedPoints: 10, actualPoints: 7 },
      { position: 'K', projectedPoints: 8, actualPoints: 8 }
    ];

    expect(calibrateSpreads(rows)).toEqual({
      RB: { spread: 3, mean: 0, rows: 2 },
      K: { spread: 0, mean: 0, rows: 1 }
    });
  });

  it('leaves out a row with no projection, which has nothing to miss by', () => {
    expect(calibrateSpreads([{ position: 'RB', projectedPoints: 0, actualPoints: 13 }])).toEqual({});
  });
});
