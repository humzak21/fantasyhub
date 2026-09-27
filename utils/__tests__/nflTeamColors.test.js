import { describe, it, expect } from 'vitest';

import { nflTeamColor, NFL_TEAM_ABBREVIATIONS } from '../nflTeamColors.js';

describe('nflTeamColor', () => {
  it('colours all 32 teams', () => {
    expect(NFL_TEAM_ABBREVIATIONS).toHaveLength(32);
    for (const abbreviation of NFL_TEAM_ABBREVIATIONS) {
      expect(nflTeamColor(abbreviation)).toMatch(/^oklch\(/);
    }
  });

  it('keeps every colour readable on the near-black ground', () => {
    for (const abbreviation of NFL_TEAM_ABBREVIATIONS) {
      const lightness = Number(nflTeamColor(abbreviation).match(/oklch\(([\d.]+)/)[1]);
      expect(lightness).toBeGreaterThanOrEqual(0.62);
    }
  });

  it('resolves the older spellings and is case-insensitive', () => {
    expect(nflTeamColor('WSH')).toBe(nflTeamColor('WAS'));
    expect(nflTeamColor('jax')).toBe(nflTeamColor('JAX'));
  });

  it('is null for a free agent or an unknown code, so the caller keeps its default', () => {
    expect(nflTeamColor(null)).toBeNull();
    expect(nflTeamColor('XYZ')).toBeNull();
  });
});
