/**
 * What the Takes badge counts.
 *
 * The badge is the only thing on the site that says a take has been posted, so
 * the two ways it can be wrong are both silent: a count that never clears
 * trains people to ignore it, and one that clears too eagerly hides the board's
 * contents from whoever has not looked.
 */

import { describe, it, expect } from 'vitest';

import { countUnseenTakes, newestTakeAt, unseenTakes } from '../seen.js';

const VIEWER = 'user-1';
const OTHER = 'user-2';

const take = (id, createdAt, userId = OTHER) => ({ id, userId, createdAt });

const BOARD = [
  take('c', '2026-09-10T12:00:00Z'),
  take('b', '2026-09-05T12:00:00Z'),
  take('a', '2026-09-01T12:00:00Z')
];

describe('unseenTakes', () => {
  it('counts what arrived after the mark', () => {
    expect(countUnseenTakes(BOARD, '2026-09-03T12:00:00Z', VIEWER)).toBe(2);
    expect(unseenTakes(BOARD, '2026-09-03T12:00:00Z', VIEWER).map((t) => t.id)).toEqual(['c', 'b']);
  });

  it('counts nothing once the mark has caught up', () => {
    expect(countUnseenTakes(BOARD, '2026-09-10T12:00:00Z', VIEWER)).toBe(0);
  });

  it('never counts the viewer their own takes', () => {
    // You wrote it; being told about it is noise, and on a fourteen-person
    // board one member is a meaningful share of everything posted.
    const mine = [...BOARD, take('mine', '2026-09-12T12:00:00Z', VIEWER)];
    expect(countUnseenTakes(mine, '2026-09-03T12:00:00Z', VIEWER)).toBe(2);
  });

  it('treats a viewer who has never looked as having seen nothing', () => {
    // The honest reading: this browser genuinely has not shown them the board.
    // One visit settles it forever, where the opposite default would hide the
    // whole board from exactly the person who has never opened it.
    expect(countUnseenTakes(BOARD, null, VIEWER)).toBe(3);
  });

  it('ignores a take with no usable date rather than counting it forever', () => {
    const broken = [...BOARD, take('undated', null), take('nonsense', 'not a date')];
    expect(countUnseenTakes(broken, '2026-09-10T12:00:00Z', VIEWER)).toBe(0);
  });

  it('counts for a signed-out viewer without crediting them any takes', () => {
    expect(countUnseenTakes(BOARD, null, null)).toBe(3);
  });
});

describe('newestTakeAt', () => {
  it('is the newest posting on the board, whatever order it arrives in', () => {
    expect(newestTakeAt(BOARD)).toBe('2026-09-10T12:00:00.000Z');
    expect(newestTakeAt([...BOARD].reverse())).toBe('2026-09-10T12:00:00.000Z');
  });

  it('is null for an empty board, so nothing is marked seen', () => {
    expect(newestTakeAt([])).toBe(null);
    expect(newestTakeAt([take('undated', null)])).toBe(null);
  });

  it('is a take\'s own timestamp and never the clock', () => {
    // A browser clock ahead of the database would otherwise mark takes seen
    // before they were written, and a board read while a take was in flight
    // would swallow it.
    const now = Date.now();
    expect(new Date(newestTakeAt(BOARD)).getTime()).toBeLessThan(now);
  });
});
