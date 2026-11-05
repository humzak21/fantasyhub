import { describe, it, expect } from 'vitest';

import {
  STAT_GROUPS,
  GROUPS_BY_POSITION,
  statLine,
  sumStatLines,
  summarizeLine
} from '../statCatalog.js';
import { ESPN_STAT_IDS } from '../../../services/db/espnMapping.js';

/**
 * Real 2026 rows from `player_week_stats` (measured 2026-11-05). Two values in
 * the measured rows were unreadable (Allen's id 20, the Jaguars' id 106) and
 * are left out rather than invented.
 */
const ALLEN = { position: 'QB', actualPoints: 40.82, statBreakdown: { 0: 31, 1: 20, 2: 11, 3: 248, 4: 3, 21: 64.52, 23: 14, 24: 69, 25: 2, 64: 2, 65: 1, 68: 1, 155: 1, 158: 30, 210: 1, 211: 14, 212: 8 } };
const GIBBS = { position: 'RB', actualPoints: 41.4, statBreakdown: { 23: 20, 24: 99, 25: 2, 39: 4.95, 41: 7, 42: 65, 43: 1, 53: 7, 58: 8, 59: 57, 60: 9.286, 210: 1, 212: 7, 213: 4 } };
const MCMILLAN = { position: 'WR', actualPoints: 45.2, statBreakdown: { 41: 14, 42: 192, 43: 2, 53: 14, 58: 16, 59: 65, 67: 1, 68: 1, 213: 8 } };
const MYERS = { position: 'K', actualPoints: 25, statBreakdown: { 74: 1, 75: 1, 77: 4, 78: 4, 83: 5, 84: 5, 86: 2, 87: 2 } };
const JAGUARS = { position: 'D/ST', actualPoints: 21, statBreakdown: { 91: 1, 95: 2, 96: 1, 99: 4, 100: 8, 103: 1, 105: 1, 109: 66, 120: 7, 127: 243, 130: 1 } };

const rowsOf = (byGroup, groupId) =>
  Object.fromEntries(byGroup.find((g) => g.group === groupId).rows.map((r) => [r.short, r]));
const derivedOf = (byGroup, groupId) =>
  Object.fromEntries(byGroup.find((g) => g.group === groupId).derived.map((d) => [d.id, d.value]));

describe('the catalog', () => {
  it('takes its touchdown ids from ESPN_STAT_IDS rather than restating them', () => {
    const ids = (group) => STAT_GROUPS[group].stats.map((s) => s.id);
    expect(ids('passing')).toContain(ESPN_STAT_IDS.PASSING_TD);
    expect(ids('rushing')).toContain(ESPN_STAT_IDS.RUSHING_TD);
    expect(ids('receiving')).toContain(ESPN_STAT_IDS.RECEIVING_TD);
  });

  it('keys every stat by a string id, as stat_breakdown does', () => {
    for (const group of Object.values(STAT_GROUPS)) {
      for (const s of group.stats) expect(typeof s.id).toBe('string');
    }
  });

  it('names a group list for each of the six positions the table holds', () => {
    expect(Object.keys(GROUPS_BY_POSITION).sort()).toEqual(['D/ST', 'K', 'QB', 'RB', 'TE', 'WR']);
    expect(GROUPS_BY_POSITION.WR).toEqual(['receiving', 'rushing', 'ballSecurity']);
  });
});

describe('statLine', () => {
  it('keeps only the position’s named ids, dropping everything else ESPN sends', () => {
    expect(statLine(ALLEN.statBreakdown, 'QB')).toEqual({
      0: 31, 1: 20, 3: 248, 4: 3, 23: 14, 24: 69, 25: 2, 64: 2, 68: 1
    });
  });

  it('is null without a breakdown, and empty for a breakdown with none of the ids', () => {
    expect(statLine(null, 'RB')).toBeNull();
    expect(statLine({ 210: 1 }, 'RB')).toEqual({});
  });

  it('shows nothing for a position it does not know', () => {
    expect(statLine(GIBBS.statBreakdown, 'LB')).toEqual({});
  });

  it('reconciles a kicker: made field goals are the sum of the distance buckets', () => {
    const line = statLine(MYERS.statBreakdown, 'K');
    expect(line['83']).toBe((line['74'] ?? 0) + (line['77'] ?? 0) + (line['80'] ?? 0));
  });
});

describe('sumStatLines', () => {
  it('sums a quarterback’s weeks and derives completion % from the sums', () => {
    const second = { ...ALLEN, statBreakdown: { 0: 31, 1: 25, 3: 300, 4: 1, 23: 4, 24: 10 } };
    const byGroup = sumStatLines([ALLEN, second], 'QB');
    expect(byGroup.map((g) => g.group)).toEqual(['passing', 'rushing', 'ballSecurity']);

    const passing = rowsOf(byGroup, 'passing');
    expect(passing.ATT.total).toBe(62);
    expect(passing.CMP.total).toBe(45);
    expect(passing['PASS YDS'].perGame).toBe(274);
    // From the sums (45/62), not the mean of 20/31 and 25/31's percentages.
    expect(derivedOf(byGroup, 'passing').completionPct).toBeCloseTo(45 / 62);
    expect(derivedOf(byGroup, 'rushing').yardsPerCarry).toBeCloseTo(79 / 18);
  });

  it('gives a running back yards per carry, yards per reception and catch rate', () => {
    const byGroup = sumStatLines([GIBBS], 'RB');
    expect(byGroup.map((g) => g.group)).toEqual(['rushing', 'receiving']);
    expect(rowsOf(byGroup, 'rushing')['RUSH TD'].total).toBe(2);
    expect(rowsOf(byGroup, 'receiving').YAC.total).toBe(57);
    expect(derivedOf(byGroup, 'rushing').yardsPerCarry).toBeCloseTo(99 / 20);
    expect(derivedOf(byGroup, 'receiving').yardsPerReception).toBeCloseTo(65 / 7);
    expect(derivedOf(byGroup, 'receiving').catchRate).toBeCloseTo(7 / 8);
  });

  it('drops a group whose every total is absent or zero', () => {
    const byGroup = sumStatLines([MCMILLAN], 'WR');
    // No carries at all: no Rushing block. One fumble: Ball security stays.
    expect(byGroup.map((g) => g.group)).toEqual(['receiving', 'ballSecurity']);
    expect(derivedOf(byGroup, 'receiving').yardsPerReception).toBeCloseTo(192 / 14);
    expect(derivedOf(byGroup, 'receiving').catchRate).toBeCloseTo(14 / 16);

    const zeros = sumStatLines([{ actualPoints: 3, statBreakdown: { 53: 1, 42: 9, 68: 0, 72: 0 } }], 'WR');
    expect(zeros.map((g) => g.group)).toEqual(['receiving']);
  });

  it('gives a kicker FG % and a D/ST its counting stats', () => {
    expect(derivedOf(sumStatLines([MYERS], 'K'), 'kicking').fgPct).toBe(1);
    const defense = rowsOf(sumStatLines([JAGUARS], 'D/ST'), 'defense');
    expect(defense.SCK.total).toBe(4);
    expect(defense.PA.total).toBe(7);
    expect(defense.YA.total).toBe(243);
    expect(defense.TKL.total).toBe(66);
  });

  it('counts only appeared weeks with a breakdown, and divides by them', () => {
    const lines = [
      GIBBS,
      { actualPoints: 0, statBreakdown: null }, // the IR week: not a game of zeros
      { actualPoints: 12, statBreakdown: null }, // played, before breakdowns existed
      { actualPoints: null, statBreakdown: { 23: 30 } } // not settled
    ];
    const byGroup = sumStatLines(lines, 'RB');
    expect(byGroup[0].games).toBe(1);
    expect(rowsOf(byGroup, 'rushing').CAR.perGame).toBe(20);
  });

  it('is empty when nothing is known', () => {
    expect(sumStatLines([{ actualPoints: 10, statBreakdown: null }], 'RB')).toEqual([]);
    expect(sumStatLines([], 'QB')).toEqual([]);
  });

  it('leaves out a derived ratio with nothing to divide by', () => {
    const byGroup = sumStatLines([{ actualPoints: 2, statBreakdown: { 24: 5 } }], 'RB');
    expect(byGroup[0].derived).toEqual([]);
  });
});

describe('summarizeLine', () => {
  it('says each position’s week in its own terms', () => {
    expect(summarizeLine(ALLEN)).toBe('20/31, 248 pass yds, 3 pass TD, 69 rush yds, 2 rush TD');
    expect(summarizeLine(GIBBS)).toBe('20 car, 99 rush yds, 7 rec, 65 rec yds, 3 TD');
    expect(summarizeLine(MCMILLAN)).toBe('14 rec, 192 yds, 2 TD');
    expect(summarizeLine(MYERS)).toBe('5/5 FG, 1 from 50+, 2/2 XP');
    expect(summarizeLine(JAGUARS)).toBe('4 sck, 2 INT, 1 FR, 1 TD, 7 PA');
  });

  it('reads the plan’s own example for a rushing-only week', () => {
    expect(summarizeLine({ statBreakdown: { 23: 24, 24: 148, 25: 2 } }, 'RB')).toBe('24 car, 148 yds, 2 TD');
  });

  it('is null without a breakdown or with nothing to say', () => {
    expect(summarizeLine({ statBreakdown: null }, 'RB')).toBeNull();
    expect(summarizeLine({ statBreakdown: { 210: 1 } }, 'RB')).toBeNull();
    expect(summarizeLine(null)).toBeNull();
  });
});
