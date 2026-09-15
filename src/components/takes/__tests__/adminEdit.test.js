/**
 * What the admin's editor sends.
 *
 * The one thing worth asserting is that a save carries **only what moved**.
 * A resent grade arrives with a fresh `resolved_at` and `resolved_by`, so an
 * editor that sent the whole form would re-date and re-attribute the grade of
 * every take the admin fixed a typo in — and the log would say they graded it.
 */

import { describe, it, expect } from 'vitest';

import { buildAdminTakePatch, draftFromTake } from '../adminEdit.js';
import { milestoneKey, milestoneOptions, parseMilestoneValue } from '../milestones.js';

const TAKE = {
  id: 't1',
  userId: 'u2',
  body: 'Nobody goes 14-0',
  wager: '$20',
  targetType: 'week',
  targetWeek: 3,
  status: 'pending'
};

const edit = (take, changes) => buildAdminTakePatch(take, { ...draftFromTake(take), ...changes });

describe('buildAdminTakePatch', () => {
  it('sends nothing for an untouched draft', () => {
    expect(edit(TAKE, {})).toEqual({});
  });

  it('sends only the field that moved', () => {
    expect(edit(TAKE, { body: 'Nobody goes 13-1' })).toEqual({ body: 'Nobody goes 13-1' });
  });

  it('does not resend a grade that did not change', () => {
    const graded = { ...TAKE, status: 'correct' };

    expect(edit(graded, { body: 'Nobody goes 13-1' })).toEqual({ body: 'Nobody goes 13-1' });
    expect(edit(graded, { status: 'incorrect' })).toEqual({ status: 'incorrect' });
  });

  it('moves the milestone as a type and a week together', () => {
    expect(edit(TAKE, { milestone: 'end_of_season' })).toEqual({
      targetType: 'end_of_season',
      targetWeek: null
    });
    expect(edit(TAKE, { milestone: 'week:4' })).toEqual({ targetType: 'week', targetWeek: 4 });
  });

  it('treats whitespace as no change, and a blank stake as none', () => {
    expect(edit(TAKE, { body: '  Nobody goes 14-0  ', wager: ' $20 ' })).toEqual({});
    expect(edit(TAKE, { wager: '   ' })).toEqual({ wager: null });
    expect(edit({ ...TAKE, wager: null }, { wager: '' })).toEqual({});
  });

  it('reassigns the author, and never to nobody', () => {
    expect(edit(TAKE, { userId: 'u3' })).toEqual({ userId: 'u3' });
    expect(edit(TAKE, { userId: '' })).toEqual({});
  });
});

describe('milestone values', () => {
  it('round-trips every option the editor offers', () => {
    const options = milestoneOptions({ regularSeasonWeeks: 14, weekCount: 17 });

    expect(options.slice(-2).map((option) => option.value)).toEqual([
      'end_of_regular_season',
      'end_of_season'
    ]);
    for (const { value } of options) {
      expect(milestoneKey(parseMilestoneValue(value))).toBe(value);
    }
  });
});
