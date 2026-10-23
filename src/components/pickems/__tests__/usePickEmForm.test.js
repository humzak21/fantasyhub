/**
 * The form state both pick'ems surfaces share. Pinned: a draft is what a form
 * starts from and reopens a submitted week for editing; a pick is written to
 * the draft as it is made; a submit clears it and so does cancelling; and a
 * refusal comes back as `error`, not as an unhandled rejection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { usePickEmForm } from '../usePickEmForm.js';
import { browserStorage, readDraft, writeDraft } from '../pickDraft.js';

const WEEK = { id: 'w7' };
const team = (id) => ({ id, name: `Team ${id}` });
const GAMES = [
  { id: 'g1', isCompleted: false, team1Id: 't1', team2Id: 't2', team1: team('t1'), team2: team('t2') },
  { id: 'g2', isCompleted: false, team1Id: 't3', team2Id: 't4', team1: team('t3'), team2: team('t4') },
  // Finished: not pickable, and its old pick must not count towards the total.
  { id: 'g0', isCompleted: true, team1Id: 't5', team2Id: 't6', team1: team('t5'), team2: team('t6') }
];
const SUBMITTED = [
  { gameId: 'g0', predictedWinnerTeamId: 't5' },
  { gameId: 'g1', predictedWinnerTeamId: 't1' },
  { gameId: 'g2', predictedWinnerTeamId: 't3' }
];

const setup = ({ userPicks = [], submit = vi.fn(async () => {}) } = {}) =>
  renderHook(() => usePickEmForm({ pickEmWeek: WEEK, games: GAMES, userPicks, userId: 'u1', submit }));

beforeEach(() => localStorage.clear());

describe('usePickEmForm', () => {
  it('starts from what was submitted, read-only until edited', () => {
    const { result } = setup({ userPicks: SUBMITTED });
    expect(result.current.picks).toMatchObject({ g1: 't1', g2: 't3' });
    expect(result.current).toMatchObject({ hasSubmitted: true, isEditing: false, canEdit: false });
    expect(result.current.totalPicks).toBe(2);
  });

  it('reopens a submitted week when the draft changes a pick', () => {
    writeDraft(browserStorage(), 'u1', 'w7', { picks: { g2: 't4' } });
    const { result } = setup({ userPicks: SUBMITTED });

    expect(result.current.picks).toMatchObject({ g1: 't1', g2: 't4' });
    expect(result.current).toMatchObject({ isEditing: true, hasChanges: true, canEdit: true });
  });

  it('writes each pick to the draft as it is made', () => {
    const { result } = setup();
    act(() => result.current.pick('g1', 't2'));
    expect(readDraft(browserStorage(), 'u1', 'w7').picks).toEqual({ g1: 't2' });
  });

  it('submits every selectable game, then clears the draft', async () => {
    const submit = vi.fn(async () => {});
    const { result } = setup({ submit });
    act(() => {
      result.current.pick('g1', 't2');
      result.current.pick('g2', 't3');
    });

    await act(() => result.current.handleSubmit());

    expect(submit).toHaveBeenCalledWith('w7', [
      { gameId: 'g1', predictedWinnerTeamId: 't2', confidenceLevel: 1 },
      { gameId: 'g2', predictedWinnerTeamId: 't3', confidenceLevel: 1 }
    ]);
    expect(readDraft(browserStorage(), 'u1', 'w7')).toBeNull();
    expect(result.current).toMatchObject({ hasSubmitted: true, showConfirmation: true, hasChanges: false });
  });

  it('says which game is missing instead of submitting', async () => {
    const submit = vi.fn();
    const { result } = setup({ submit });
    act(() => result.current.pick('g1', 't2'));

    await act(() => result.current.handleSubmit());

    expect(submit).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Please make a pick for Team t3 vs Team t4');
  });

  it('reports a refusal and keeps the draft', async () => {
    const submit = vi.fn(async () => {
      throw new Error("Pick'em submissions are closed for this week");
    });
    const { result } = setup({ submit });
    act(() => {
      result.current.pick('g1', 't2');
      result.current.pick('g2', 't3');
    });

    await act(() => result.current.handleSubmit());

    await waitFor(() => expect(result.current.error).toMatch(/closed/));
    expect(readDraft(browserStorage(), 'u1', 'w7').picks).toEqual({ g1: 't2', g2: 't3' });
  });

  it('cancelling an edit drops the draft and restores the submission', () => {
    writeDraft(browserStorage(), 'u1', 'w7', { picks: { g2: 't4' } });
    const { result } = setup({ userPicks: SUBMITTED });

    act(() => result.current.cancelEdit());

    expect(result.current.picks).toMatchObject({ g2: 't3' });
    expect(result.current.isEditing).toBe(false);
    expect(readDraft(browserStorage(), 'u1', 'w7')).toBeNull();
  });
});
