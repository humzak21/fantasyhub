import { describe, expect, it } from 'vitest';
import { boxScoreFromRecordRow, boxScoreGame, phaseOfType } from '../boxScoreGame.js';

describe('boxScoreGame', () => {
  it('orients the game side 1 first, with the phase from a games.type', () => {
    const game = boxScoreGame({
      seasonId: 's21', year: 2021, week: 15, type: 'playoff_semifinals',
      team1: { id: 'a', franchiseId: 'fa', name: 'Alpha', score: 120.5 },
      team2: { id: 'b', franchiseId: 'fb', name: 'Bravo', score: 99 }
    });
    expect(game).toMatchObject({
      seasonId: 's21', year: 2021, week: 15, isPlayoff: true, isConsolation: false,
      team1Id: 'a', team2Id: 'b', team1Name: 'Alpha', team2Name: 'Bravo',
      team1FranchiseId: 'fa', team1Score: 120.5, team2Score: 99
    });
  });

  it('is null without a season, a week or both teams', () => {
    expect(boxScoreGame({ week: 1, team1: { id: 'a' }, team2: { id: 'b' } })).toBeNull();
    expect(boxScoreGame({ seasonId: 's', week: 1, team1: { id: 'a' }, team2: null })).toBeNull();
  });

  it('reads a consolation game as neither a bracket nor a regular game', () => {
    expect(phaseOfType('playoff_consolation_first_round')).toBe('consolation');
    expect(phaseOfType('playoff')).toBe('playoff');
    expect(phaseOfType('regular')).toBe('regular');
    expect(phaseOfType(null)).toBe('regular');
  });

  it('opens a record-book game row with the identity\'s (masked) names', () => {
    const row = {
      gameId: 'g1', seasonId: 's24', year: 2024, week: 3, phase: 'regular',
      teamId: 't1', franchiseId: 'f1', opponentTeamId: 't2', opponentFranchiseId: 'f2', score: [140, 70]
    };
    const game = boxScoreFromRecordRow(row, { teamName: (id) => `Masked ${id}` });
    expect(game).toMatchObject({ id: 'g1', team1Name: 'Masked t1', team2Name: 'Masked t2', team1Score: 140, team2Score: 70, isPlayoff: false });
    expect(boxScoreFromRecordRow({ ...row, seasonId: undefined }, {})).toBeNull();
  });
});
