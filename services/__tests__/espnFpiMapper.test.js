/**
 * The FPI payload → `nfl_team_ratings` rows mapping.
 *
 * The fixture is the live payload captured 2026-09-01, trimmed to the fields
 * the mapper reads. The one fact these tests exist to hold in place: the
 * payload's team ids are ESPN's NFL-side id space, NOT the fantasy proTeamId
 * space, and the two collide on some values — so the join is by abbreviation,
 * with the NFL side's WSH aliased to the fantasy table's WAS. A join by id
 * would be mostly right, which is the worst kind of wrong.
 */

import { describe, it, expect } from 'vitest';

import fixture from './__fixtures__/espnPowerIndex.json';
import {
  PRO_TEAM_ID_BY_ABBREVIATION,
  mapPowerIndexPayload,
  proTeamIdForAbbreviation
} from '../espnFpiMapper.js';
import { NFL_PRO_TEAM_ABBREVIATIONS, getNFLTeamAbbreviation } from '../db/espnMapping.js';

const TARGET = { seasonYear: 2026, week: 1 };

describe('proTeamIdForAbbreviation', () => {
  it('round-trips every fantasy proTeamId through its abbreviation', () => {
    for (const id of Object.keys(NFL_PRO_TEAM_ABBREVIATIONS).map(Number)) {
      expect(proTeamIdForAbbreviation(getNFLTeamAbbreviation(id))).toBe(id);
    }
  });

  it('maps the NFL-side WSH to the fantasy WAS id', () => {
    expect(proTeamIdForAbbreviation('WSH')).toBe(28);
    expect(proTeamIdForAbbreviation('WSH')).toBe(proTeamIdForAbbreviation('WAS'));
  });

  it('keeps the defensive aliases pointing at real ids', () => {
    expect(proTeamIdForAbbreviation('JAC')).toBe(proTeamIdForAbbreviation('JAX'));
    expect(proTeamIdForAbbreviation('LA')).toBe(proTeamIdForAbbreviation('LAR'));
  });

  it('returns null rather than guessing for an unknown abbreviation', () => {
    expect(proTeamIdForAbbreviation('XYZ')).toBeNull();
    expect(proTeamIdForAbbreviation(null)).toBeNull();
  });

  it('has no alias shadowing a canonical abbreviation with a different id', () => {
    // An alias that overwrote a real entry would silently re-point a team.
    for (const [abbrev, id] of Object.entries(PRO_TEAM_ID_BY_ABBREVIATION)) {
      if (NFL_PRO_TEAM_ABBREVIATIONS[id] !== undefined) {
        expect(typeof id).toBe('number');
      }
      expect(id).not.toBeNull();
      expect(abbrev).toBe(abbrev.toUpperCase());
    }
  });
});

describe('mapPowerIndexPayload', () => {
  it('maps all 32 teams from the captured payload with no warnings', () => {
    const { rows, warnings, teamCount } = mapPowerIndexPayload(fixture, TARGET);

    expect(teamCount).toBe(32);
    expect(rows).toHaveLength(32);
    expect(warnings).toEqual([]);

    // Every fantasy proTeamId appears exactly once.
    const ids = rows.map((row) => row.pro_team_id).sort((a, b) => a - b);
    expect(new Set(ids).size).toBe(32);
    expect(ids).toEqual(Object.keys(NFL_PRO_TEAM_ABBREVIATIONS).map(Number).sort((a, b) => a - b));
  });

  it('emits snake_case keys matching the table, filed under the target', () => {
    const { rows } = mapPowerIndexPayload(fixture, TARGET);

    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        'epa_defense',
        'epa_offense',
        'epa_special_teams',
        'fpi',
        'fpi_rank',
        'playoff_probability',
        'pro_team_id',
        'projected_losses',
        'projected_wins',
        'season_year',
        'sos_remaining_rank',
        'week'
      ]);
      expect(row.season_year).toBe(2026);
      expect(row.week).toBe(1);
      expect(typeof row.fpi).toBe('number');
    }
  });

  it('zips values positionally against the top-level category names', () => {
    // The Rams are the fixture's first team: fpi 5.854, rank 1, projected
    // 11.26 wins — hand-read from the captured payload.
    const { rows } = mapPowerIndexPayload(fixture, TARGET);
    const rams = rows.find((row) => row.pro_team_id === proTeamIdForAbbreviation('LAR'));

    expect(rams.fpi).toBeCloseTo(5.854, 6);
    expect(rams.fpi_rank).toBe(1);
    expect(rams.projected_wins).toBeCloseTo(11.26, 6);
  });

  it('stores a null, never a 0, for a value ESPN sent as null', () => {
    // In the captured preseason payload probwinconf is null for every team.
    const payload = JSON.parse(JSON.stringify(fixture));
    const team = payload.teams[0];
    const fpiCategory = team.categories.find((c) => c.name === 'fpi');
    fpiCategory.values[7] = null; // sosremainingrank

    const { rows } = mapPowerIndexPayload(payload, TARGET);
    const mapped = rows.find(
      (row) => row.pro_team_id === proTeamIdForAbbreviation(team.team.abbreviation)
    );
    expect(mapped.sos_remaining_rank).toBeNull();
  });

  it('warns and skips a team with an unmappable abbreviation', () => {
    const payload = JSON.parse(JSON.stringify(fixture));
    payload.teams[0].team.abbreviation = 'XXX';

    const { rows, warnings } = mapPowerIndexPayload(payload, TARGET);

    expect(rows).toHaveLength(31);
    expect(warnings.some((w) => w.includes('XXX'))).toBe(true);
    expect(warnings.some((w) => w.includes('31 of an expected 32'))).toBe(true);
  });

  it('warns when the payload disagrees about which season it describes', () => {
    const { warnings } = mapPowerIndexPayload(fixture, { seasonYear: 2025, week: 1 });
    expect(warnings.some((w) => w.includes('payload says season 2026'))).toBe(true);
  });

  it('warns on a missing fpi but still writes the row', () => {
    const payload = JSON.parse(JSON.stringify(fixture));
    const team = payload.teams[0];
    team.categories.find((c) => c.name === 'fpi').values[0] = null;

    const { rows, warnings } = mapPowerIndexPayload(payload, TARGET);
    const mapped = rows.find(
      (row) => row.pro_team_id === proTeamIdForAbbreviation(team.team.abbreviation)
    );

    expect(mapped.fpi).toBeNull();
    expect(warnings.some((w) => w.includes('no fpi value'))).toBe(true);
  });

  it('requires the target season and week', () => {
    expect(() => mapPowerIndexPayload(fixture, { week: 1 })).toThrow(/season year/);
    expect(() => mapPowerIndexPayload(fixture, { seasonYear: 2026 })).toThrow(/week/);
  });

  it('reports an empty payload as a warning, not a throw', () => {
    const { rows, warnings } = mapPowerIndexPayload({ teams: [] }, TARGET);
    expect(rows).toEqual([]);
    expect(warnings).toEqual(['ESPN returned no power-index teams']);
  });
});
