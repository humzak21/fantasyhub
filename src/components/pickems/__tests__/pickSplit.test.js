/**
 * The arithmetic behind "how the league picked".
 *
 * What must not break: a share is counted against the picks entered for that
 * game, so a matchup's two shares add up to 100; a game nobody picked has no
 * share rather than 0%; byes are not matchups; and a winner is marked only
 * once its game is scored, never in a tie.
 */

import { describe, it, expect } from 'vitest';

import { isByeGame, summarizePickSplit } from '../pickSplit.js';

const team = (id, name) => ({ id, name, owner: `${name} Owner` });

const game = (id, team1, team2) => ({
  id,
  team1Id: team1?.id ?? null,
  team2Id: team2?.id ?? null,
  team1,
  team2
});

const T1 = team('t1', 'Glizzy Galaxy');
const T2 = team('t2', 'i chase brown kids');
const T3 = team('t3', 'Lightskin Empire');
const T4 = team('t4', 'Comeback season');

const GAMES = [game('g1', T1, T2), game('g2', T3, T4)];

/** The shape `getAllPicksForWeek` returns, reduced to what the split reads. */
const pick = (userId, gameId, teamId) => ({
  userId,
  gameId,
  pickedTeamId: teamId,
  predictedWinnerTeamId: teamId
});

describe('summarizePickSplit', () => {
  it('gives each team its share of the picks for its game, team 1 first', () => {
    const { matchups } = summarizePickSplit(GAMES, [
      pick('u1', 'g1', 't1'),
      pick('u2', 'g1', 't1'),
      pick('u3', 'g1', 't1'),
      pick('u4', 'g1', 't2')
    ]);

    const [first] = matchups;
    expect(first.gameId).toBe('g1');
    expect(first.total).toBe(4);
    expect(first.sides.map((side) => side.team.id)).toEqual(['t1', 't2']);
    expect(first.sides.map((side) => side.count)).toEqual([3, 1]);
    expect(first.sides.map((side) => side.share)).toEqual([75, 25]);
  });

  it('counts each game against its own picks, so the two shares add up to 100', () => {
    // u3 has no pick in g2 — a game corrected after they submitted, say. Their
    // absence must not read as a vote for nobody.
    const { matchups } = summarizePickSplit(GAMES, [
      pick('u1', 'g2', 't3'),
      pick('u2', 'g2', 't4'),
      pick('u3', 'g1', 't1')
    ]);

    const second = matchups.find((matchup) => matchup.gameId === 'g2');
    expect(second.total).toBe(2);
    expect(second.sides[0].share + second.sides[1].share).toBe(100);
  });

  it('gives a game nobody picked no share at all, rather than 0%', () => {
    const { matchups } = summarizePickSplit(GAMES, [pick('u1', 'g1', 't1')]);

    const unpicked = matchups.find((matchup) => matchup.gameId === 'g2');
    expect(unpicked.total).toBe(0);
    expect(unpicked.sides.map((side) => side.share)).toEqual([null, null]);
    expect(unpicked.sides.some((side) => side.trails)).toBe(false);
  });

  it('keeps a team nobody took at a real 0%, beside a game that was picked', () => {
    const { matchups } = summarizePickSplit(GAMES, [
      pick('u1', 'g1', 't1'),
      pick('u2', 'g1', 't1')
    ]);

    expect(matchups[0].sides.map((side) => side.share)).toEqual([100, 0]);
  });

  it('marks the side with fewer picks, and neither side of a dead heat', () => {
    const { matchups } = summarizePickSplit(GAMES, [
      pick('u1', 'g1', 't1'),
      pick('u2', 'g1', 't1'),
      pick('u3', 'g1', 't2'),
      pick('u1', 'g2', 't3'),
      pick('u2', 'g2', 't4')
    ]);

    expect(matchups[0].sides.map((side) => side.trails)).toEqual([false, true]);
    expect(matchups[1].sides.map((side) => side.trails)).toEqual([false, false]);
  });

  it('skips byes, which are not matchups anybody picks', () => {
    const { matchups } = summarizePickSplit([...GAMES, game('bye', T1, null)], []);

    expect(matchups.map((matchup) => matchup.gameId)).toEqual(['g1', 'g2']);
  });

  it('ignores a pick for neither team, and a pick for a game not in the week', () => {
    const { submitted, matchups } = summarizePickSplit(GAMES, [
      pick('u1', 'g1', 't1'),
      pick('u2', 'g1', 't9'),
      pick('u3', 'g9', 't1')
    ]);

    expect(matchups[0].total).toBe(1);
    // Neither u2 nor u3 picked anything this split is made of.
    expect(submitted).toBe(1);
  });

  it('counts every member who picked, once', () => {
    const { submitted } = summarizePickSplit(GAMES, [
      pick('u1', 'g1', 't1'),
      pick('u1', 'g2', 't3'),
      pick('u2', 'g1', 't2'),
      pick('u2', 'g2', 't3')
    ]);

    expect(submitted).toBe(2);
  });

  it('marks the winner of a scored game, whichever side the league backed', () => {
    const scored = [{ ...GAMES[0], isCompleted: true, winnerTeamId: 't2' }, GAMES[1]];
    const { matchups } = summarizePickSplit(scored, [
      pick('u1', 'g1', 't1'),
      pick('u2', 'g1', 't1')
    ]);

    expect(matchups[0].decided).toBe(true);
    expect(matchups[0].sides.map((side) => side.won)).toEqual([false, true]);
  });

  it('marks no winner before a game is scored', () => {
    // A winner id on an unfinished row must not be believed.
    const early = [{ ...GAMES[0], isCompleted: false, winnerTeamId: 't1' }];
    const [matchup] = summarizePickSplit(early, []).matchups;

    expect(matchup.decided).toBe(false);
    expect(matchup.sides.some((side) => side.won)).toBe(false);
  });

  it('marks no winner for a tie, which is still a scored game', () => {
    const tie = [{ ...GAMES[0], isCompleted: true, winnerTeamId: null }];
    const [matchup] = summarizePickSplit(tie, []).matchups;

    expect(matchup.decided).toBe(true);
    expect(matchup.sides.some((side) => side.won)).toBe(false);
  });

  it('reads the stored winner when the joined team id is absent', () => {
    const { matchups } = summarizePickSplit(GAMES, [
      { userId: 'u1', gameId: 'g1', predictedWinnerTeamId: 't2' }
    ]);

    expect(matchups[0].sides[1].count).toBe(1);
  });

  it('takes a game\'s team ids from its flat columns when the join is missing one', () => {
    const flat = { id: 'g1', team1Id: 't1', team2Id: 't2', team1: { name: 'A' }, team2: T2 };
    const { matchups } = summarizePickSplit([flat], [pick('u1', 'g1', 't1')]);

    expect(matchups[0].sides[0].count).toBe(1);
  });
});

describe('isByeGame', () => {
  it('is a game with no second team, or one typed as a bye', () => {
    expect(isByeGame(game('g', T1, T2))).toBe(false);
    expect(isByeGame(game('g', T1, null))).toBe(true);
    expect(isByeGame({ ...game('g', T1, T2), type: 'bye' })).toBe(true);
  });
});
