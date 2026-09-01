import { describe, it, expect } from 'vitest';
import { canViewSeasonResults, viewableResultSeasons } from '../resultsAccess.js';

const completed = { seasonId: 'a', year: 2025, isCompleted: true, isActive: false };
const inProgress = { seasonId: 'b', year: 2026, isCompleted: false, isActive: true };

describe('canViewSeasonResults', () => {
  it('opens a completed season to anyone', () => {
    expect(canViewSeasonResults(completed, {})).toBe(true);
  });

  it('keeps the in-progress season closed until it is released', () => {
    expect(canViewSeasonResults(inProgress, {})).toBe(false);
    expect(canViewSeasonResults(inProgress, { activeSeasonResultsReleased: true })).toBe(true);
  });

  it('does not let the active season’s release flag close a finished one', () => {
    // The bug this rule exists to prevent: 2025 needs 14 voters to be
    // releasable and drew 9, so gating it on that flag hid it forever.
    expect(canViewSeasonResults(completed, { activeSeasonResultsReleased: false })).toBe(true);
  });

  it('opens everything to the admin', () => {
    expect(canViewSeasonResults(inProgress, { isAdmin: true })).toBe(true);
  });

  it('reads the snake_case shape too', () => {
    expect(canViewSeasonResults({ is_completed: true }, {})).toBe(true);
  });

  it('is false for a missing season', () => {
    expect(canViewSeasonResults(null, { isAdmin: true })).toBe(false);
  });
});

describe('viewableResultSeasons', () => {
  it('filters and preserves order', () => {
    expect(viewableResultSeasons([inProgress, completed], {})).toEqual([completed]);
  });

  it('survives a pending query', () => {
    expect(viewableResultSeasons(undefined, {})).toEqual([]);
  });
});
