import { describe, it, expect } from 'vitest';
import {
  daysUntilStart,
  describeSeries,
  findMatchup,
  meetingResult,
  nextMatchup,
  orientScores,
  seasonPhase
} from '../matchup.js';
import { summarizeMatchup } from '../../../src/components/history/headtohead/matchupSummary.js';
import { toSeasonConfig } from '../../seasonConfig.js';

const games = [
  { id: 'g1', week: 1, type: 'regular', team1Id: 'a', team2Id: 'b', team1Score: 120, team2Score: 100 },
  { id: 'g2', week: 1, type: 'regular', team1Id: 'c', team2Id: 'd', team1Score: null, team2Score: null },
  { id: 'g3', week: 2, type: 'regular', team1Id: 'c', team2Id: 'a', team1Score: null, team2Score: null },
  { id: 'g4', week: 15, type: 'bye', team1Id: 'a', team2Id: null },
  { id: 'g5', week: 16, type: 'playoff_semifinals', team1Id: 'd', team2Id: 'a' }
];

describe('findMatchup', () => {
  it('finds the team as team 1', () => {
    expect(findMatchup(games, 'a', 1)).toMatchObject({ side: 1, opponentId: 'b' });
  });

  it('finds the team as team 2', () => {
    expect(findMatchup(games, 'a', 2)).toMatchObject({ side: 2, opponentId: 'c' });
  });

  it('reads a postseason bye row as a bye, not an opponent', () => {
    expect(findMatchup(games, 'a', 15)).toEqual({ bye: true, game: games[3] });
  });

  it('reads no game at all as a bye with no row', () => {
    expect(findMatchup(games, 'b', 2)).toEqual({ bye: true, game: null });
  });

  it('keeps the postseason game type for the phase label', () => {
    expect(findMatchup(games, 'a', 16).game.type).toBe('playoff_semifinals');
  });
});

describe('nextMatchup', () => {
  it('skips the bye and lands on the next real game', () => {
    expect(nextMatchup(games, 'a', 14)).toMatchObject({ week: 16, opponentId: 'd' });
  });

  it('is null when nothing is left', () => {
    expect(nextMatchup(games, 'a', 16)).toBeNull();
  });
});

describe('orientScores', () => {
  it('puts the viewer first', () => {
    expect(orientScores(games[0], 2)).toEqual({ own: 100, opponent: 120 });
  });

  it('keeps a missing score null, never 0', () => {
    expect(orientScores(games[1], 1)).toEqual({ own: null, opponent: null });
  });
});

describe('seasonPhase', () => {
  const config = toSeasonConfig({ id: 's', year: 2026, start_date: '2026-09-08', regular_season_weeks: 14, playoff_weeks: 3 });

  it('is loading without a start date', () => {
    expect(seasonPhase(null, null)).toBe('loading');
    expect(seasonPhase(toSeasonConfig({ id: 's' }), {})).toBe('loading');
  });

  it('is preseason before week 1 begins', () => {
    expect(seasonPhase(config, {}, new Date('2026-09-01T12:00:00Z'))).toBe('preseason');
    expect(daysUntilStart(config, new Date('2026-09-01T12:00:00Z'))).toBe(7);
  });

  it('is active once week 1 has begun', () => {
    expect(seasonPhase(config, {}, new Date('2026-10-20T12:00:00Z'))).toBe('active');
    expect(daysUntilStart(config, new Date('2026-10-20T12:00:00Z'))).toBe(0);
  });

  it('is complete once the season is finalised, whatever the clock says', () => {
    expect(seasonPhase(config, { isCompleted: true }, new Date('2026-10-20T12:00:00Z'))).toBe('complete');
  });
});

describe('describeSeries', () => {
  const meeting = (week, a, b, extra = {}) => ({
    year: 2025, week, team1Score: a, team2Score: b, isPlayoff: false, isConsolation: false, ...extra
  });

  it('is null with no meetings', () => {
    expect(describeSeries(summarizeMatchup([]))).toBeNull();
  });

  it('says who leads, from the viewer side, with the phases played', () => {
    const series = describeSeries(
      summarizeMatchup([
        meeting(1, 100, 90),
        meeting(5, 80, 95),
        meeting(9, 110, 100),
        meeting(15, 120, 101, { isPlayoff: true })
      ])
    );
    expect(series.headline).toBe('You lead the series 3–1');
    expect(series.phases).toEqual([
      { label: 'Regular season', record: '2–1' },
      { label: 'Playoffs', record: '1–0' }
    ]);
    expect(series.streak).toBe("You've won the last 2");
  });

  it('reports a trailing series and a losing streak of one', () => {
    const series = describeSeries(summarizeMatchup([meeting(1, 100, 90), meeting(2, 80, 95), meeting(3, 70, 95)]));
    expect(series.headline).toBe('You trail the series 1–2');
    expect(series.streak).toBe("You've lost the last 2");
  });

  it('counts a tie and breaks the streak on it', () => {
    const series = describeSeries(summarizeMatchup([meeting(1, 100, 90), meeting(2, 90, 90)]));
    expect(series.headline).toBe('You lead the series 1–0–1');
    expect(series.streak).toBeNull();
  });
});

describe('meetingResult', () => {
  it('reads the oriented scores', () => {
    expect(meetingResult({ team1Score: 2, team2Score: 1 })).toBe('W');
    expect(meetingResult({ team1Score: 1, team2Score: 2 })).toBe('L');
    expect(meetingResult({ team1Score: 1, team2Score: 1 })).toBe('T');
  });
});
