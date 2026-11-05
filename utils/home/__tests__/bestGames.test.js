import { describe, expect, it } from 'vitest';
import { bestGames, isBracketType } from '../bestGames.js';

const meeting = (over) => ({
  isPlayoff: false,
  isConsolation: false,
  team1Name: 'Ours',
  team2Name: 'Theirs',
  ...over
});

const MEETINGS = [
  meeting({ id: 'g1', year: 2023, week: 3, team1Id: 'a23', team2Id: 'b23', team1Score: 120, team2Score: 100 }),
  meeting({ id: 'g2', year: 2024, week: 7, team1Id: 'a24', team2Id: 'b24', team1Score: 90, team2Score: 110, team2Name: 'Theirs 24' }),
  meeting({ id: 'g3', year: 2024, week: 16, team1Id: 'a24', team2Id: 'b24', team1Score: 140, team2Score: 101, isPlayoff: true }),
  meeting({ id: 'g4', year: 2025, week: 15, team1Id: 'a25', team2Id: 'b25', team1Score: 80, team2Score: 95, isConsolation: true })
];

const starter = (teamId, week, actualPoints, name) => ({
  teamId, week, actualPoints, name, playerId: name, espnPlayerId: 1, position: 'RB', proTeamId: 1
});

const STARTERS = [
  starter('a23', 3, 31.2, 'Regular ours'),
  starter('b23', 3, 22, 'Regular theirs 23'),
  starter('a24', 7, 18, 'Loss ours'),
  starter('b24', 7, 35.55, 'Regular theirs 24'),
  starter('a24', 16, 44, 'Playoff ours'),
  starter('b24', 16, 20, 'Playoff theirs'),
  starter('a25', 15, 60, 'Consolation ours'),
  // Same team, a week the two did not meet.
  starter('a24', 3, 99, 'Not a meeting')
];

describe('bestGames', () => {
  it('reads the regular season for a regular-season game', () => {
    const result = bestGames(MEETINGS, STARTERS, { gameType: 'regular' });
    expect(result.phase).toBe('regular');
    expect(result.sides[0]).toMatchObject({ points: 31.2, year: 2023, week: 3, result: 'W', teamName: 'Ours' });
    expect(result.sides[0].player.name).toBe('Regular ours');
    expect(result.sides[1]).toMatchObject({ points: 35.55, year: 2024, week: 7, result: 'W', teamName: 'Theirs 24' });
  });

  it('reads the bracket for a bracket game when the two have met there', () => {
    const result = bestGames(MEETINGS, STARTERS, { gameType: 'playoff_semifinals' });
    expect(result.phase).toBe('playoff');
    expect(result.sides[0].player.name).toBe('Playoff ours');
    expect(result.sides[1]).toMatchObject({ points: 20, result: 'L' });
  });

  it('falls back to the regular season when they have never met in the bracket', () => {
    const regularOnly = MEETINGS.filter((game) => !game.isPlayoff);
    expect(bestGames(regularOnly, STARTERS, { gameType: 'playoff_championship' }).phase).toBe('regular');
  });

  it('never counts a consolation game as a bracket game', () => {
    expect(isBracketType('playoff_consolation_first_round')).toBe(false);
    expect(isBracketType('playoff')).toBe(true);
    const result = bestGames(MEETINGS, STARTERS, { gameType: 'playoff_consolation_first_round' });
    expect(result.phase).toBe('regular');
    expect(result.sides[0].player.name).not.toBe('Consolation ours');
  });

  it('uses every meeting when none is in the phase', () => {
    const result = bestGames([MEETINGS[3]], STARTERS, { gameType: 'regular' });
    expect(result.phase).toBe('all');
    expect(result.sides[0].player.name).toBe('Consolation ours');
    expect(result.sides[1]).toBeNull();
  });

  it('keeps the earlier meeting on a tie', () => {
    const tied = [starter('a24', 7, 31.2, 'Later'), starter('a23', 3, 31.2, 'Earlier')];
    expect(bestGames(MEETINGS, tied).sides[0].player.name).toBe('Earlier');
  });

  it('is null with no meetings or no starters', () => {
    expect(bestGames([], STARTERS)).toBeNull();
    expect(bestGames(MEETINGS, [])).toBeNull();
  });
});
