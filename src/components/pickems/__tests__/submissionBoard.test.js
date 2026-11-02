import { describe, it, expect } from 'vitest';
import { submissionMatchups, submissionScore } from '../submissionBoard.js';

const game = (id) => ({ id, team1: { id: `${id}-1` }, team2: { id: `${id}-2` } });

describe('submissionMatchups', () => {
  it('follows the form rather than the order the picks were stored in', () => {
    const matchups = submissionMatchups(
      [game('g1'), game('g2')],
      [{ gameId: 'g2' }, { gameId: 'g1' }]
    );

    expect(matchups.map((m) => m.gameId)).toEqual(['g1', 'g2']);
  });

  it('lists a matchup nobody picked', () => {
    expect(submissionMatchups([game('g1')], []).map((m) => m.gameId)).toEqual(['g1']);
  });

  it('skips a bye', () => {
    const bye = { id: 'bye', team1: { id: 't' }, team2: null };

    expect(submissionMatchups([bye, game('g1')], []).map((m) => m.gameId)).toEqual(['g1']);
  });

  it('keeps a pick on a game the week no longer lists, after the rest', () => {
    const moved = { team1: { id: 'a' }, team2: { id: 'b' } };
    const matchups = submissionMatchups(
      [game('g1')],
      [
        { gameId: 'old-b', games: moved },
        { gameId: 'old-a', games: moved },
        { gameId: 'old-a', games: moved }
      ]
    );

    expect(matchups.map((m) => m.gameId)).toEqual(['g1', 'old-a', 'old-b']);
    expect(matchups[1].game).toBe(moved);
  });
});

describe('submissionScore', () => {
  it('counts hits against the games played, never the picks entered', () => {
    expect(
      submissionScore([
        { gameCompleted: true, isCorrect: true },
        { gameCompleted: true, isCorrect: false },
        { gameCompleted: false, isCorrect: false }
      ])
    ).toEqual({ correct: 1, decided: 2 });
  });

  it('has nothing to say before a game is played', () => {
    expect(submissionScore([{ gameCompleted: false, isCorrect: false }])).toEqual({
      correct: 0,
      decided: 0
    });
  });
});
