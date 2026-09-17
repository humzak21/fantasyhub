/**
 * A pick is only a miss once its game has been played.
 *
 * In week 2 of 2026 the standings told a member who had gone 5-from-7 in week 1
 * and entered week 2 before kickoff that they were 5/14 at 35.7%. Both numbers
 * counted seven games nobody had played as seven wrong answers — a record the
 * member could not have had, and one that would fall further every Tuesday as
 * the next week's picks landed and then climb back through the weekend.
 *
 * The rule is the one this codebase states everywhere else as "unknown is
 * absent, never zero": hits are counted against *decided* picks. What is
 * asserted here is that the denominator follows the games rather than the
 * submissions, and — the other half, easy to lose — that nothing reads 100%
 * off a week that is one game in.
 *
 * The client is fake, so these are the aggregations and not the RLS.
 */

import { describe, it, expect } from 'vitest';

import { getWeeklyPickEmScores, getSeasonPickEmStandings } from '../pickems.js';
import { makeCtx } from './fakeClient.js';

const seasonId = 'season-2026';

/**
 * One submission row in the shape `getAllPicksForWeek` selects: the embedded
 * game carries `is_completed` and the winner, which is where "decided" and
 * "correct" both come from.
 */
const submission = (userId, gameId, { picked = 't1', winner = null, played = false } = {}) => ({
  id: `${userId}-${gameId}`,
  user_id: userId,
  pick_em_week_id: 'pew',
  game_id: gameId,
  predicted_winner_team_id: picked,
  pick_em_weeks: { is_completed: false },
  games: {
    week: 2,
    is_completed: played,
    winner_team_id: played ? winner : null,
    team1_score: played ? 110 : null,
    team2_score: played ? 100 : null,
    team1: { id: 't1', name: 'Team One', owner: 'Owner One' },
    team2: { id: 't2', name: 'Team Two', owner: 'Owner Two' }
  },
  predicted_team: { name: picked === 't1' ? 'Team One' : 'Team Two' }
});

/** A hit: picked the team that won. */
const hit = (userId, gameId) => submission(userId, gameId, { picked: 't1', winner: 't1', played: true });
/** A miss: picked the team that lost. */
const miss = (userId, gameId) => submission(userId, gameId, { picked: 't2', winner: 't1', played: true });
/** Entered, but the game has not kicked off. */
const pending = (userId, gameId) => submission(userId, gameId, { picked: 't1', played: false });

const withPicks = (picksByWeekId, weeks) =>
  makeCtx({
    'pick_em_weeks.select': () => weeks,
    'pick_em_submissions.select': (call) => picksByWeekId[call.filters.pick_em_week_id] ?? [],
    'rpc.get_user_display_names': ({ user_ids }) =>
      user_ids.map((id) => ({ id, display_name: `Member ${id}` }))
  });

describe('getWeeklyPickEmScores', () => {
  it('counts hits against the games played, not the picks entered', async () => {
    const ctx = withPicks({
      pew: [hit('u1', 'g1'), miss('u1', 'g2'), pending('u1', 'g3'), pending('u1', 'g4')]
    });

    const [score] = await getWeeklyPickEmScores(ctx, 'pew');

    expect(score.totalPicks).toBe(4);
    expect(score.decidedPicks).toBe(2);
    expect(score.correctPicks).toBe(1);
    expect(score.accuracyPercentage).toBe(50);
  });

  it('is not complete until every game has been played', async () => {
    const midweek = withPicks({ pew: [hit('u1', 'g1'), pending('u1', 'g2')] });
    const [inProgress] = await getWeeklyPickEmScores(midweek, 'pew');

    // 1 from 1 is 100%, which is exactly why a percentage cannot stand in for
    // "perfect" on its own.
    expect(inProgress.accuracyPercentage).toBe(100);
    expect(inProgress.isComplete).toBe(false);

    const finished = withPicks({ pew: [hit('u1', 'g1'), hit('u1', 'g2')] });
    const [done] = await getWeeklyPickEmScores(finished, 'pew');
    expect(done.isComplete).toBe(true);
  });

  it('reports no accuracy at all before a game is played, rather than zero', async () => {
    const ctx = withPicks({ pew: [pending('u1', 'g1'), pending('u1', 'g2')] });

    const [score] = await getWeeklyPickEmScores(ctx, 'pew');

    expect(score.decidedPicks).toBe(0);
    expect(score.correctPicks).toBe(0);
    expect(score.accuracyPercentage).toBe(0);
    expect(score.isComplete).toBe(false);
  });
});

describe('getSeasonPickEmStandings', () => {
  const WEEKS = [
    { id: 'pew-1', week_number: 1 },
    { id: 'pew-2', week_number: 2 }
  ];

  it('holds a fully scored week and an unplayed one to the games played', async () => {
    // Week 1: five from seven. Week 2: entered, nothing kicked off.
    const week1 = [
      ...['g1', 'g2', 'g3', 'g4', 'g5'].map((g) => hit('u1', g)),
      ...['g6', 'g7'].map((g) => miss('u1', g))
    ];
    const week2 = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'].map((g) => pending('u1', g));

    const ctx = withPicks({ 'pew-1': week1, 'pew-2': week2 }, WEEKS);
    const [standing] = await getSeasonPickEmStandings(ctx, seasonId);

    // The bug: 5/14 at 35.7%.
    expect(standing.totalPicks).toBe(14);
    expect(standing.totalDecidedPicks).toBe(7);
    expect(standing.totalCorrectPicks).toBe(5);
    expect(standing.overallAccuracyPercentage).toBeCloseTo((5 / 7) * 100, 5);
  });

  it('still counts an unplayed week as participation', async () => {
    // The tourney floor is about entering, not about being scored: a member
    // who submitted on Tuesday has played that week.
    const ctx = withPicks(
      { 'pew-1': [hit('u1', 'g1')], 'pew-2': [pending('u1', 'g1')] },
      WEEKS
    );

    const [standing] = await getSeasonPickEmStandings(ctx, seasonId);

    expect(standing.totalWeeksParticipated).toBe(2);
  });

  it('does not credit a perfect week to a week that is one game old', async () => {
    const ctx = withPicks(
      { 'pew-1': [hit('u1', 'g1'), pending('u1', 'g2')], 'pew-2': [] },
      WEEKS
    );

    const [standing] = await getSeasonPickEmStandings(ctx, seasonId);

    expect(standing.perfectWeeks).toBe(0);
  });

  it('credits a perfect week once the week is over', async () => {
    const ctx = withPicks(
      { 'pew-1': [hit('u1', 'g1'), hit('u1', 'g2')], 'pew-2': [] },
      WEEKS
    );

    const [standing] = await getSeasonPickEmStandings(ctx, seasonId);

    expect(standing.perfectWeeks).toBe(1);
  });

  it('gives a member with nothing played yet no accuracy rather than 0%', async () => {
    const ctx = withPicks({ 'pew-1': [pending('u1', 'g1')], 'pew-2': [] }, WEEKS);

    const [standing] = await getSeasonPickEmStandings(ctx, seasonId);

    expect(standing.totalDecidedPicks).toBe(0);
    expect(standing.overallAccuracyPercentage).toBe(0);
  });
});
