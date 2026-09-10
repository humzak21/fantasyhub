/**
 * The rules behind Settings → Automations, exercised without a database.
 *
 * What is worth pinning: a daily-refresh row is told apart from a weekly one
 * by its skip flags and not by its clock; a `success` row with a failed
 * non-fatal step is *partial*; a slot with no cron run after it (plus grace)
 * is *missed* only in season; and the recommendations name the step, the
 * table it writes, and a concrete next action.
 */

import { describe, it, expect } from 'vitest';

import {
  AUTOMATIONS,
  adviseOnError,
  buildRecommendations,
  classifyRun,
  countAttention,
  lastScheduledSlot,
  nextScheduledSlot,
  runOutcome,
  scheduleLagMinutes,
  seasonState,
  summarizeAutomation,
  summarizeRunSteps,
  summarizeStep
} from '../automationCatalog.js';

const weekly = AUTOMATIONS.find((a) => a.id === 'weekly-sync');
const daily = AUTOMATIONS.find((a) => a.id === 'daily-refresh');

const WEEKLY_STEPS = {
  pickEmWeek: { id: 'pw', created: false },
  rosters: { ok: true },
  scores: { errors: [], created: 0, updated: 7, conflicts: [], unchanged: 0 },
  playerStats: { errors: [], upserted: 184, playersCreated: 2 },
  finalizePrev: { week: 1, scores: { updated: 7, errors: [] }, playerStats: { upserted: 180, errors: [] } },
  nflSchedule: { errors: [], upserted: 576, weekSpan: 18 },
  nflRatings: { errors: [], upserted: 32 },
  parlayGrades: { tds: 3, noTds: 5, graded: 8, skipped: { 'stats not official': 2 }, konaRecovered: 1 },
  transactions: { errors: [], updated: 14 },
  snapshot: { teamsSnapshotted: 14 }
};

const DAILY_STEPS = {
  scores: { skipped: 'flag' },
  rosters: { ok: true },
  snapshot: { skipped: 'flag' },
  nflRatings: { skipped: 'flag' },
  pickEmWeek: { id: 'pw', created: false },
  nflSchedule: { skipped: 'flag' },
  playerStats: { skipped: 'flag' },
  finalizePrev: { skipped: 'flag' },
  parlayGrades: { tds: 0, noTds: 0, graded: 0, skipped: {}, konaRecovered: 0 },
  transactions: { errors: [], updated: 14 }
};

const run = (overrides = {}) => ({
  id: overrides.id ?? 'r1',
  seasonId: 's1',
  weekNumber: 2,
  status: 'success',
  trigger: 'cron',
  startedAt: '2026-09-15T10:03:00Z',
  finishedAt: '2026-09-15T10:03:30Z',
  durationMs: 30_000,
  error: null,
  steps: WEEKLY_STEPS,
  ...overrides
});

// Thursday 2026-09-17 12:00 UTC: week 2 of a season that started Tue 2026-09-08.
const NOW = new Date('2026-09-17T12:00:00Z');
const CONFIG = {
  startDate: '2026-09-08',
  timeZone: 'America/New_York',
  weekCount: 17,
  regularSeasonWeeks: 14,
  playoffStartWeek: 15,
  espnSeasonYear: 2026,
  status: 'active'
};
const SEASON = { id: 's1', year: 2026, isCompleted: false };

const HEALTHY = {
  snapshot: { week: 2, at: '2026-09-15T10:03:20Z' },
  playerStats: { week: 2, at: '2026-09-15T10:03:10Z' },
  rosters: { at: '2026-09-16T16:45:00Z' },
  transactions: { at: '2026-09-16T16:45:10Z' },
  nflSchedule: { rows: 576, at: '2026-09-15T10:03:15Z' },
  nflRatings: { week: 2, at: '2026-09-15T10:03:16Z' },
  pickEmWeeks: [1, 2],
  pendingParlayGrades: 0,
  scheduleImport: { at: '2026-08-20T14:00:00Z', summary: 'teams: 0 added / 14 updated' }
};

describe('schedule slots', () => {
  it('finds the weekly slot on the most recent Tuesday 10:00 UTC', () => {
    expect(lastScheduledSlot(weekly.schedule, NOW).toISOString()).toBe('2026-09-15T10:00:00.000Z');
    expect(nextScheduledSlot(weekly.schedule, NOW).toISOString()).toBe('2026-09-22T10:00:00.000Z');
  });

  it('finds the daily slot, rolling back a day before 16:40 UTC', () => {
    expect(lastScheduledSlot(daily.schedule, NOW).toISOString()).toBe('2026-09-16T16:40:00.000Z');
    expect(lastScheduledSlot(daily.schedule, new Date('2026-09-17T17:00:00Z')).toISOString())
      .toBe('2026-09-17T16:40:00.000Z');
  });

  it('measures lag against the slot for cron runs only', () => {
    expect(scheduleLagMinutes(run(), weekly)).toBe(3);
    expect(scheduleLagMinutes(run({ trigger: 'manual' }), weekly)).toBeNull();
    // 2026-09-09 19:27 UTC is 167 minutes after the 16:40 daily slot.
    expect(scheduleLagMinutes(run({ startedAt: '2026-09-09T19:27:00Z', steps: DAILY_STEPS }), daily)).toBe(167);
  });
});

describe('classifyRun', () => {
  it('reads the daily refresh out of its skip flags, whatever the clock says', () => {
    expect(classifyRun(run({ steps: DAILY_STEPS }))).toBe('daily-refresh');
    expect(classifyRun(run({ steps: WEEKLY_STEPS }))).toBe('weekly-sync');
    // Rows from before the newer steps existed are still weekly.
    expect(classifyRun(run({ steps: { scores: { created: 7 }, rosters: { ok: true }, snapshot: { teamsSnapshotted: 14 } } })))
      .toBe('weekly-sync');
  });

  it('attributes an empty running row by proximity to a slot', () => {
    expect(classifyRun(run({ status: 'running', steps: {}, startedAt: '2026-09-15T10:04:00Z' }))).toBe('weekly-sync');
    expect(classifyRun(run({ status: 'running', steps: {}, startedAt: '2026-09-16T16:50:00Z' }))).toBe('daily-refresh');
    expect(classifyRun(run({ status: 'running', steps: {}, trigger: 'manual' }))).toBe('unknown');
  });
});

describe('summarizeStep', () => {
  it('states counts for a step that ran', () => {
    expect(summarizeStep('scores', WEEKLY_STEPS.scores)).toMatchObject({ state: 'ok', text: '0 created · 7 updated · 0 unchanged' });
    expect(summarizeStep('parlayGrades', WEEKLY_STEPS.parlayGrades)).toMatchObject({
      state: 'ok',
      text: '8 graded (3 TD · 5 no TD) · 1 recovered from ESPN',
      issues: ['2 left pending — stats not official']
    });
  });

  it('distinguishes failed, skipped and never-reached', () => {
    expect(summarizeStep('transactions', { failed: 'ESPN returned no transaction data' })).toMatchObject({ state: 'failed' });
    expect(summarizeStep('rosters', { skipped: 'playoff week' })).toMatchObject({ state: 'skipped', text: 'skipped — playoff week' });
    // The roster step refreshes team names too. A rename is a count; an owner
    // ESPN spells differently is reported, never written, and needs a person.
    expect(summarizeStep('rosters', { ok: true })).toMatchObject({ state: 'ok' });
    expect(summarizeStep('rosters', {
      ok: true,
      teams: { updated: 2, unchanged: 12, inserted: 0, errors: [], ownerConflicts: [] }
    })).toMatchObject({ state: 'ok', text: 'rosters rewritten · 2 team names refreshed' });
    expect(summarizeStep('rosters', {
      ok: true,
      teams: {
        updated: 0, unchanged: 14, inserted: 0, errors: [],
        ownerConflicts: [{ team: 'INOVA', stored: 'Aashish Gatamaneni', espn: 'Aashish Gatmaneni' }]
      }
    })).toMatchObject({ state: 'warning', issues: [expect.stringContaining('owner differs for INOVA')] });
    expect(summarizeStep('snapshot', undefined)).toMatchObject({ state: 'missing' });
  });

  it('flags a step that ran but reported problems', () => {
    const step = summarizeStep('transactions', { updated: 13, errors: [{ team: 'Arya Shah', error: 'no matching team in this season' }] });
    expect(step.state).toBe('warning');
    expect(step.issues).toEqual(['Arya Shah: no matching team in this season']);
  });

  it('folds flag-skipped steps out of a run summary by default', () => {
    const names = summarizeRunSteps(run({ steps: DAILY_STEPS })).map((s) => s.name);
    expect(names).toEqual(['pickEmWeek', 'rosters', 'parlayGrades', 'transactions']);
  });
});

describe('runOutcome', () => {
  it('calls a success with a failed non-fatal step partial', () => {
    const outcome = runOutcome(run({ steps: { ...WEEKLY_STEPS, nflRatings: { failed: 'fetch failed' } } }), NOW);
    expect(outcome).toMatchObject({ status: 'partial', failedSteps: ['nflRatings'] });
  });

  it('calls a running row past the timeout stalled', () => {
    expect(runOutcome(run({ status: 'running', startedAt: '2026-09-17T10:00:00Z' }), NOW).status).toBe('stalled');
    expect(runOutcome(run({ status: 'running', startedAt: '2026-09-17T11:50:00Z' }), NOW).status).toBe('running');
  });
});

describe('seasonState', () => {
  it('reads the calendar', () => {
    expect(seasonState(null, null, NOW)).toBe('none');
    expect(seasonState(SEASON, CONFIG, NOW)).toBe('in-season');
    expect(seasonState(SEASON, CONFIG, new Date('2026-09-01T12:00:00Z'))).toBe('not-started');
    expect(seasonState({ ...SEASON, isCompleted: true }, CONFIG, NOW)).toBe('completed');
    expect(seasonState(SEASON, { ...CONFIG, startDate: null }, NOW)).toBe('no-start-date');
  });
});

describe('summarizeAutomation', () => {
  it('is healthy when the last slot has a cron run', () => {
    const summary = summarizeAutomation(weekly, [run()], { now: NOW, state: 'in-season' });
    expect(summary.status).toBe('healthy');
    expect(summary.nextRun.toISOString()).toBe('2026-09-22T10:00:00.000Z');
  });

  it('is missed when the slot has passed with grace and no cron run landed', () => {
    const stale = run({ startedAt: '2026-09-08T10:02:00Z' });
    const summary = summarizeAutomation(weekly, [stale], { now: NOW, state: 'in-season' });
    expect(summary.status).toBe('missed');
    expect(summary.missedSlot.toISOString()).toBe('2026-09-15T10:00:00.000Z');
  });

  it('is not missed inside the grace window', () => {
    const summary = summarizeAutomation(daily, [run({ steps: DAILY_STEPS, startedAt: '2026-09-15T16:45:00Z' })], {
      now: new Date('2026-09-16T17:30:00Z'),
      state: 'in-season'
    });
    expect(summary.status).toBe('healthy');
  });

  it('is idle out of season even with no runs', () => {
    expect(summarizeAutomation(weekly, [], { now: NOW, state: 'not-started' }).status).toBe('idle');
    expect(summarizeAutomation(weekly, [], { now: NOW, state: 'in-season' }).status).toBe('no-runs');
  });

  it('reports failed, partial and late in that order of concern', () => {
    expect(summarizeAutomation(weekly, [run({ status: 'failed', error: 'boom' })], { now: NOW }).status).toBe('failed');
    expect(summarizeAutomation(weekly, [run({ steps: { ...WEEKLY_STEPS, transactions: { failed: 'x' } } })], { now: NOW }).status).toBe('partial');
    const late = run({ steps: DAILY_STEPS, startedAt: '2026-09-16T19:27:00Z' });
    expect(summarizeAutomation(daily, [late], { now: NOW }).status).toBe('late');
  });

  it('only counts its own runs', () => {
    const summary = summarizeAutomation(daily, [run(), run({ id: 'r2', steps: DAILY_STEPS, startedAt: '2026-09-16T16:41:00Z' })], { now: NOW });
    expect(summary.runs.map((r) => r.id)).toEqual(['r2']);
  });
});

describe('adviseOnError', () => {
  it('recognises expired ESPN cookies', () => {
    expect(adviseOnError('ESPN responded 401 Unauthorized').title).toMatch(/credentials/i);
  });
  it('recognises the missing start date', () => {
    expect(adviseOnError('Season 2026 has no start_date.').title).toMatch(/start date/i);
  });
  it('falls back to re-run advice', () => {
    expect(adviseOnError('something odd').title).toMatch(/re-run/i);
  });
});

describe('buildRecommendations', () => {
  const summaries = (runs) => AUTOMATIONS.map((a) => summarizeAutomation(a, runs, { now: NOW, state: 'in-season' }));
  const healthyRuns = [run(), run({ id: 'r2', steps: DAILY_STEPS, startedAt: '2026-09-16T16:41:00Z' })];

  it('has nothing to say when every job ran and every table is current', () => {
    const recs = buildRecommendations({ summaries: summaries(healthyRuns), health: HEALTHY, config: CONFIG, state: 'in-season', actualWeek: 2, now: NOW });
    expect(recs).toEqual([]);
    expect(countAttention(recs)).toBe(0);
  });

  it('turns a failed weekly run into an error with the workflow link and the command', () => {
    const runs = [run({ status: 'failed', error: 'ESPN responded 403 Forbidden' }), healthyRuns[1]];
    const recs = buildRecommendations({ summaries: summaries(runs), health: HEALTHY, config: CONFIG, state: 'in-season', actualWeek: 2, now: NOW });
    const failed = recs.find((r) => r.id === 'weekly-sync-failed');
    expect(failed.severity).toBe('error');
    expect(failed.title).toMatch(/credentials/);
    expect(failed.actions.map((a) => a.label)).toEqual(
      expect.arrayContaining(['Update repository secrets', 'Run Weekly ESPN sync', 'Or from a terminal'])
    );
    expect(failed.actions.find((a) => a.command).command).toBe('npm run sync-week');
    expect(countAttention(recs)).toBe(1);
  });

  it('names the step and the table it writes when a non-fatal step failed', () => {
    const runs = [run({ steps: { ...WEEKLY_STEPS, nflRatings: { failed: 'fetch failed' } } }), healthyRuns[1]];
    const recs = buildRecommendations({ summaries: summaries(runs), health: HEALTHY, config: CONFIG, state: 'in-season', actualWeek: 2, now: NOW });
    const rec = recs.find((r) => r.id === 'weekly-sync-nflRatings-failed');
    expect(rec.severity).toBe('warning');
    expect(rec.title).toMatch(/Snapshot NFL power index/);
    expect(rec.detail).toMatch(/nfl_team_ratings/);
    expect(rec.detail).toMatch(/transient/);
  });

  it('reads the tables, not just the log', () => {
    const health = { ...HEALTHY, snapshot: { week: 1, at: '2026-09-08T10:03:00Z' }, pickEmWeeks: [1], nflSchedule: { rows: 0, at: null }, pendingParlayGrades: 3 };
    const recs = buildRecommendations({ summaries: summaries(healthyRuns), health, config: CONFIG, state: 'in-season', actualWeek: 2, now: NOW });
    const ids = recs.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['pickem-week-missing', 'snapshot-behind', 'nfl-schedule-empty', 'parlay-pending']));
    expect(recs[0].severity).toBe('error');
    expect(recs.find((r) => r.id === 'nfl-schedule-empty').actions[0].command).toBe('npm run sync-nfl-schedule');
    expect(recs.find((r) => r.id === 'parlay-pending').severity).toBe('info');
  });

  it('does not ask for a pick\'em row in the playoffs', () => {
    const health = { ...HEALTHY, pickEmWeeks: [1, 2], snapshot: { week: 15 }, playerStats: { week: 14 }, nflRatings: { week: 15 } };
    const recs = buildRecommendations({ summaries: summaries(healthyRuns), health, config: CONFIG, state: 'in-season', actualWeek: 15, now: NOW });
    expect(recs.map((r) => r.id)).not.toContain('pickem-week-missing');
  });

  it('explains the quiet exits out of season instead of calling them missed', () => {
    const pre = buildRecommendations({ summaries: AUTOMATIONS.map((a) => summarizeAutomation(a, [], { now: NOW, state: 'not-started' })), health: HEALTHY, config: CONFIG, state: 'not-started', actualWeek: null, now: NOW });
    expect(pre.map((r) => r.id)).toEqual(['pre-season']);
    expect(pre[0].actions[0].command).toBe('npm run sync-week -- --force');

    const none = buildRecommendations({ summaries: [], health: null, config: null, state: 'none', now: NOW });
    expect(none[0]).toMatchObject({ id: 'no-season', severity: 'warning' });
  });

  it('warns when the daily refresh lands after the Sunday kickoffs it exists for', () => {
    const late = run({ id: 'late', steps: DAILY_STEPS, startedAt: '2026-09-16T19:27:00Z' });
    const recs = buildRecommendations({ summaries: summaries([run(), late]), health: HEALTHY, config: CONFIG, state: 'in-season', actualWeek: 2, now: NOW });
    const rec = recs.find((r) => r.id === 'daily-refresh-late');
    expect(rec.severity).toBe('warning');
    expect(rec.title).toMatch(/167 minutes/);
  });
});
