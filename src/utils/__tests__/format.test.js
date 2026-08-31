import { describe, it, expect } from 'vitest';
import {
  EMPTY,
  deltaDirection,
  formatDelta,
  formatFraction,
  formatOrdinal,
  formatPct,
  formatPerGame,
  formatPoints,
  formatRecord,
  parseStreak,
} from '../format';

describe('formatPoints', () => {
  it('uses one decimal and groups thousands', () => {
    expect(formatPoints(1982.42)).toBe('1,982.4');
    expect(formatPoints(112.8)).toBe('112.8');
  });

  it('pads to the decimal so a column lines up', () => {
    expect(formatPoints(100)).toBe('100.0');
  });

  it('returns an em dash for anything missing rather than zero', () => {
    // A team with no games has not scored zero; it has not played.
    expect(formatPoints(null)).toBe(EMPTY);
    expect(formatPoints(undefined)).toBe(EMPTY);
    expect(formatPoints(NaN)).toBe(EMPTY);
    expect(formatPoints('')).toBe(EMPTY);
  });

  it('keeps zero, which is a real score', () => {
    expect(formatPoints(0)).toBe('0.0');
  });
});

describe('formatPct', () => {
  it('takes an already-scaled 0-100 value', () => {
    expect(formatPct(86.67)).toBe('86.7%');
    expect(formatPct(50)).toBe('50.0%');
  });

  it('honours an explicit precision', () => {
    expect(formatPct(86.67, 0)).toBe('87%');
  });

  it('handles a 0-1 fraction through formatFraction', () => {
    expect(formatFraction(0.714)).toBe('71.4%');
  });

  it('is an em dash when missing', () => {
    expect(formatPct(null)).toBe(EMPTY);
    expect(formatFraction(undefined)).toBe(EMPTY);
  });
});

describe('formatDelta', () => {
  it('always shows the sign, including the plus', () => {
    expect(formatDelta(352.84)).toBe('+352.8');
    expect(formatDelta(-82.8)).toBe('−82.8');
  });

  it('treats zero as neither positive nor negative', () => {
    expect(formatDelta(0)).toBe('0.0');
    expect(deltaDirection(0)).toBe('neutral');
  });

  it('reports direction for colouring', () => {
    expect(deltaDirection(5)).toBe('positive');
    expect(deltaDirection(-5)).toBe('negative');
    expect(deltaDirection(null)).toBe('neutral');
  });
});

describe('formatRecord', () => {
  it('formats from three numbers', () => {
    expect(formatRecord(13, 2)).toBe('13–2');
  });

  it('formats from the object shape the db returns', () => {
    expect(formatRecord({ wins: 10, losses: 6 })).toBe('10–6');
  });

  it('only shows ties when there are some', () => {
    expect(formatRecord(10, 5, 0)).toBe('10–5');
    expect(formatRecord(10, 5, 1)).toBe('10–5–1');
    expect(formatRecord({ wins: 10, losses: 5, ties: 1 })).toBe('10–5–1');
  });

  it('treats a missing side as zero, not as missing', () => {
    expect(formatRecord({ wins: 3 })).toBe('3–0');
  });
});

describe('parseStreak', () => {
  it('labels a winning and losing streak', () => {
    expect(parseStreak({ type: 'win', length: 3 })).toMatchObject({ label: 'W3', type: 'win' });
    expect(parseStreak({ type: 'loss', length: 1 })).toMatchObject({ label: 'L1', type: 'loss' });
  });

  it('returns null when there is no streak, so the chip can be skipped', () => {
    expect(parseStreak(null)).toBeNull();
    expect(parseStreak({ type: 'none' })).toBeNull();
    expect(parseStreak({ type: 'win', length: 0 })).toBeNull();
  });
});

describe('formatOrdinal', () => {
  it('handles the ordinary cases', () => {
    expect(formatOrdinal(1)).toBe('1st');
    expect(formatOrdinal(2)).toBe('2nd');
    expect(formatOrdinal(3)).toBe('3rd');
    expect(formatOrdinal(4)).toBe('4th');
  });

  it('handles the teens, which the naive rule gets wrong', () => {
    expect(formatOrdinal(11)).toBe('11th');
    expect(formatOrdinal(12)).toBe('12th');
    expect(formatOrdinal(13)).toBe('13th');
    expect(formatOrdinal(21)).toBe('21st');
  });
});

describe('formatPerGame', () => {
  it('divides and formats', () => {
    expect(formatPerGame(1982.42, 15)).toBe('132.2');
  });

  it('guards the division rather than emitting Infinity', () => {
    expect(formatPerGame(100, 0)).toBe(EMPTY);
    expect(formatPerGame(null, 5)).toBe(EMPTY);
  });
});
