/**
 * The activity log's reading of a `take_events` row.
 *
 * Four things here are load-bearing and none of them are visual:
 *
 *   * **A cleared wager is a change, not a blank.** `$50` → NULL has to render
 *     as words on both sides, or the one act that removes a bet from the board
 *     shows as an empty cell that reads like a rendering fault.
 *   * **A backfilled row shows no diff.** Those events predate the log and
 *     their old values were never recorded. Presenting the take's *current*
 *     wording as what was posted would be a fabrication the reader cannot
 *     detect, so the entry carries a note instead.
 *   * **`seq` breaks the timestamp tie.** `now()` is transaction time, so an
 *     update that rewords *and* grades a take stamps both events identically —
 *     which is the exact case where getting the order wrong inverts cause and
 *     effect.
 *   * **A fade moved by somebody else names both people.** The admin holds a
 *     FOR ALL policy on `take_participants`, so "took back their Hell Nah" is
 *     not always true of the person it happened to.
 */

import { describe, it, expect } from 'vitest';

import { describeTakeEvent, isBackfilled, sortEventsNewestFirst } from '../activity.js';

const CONFIG = { regularSeasonWeeks: 14, weekCount: 17 };
const NAMES = { actorName: 'Humza Khalil', subjectName: 'Arya Shah', seasonConfig: CONFIG };

const event = (overrides) => ({ eventType: 'edited', changes: {}, ...overrides });

describe('describeTakeEvent', () => {
  it('reads a posted take as its author, with the wording it was posted under', () => {
    const described = describeTakeEvent(
      event({
        eventType: 'posted',
        changes: {
          body: { to: 'Nobody goes 14-0' },
          wager: { to: '$20' },
          milestone: { to: 'week', week: 3 }
        }
      }),
      NAMES
    );

    expect(described.title).toBe('Humza Khalil posted this take');
    // No `from` on any of them: this is what the take *was*, not what it became.
    expect(described.fields.every((field) => field.from === null)).toBe(true);
    expect(described.fields.map((field) => field.to)).toEqual([
      'Nobody goes 14-0',
      '$20',
      'Week 3'
    ]);
  });

  it('carries both halves of a reword', () => {
    const [field] = describeTakeEvent(
      event({ changes: { body: { from: 'Old wording', to: 'New wording' } } }),
      NAMES
    ).fields;

    expect(field).toMatchObject({
      label: 'Wording',
      from: 'Old wording',
      to: 'New wording',
      multiline: true
    });
  });

  it('spells a cleared wager out rather than leaving it blank', () => {
    const [field] = describeTakeEvent(
      event({ changes: { wager: { from: '$50', to: null } } }),
      NAMES
    ).fields;

    expect(field).toMatchObject({ label: 'Stake', from: '$50', to: 'No stake' });
  });

  it('spells an added wager out on the other side too', () => {
    const [field] = describeTakeEvent(
      event({ changes: { wager: { from: null, to: '40 FAAB' } } }),
      NAMES
    ).fields;

    expect(field).toMatchObject({ from: 'No stake', to: '40 FAAB' });
  });

  it('lists a multi-field edit in a fixed order, whatever order the JSON arrived in', () => {
    const changes = {
      milestone: { from: 'week', fromWeek: 3, to: 'end_of_season', week: null },
      wager: { from: '$20', to: '$50' },
      body: { from: 'a', to: 'b' }
    };

    expect(describeTakeEvent(event({ changes }), NAMES).fields.map((f) => f.key)).toEqual([
      'body',
      'wager',
      'milestone'
    ]);
  });

  it('names a moved milestone through the same labels the board uses', () => {
    const [field] = describeTakeEvent(
      event({
        changes: { milestone: { from: 'week', fromWeek: 3, to: 'end_of_season', week: null } }
      }),
      NAMES
    ).fields;

    expect(field).toMatchObject({ label: 'Resolves', from: 'Week 3', to: 'End of season' });
  });

  it('says what grade a take was given', () => {
    const described = describeTakeEvent(
      event({ eventType: 'graded', changes: { status: { from: 'pending', to: 'correct' } } }),
      NAMES
    );

    expect(described.title).toBe('Humza Khalil graded it Correct');
  });

  it('says what a reopen undid', () => {
    const described = describeTakeEvent(
      event({ eventType: 'reopened', changes: { status: { from: 'incorrect', to: 'pending' } } }),
      NAMES
    );

    expect(described.title).toBe('Humza Khalil reopened it');
    expect(described.fields).toEqual([
      { key: 'status', label: 'Was', from: null, to: 'Incorrect', multiline: false }
    ]);
  });

  it('credits a Hell Nah to the person who placed it', () => {
    const described = describeTakeEvent(event({ eventType: 'faded' }), {
      ...NAMES,
      actorName: 'Arya Shah'
    });

    expect(described.title).toBe('Arya Shah said Hell Nah');
  });

  it('names both people when the admin moves somebody else’s Hell Nah', () => {
    expect(describeTakeEvent(event({ eventType: 'unfaded' }), NAMES).title).toBe(
      "Humza Khalil removed Arya Shah's Hell Nah"
    );
    expect(describeTakeEvent(event({ eventType: 'faded' }), NAMES).title).toBe(
      'Humza Khalil added a Hell Nah for Arya Shah'
    );
  });

  it('shows a backfilled event with a note and no invented diff', () => {
    const described = describeTakeEvent(
      event({ eventType: 'edited', changes: { backfilled: true } }),
      NAMES
    );

    expect(described.fields).toEqual([]);
    expect(described.note).toMatch(/before the activity log existed/i);
    expect(isBackfilled(event({ changes: { backfilled: true } }))).toBe(true);
  });

  it('still says something about an event type it has never seen', () => {
    // `take_events_event_type_check` is named and extensible, so a client
    // running against a newer database is a real state, not an impossible one.
    const described = describeTakeEvent(event({ eventType: 'annulled' }), NAMES);

    expect(described.kind).toBe('unknown');
    expect(described.title).toBe('Humza Khalil changed this take');
  });

  it('does not render "undefined" when nobody can be named', () => {
    expect(describeTakeEvent(event({ eventType: 'posted' }), {}).title).toBe(
      'Someone posted this take'
    );
  });
});

describe('sortEventsNewestFirst', () => {
  it('puts the most recent act first', () => {
    const sorted = sortEventsNewestFirst([
      { id: 'old', createdAt: '2026-09-01T12:00:00Z', seq: 1 },
      { id: 'new', createdAt: '2026-09-05T12:00:00Z', seq: 2 }
    ]);

    expect(sorted.map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('breaks a same-instant tie on seq, not on array order', () => {
    // One statement that rewords and grades a take stamps both events with the
    // same now(). Without seq the log can show the grade before the edit that
    // shares its transaction.
    const sorted = sortEventsNewestFirst([
      { id: 'edited', createdAt: '2026-09-05T12:00:00Z', seq: 7 },
      { id: 'graded', createdAt: '2026-09-05T12:00:00Z', seq: 8 }
    ]);

    expect(sorted.map((e) => e.id)).toEqual(['graded', 'edited']);
  });

  it('does not mutate what it was given', () => {
    const events = [
      { id: 'a', createdAt: '2026-09-01T12:00:00Z', seq: 1 },
      { id: 'b', createdAt: '2026-09-05T12:00:00Z', seq: 2 }
    ];
    sortEventsNewestFirst(events);

    expect(events.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
