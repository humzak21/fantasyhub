import { describe, it, expect } from 'vitest';
import { GRADED_WITHIN_MS, selectHomeTakes } from '../homeTakes.js';

const NOW = new Date('2026-10-23T12:00:00Z');
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const H = 60 * 60 * 1000;

const take = (id, extra = {}) => ({ id, status: 'pending', createdAt: ago(H), ...extra });
const ids = (list) => list.map((t) => t.id);

describe('selectHomeTakes', () => {
  it('takes the two newest', () => {
    const board = [take('a', { createdAt: ago(3 * H) }), take('b', { createdAt: ago(1 * H) }), take('c', { createdAt: ago(2 * H) })];
    expect(ids(selectHomeTakes(board, NOW))).toEqual(['b', 'c']);
  });

  it('adds every take graded in the last three days, graded first', () => {
    const board = [
      take('new', { createdAt: ago(H) }),
      take('newer', { createdAt: ago(0.5 * H) }),
      take('graded', { createdAt: ago(500 * H), status: 'correct', resolvedAt: ago(10 * H) }),
      take('graded-2', { createdAt: ago(400 * H), status: 'incorrect', resolvedAt: ago(20 * H) })
    ];
    expect(ids(selectHomeTakes(board, NOW))).toEqual(['graded-2', 'graded', 'newer', 'new']);
  });

  it('shows a take that is both new and graded once', () => {
    const board = [take('both', { createdAt: ago(H), status: 'correct', resolvedAt: ago(H / 2) })];
    expect(ids(selectHomeTakes(board, NOW))).toEqual(['both']);
  });

  it('drops a grade older than three days, to the millisecond', () => {
    const board = [
      take('edge', { createdAt: ago(900 * H), status: 'correct', resolvedAt: ago(GRADED_WITHIN_MS) }),
      take('past', { createdAt: ago(900 * H), status: 'correct', resolvedAt: ago(GRADED_WITHIN_MS + 1) })
    ];
    expect(ids(selectHomeTakes(board, NOW, { recent: 0 }))).toEqual(['edge']);
  });

  it('is empty for an empty board', () => {
    expect(selectHomeTakes([], NOW)).toEqual([]);
  });
});
