import { describe, it, expect } from 'vitest';

import { trendSeriesLabel, trendSeriesStyles } from '../recordTrendStyle';
import { teamChartColor } from '../../../../utils/teamColors';

const YEARS = [2020, 2021, 2022, 2023].map((year) => ({ year }));
const line = (franchiseId, year) => ({ key: `${franchiseId}:${year}`, franchiseId, year });

describe('trendSeriesStyles', () => {
  it('colours one team by season, on the league calendar rather than the picked list', () => {
    const styles = trendSeriesStyles([line('fA', 2023), line('fA', 2021)], YEARS);

    expect(styles.get('fA:2023')).toEqual({ stroke: 'var(--chart-4)', strokeOpacity: 1 });
    expect(styles.get('fA:2021')).toEqual({ stroke: 'var(--chart-2)', strokeOpacity: 1 });
  });

  it("colours several teams by franchise, fading each team's older seasons", () => {
    const styles = trendSeriesStyles(
      [line('fA', 2023), line('fA', 2022), line('fA', 2021), line('fB', 2023)],
      YEARS
    );

    expect(styles.get('fA:2023')).toEqual({ stroke: teamChartColor({ franchiseId: 'fA' }), strokeOpacity: 1 });
    expect(styles.get('fA:2022').strokeOpacity).toBeCloseTo(0.675);
    expect(styles.get('fA:2021').strokeOpacity).toBeCloseTo(0.35);
    expect(styles.get('fB:2023')).toEqual({ stroke: teamChartColor({ franchiseId: 'fB' }), strokeOpacity: 1 });
  });
});

describe('trendSeriesLabel', () => {
  const franchiseName = (id) => `Name ${id}`;

  it('names only what differs between the lines', () => {
    expect(trendSeriesLabel(line('fA', 2023), { teamCount: 1, seasonCount: 3, franchiseName })).toBe('2023');
    expect(trendSeriesLabel(line('fA', 2023), { teamCount: 2, seasonCount: 1, franchiseName })).toBe('Name fA');
    expect(trendSeriesLabel(line('fA', 2023), { teamCount: 2, seasonCount: 2, franchiseName })).toBe('Name fA · 2023');
  });
});
