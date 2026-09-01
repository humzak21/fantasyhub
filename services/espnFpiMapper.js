/**
 * ESPN power-index payload → `nfl_team_ratings` rows, as pure functions.
 *
 * Nothing here touches the database or the network, the same split as
 * `services/espnNflScheduleMapper.js`: this returns a plan,
 * `services/db/nflTeamRatings.js::upsertNflTeamRatings` executes it.
 *
 * The one genuinely tricky fact this file owns: the payload's team `id`s are
 * ESPN's **NFL-side id space**, not the fantasy `proTeamId` space that
 * `players.pro_team_id` and `nfl_schedule.pro_team_id` store. They collide on
 * some values (both call the Rams 14) and disagree on others, which is the
 * worst kind of wrong — a join by id would be mostly right. The join is by
 * abbreviation only, and the abbreviations differ in exactly one place today:
 * the NFL side says WSH where the fantasy side says WAS.
 *
 * Per-team values zip *positionally* against the top-level `categories[].names`
 * — each team's `categories[i].values[j]` is named by
 * `payload.categories[i].names[j]`. The `efficiencies` category carries no
 * `names`/`values` pair and is skipped.
 */

import { NFL_PRO_TEAM_ABBREVIATIONS } from './db/espnMapping.js';

/**
 * NFL-side abbreviations that differ from the fantasy table's. WSH→WAS is the
 * one live difference (verified against all 32 on 2026-09-01); JAC and LA are
 * spellings ESPN has used elsewhere, kept defensively so a quiet rename on
 * their side degrades to a warning for one team, not a wrong join.
 */
const ABBREVIATION_ALIASES = Object.freeze({
  WSH: 'WAS',
  JAC: 'JAX',
  LA: 'LAR'
});

/** Fantasy proTeamId by abbreviation — `NFL_PRO_TEAM_ABBREVIATIONS` inverted, aliases overlaid. */
export const PRO_TEAM_ID_BY_ABBREVIATION = Object.freeze({
  ...Object.fromEntries(
    Object.entries(NFL_PRO_TEAM_ABBREVIATIONS).map(([id, abbrev]) => [abbrev, Number(id)])
  ),
  ...Object.fromEntries(
    Object.entries(ABBREVIATION_ALIASES).map(([alias, canonical]) => {
      const entry = Object.entries(NFL_PRO_TEAM_ABBREVIATIONS)
        .find(([, abbrev]) => abbrev === canonical);
      return [alias, entry ? Number(entry[0]) : null];
    })
  )
});

/** The fantasy proTeamId for an NFL-side abbreviation, or null. */
export function proTeamIdForAbbreviation(abbreviation) {
  if (typeof abbreviation !== 'string') return null;
  return PRO_TEAM_ID_BY_ABBREVIATION[abbreviation.toUpperCase()] ?? null;
}

/** A number, or null — never 0 for a value ESPN did not send. */
function toNullableNumber(value) {
  const number = Number(value);
  return value != null && Number.isFinite(number) ? number : null;
}

/**
 * `{ name: value }` for one team's category, zipped against the payload-level
 * names. Returns {} for a category with no names/values pair (`efficiencies`).
 */
function zipCategory(names, values) {
  if (!Array.isArray(names) || !Array.isArray(values)) return {};

  const out = {};
  for (let i = 0; i < names.length; i += 1) {
    out[names[i]] = values[i] ?? null;
  }
  return out;
}

/**
 * The whole payload, as rows ready for `upsertNflTeamRatings`.
 *
 * Warns rather than throws on everything short of a shape change: an unmapped
 * abbreviation drops that team, a missing fpi still writes the row (every
 * rating column is nullable by design), and a count under 32 is reported so
 * the sync log shows it. The season-year cross-check is a warning too — the
 * payload says which season ESPN thinks it is describing, and a mismatch means
 * the snapshot is being filed under the wrong year.
 *
 * @param {object} payload the raw power-index payload from the fetcher
 * @param {{ seasonYear: number, week: number }} target where the snapshot files
 * @returns {{ rows: Array, warnings: Array<string>, teamCount: number }}
 */
export function mapPowerIndexPayload(payload, { seasonYear, week } = {}) {
  if (!seasonYear) throw new Error('A season year is required');
  if (!week) throw new Error('A week is required');

  const warnings = [];
  const teams = Array.isArray(payload?.teams) ? payload.teams : [];

  if (teams.length === 0) {
    return { rows: [], warnings: ['ESPN returned no power-index teams'], teamCount: 0 };
  }

  const payloadYear = payload?.currentSeason?.year;
  if (payloadYear != null && payloadYear !== seasonYear) {
    warnings.push(
      `payload says season ${payloadYear}, filing under ${seasonYear} — check the target year`
    );
  }

  // Category names live once at the top level; per-team values zip against
  // them by position and by category name.
  const namesByCategory = {};
  for (const category of payload?.categories ?? []) {
    if (category?.name && Array.isArray(category.names)) {
      namesByCategory[category.name] = category.names;
    }
  }

  const rows = [];

  for (const entry of teams) {
    const abbreviation = entry?.team?.abbreviation ?? null;
    const proTeamId = proTeamIdForAbbreviation(abbreviation);

    if (proTeamId == null) {
      warnings.push(
        `no fantasy proTeamId for ${abbreviation ?? entry?.team?.displayName ?? 'unknown team'} — skipped`
      );
      continue;
    }

    const byName = {};
    for (const category of entry?.categories ?? []) {
      Object.assign(
        byName,
        zipCategory(namesByCategory[category?.name], category?.values)
      );
    }

    const fpi = toNullableNumber(byName.fpi);
    if (fpi == null) {
      warnings.push(`${abbreviation}: payload carries no fpi value`);
    }

    rows.push({
      season_year: seasonYear,
      week,
      pro_team_id: proTeamId,
      fpi,
      epa_offense: toNullableNumber(byName.epaoffense),
      epa_defense: toNullableNumber(byName.epadefense),
      epa_special_teams: toNullableNumber(byName.epaspecialteams),
      fpi_rank: toNullableNumber(byName.fpirank),
      sos_remaining_rank: toNullableNumber(byName.sosremainingrank),
      projected_wins: toNullableNumber(byName.projectedw),
      projected_losses: toNullableNumber(byName.projectedl),
      playoff_probability: toNullableNumber(byName.probmakeplayoffs)
    });
  }

  if (rows.length < 32) {
    warnings.push(`mapped ${rows.length} of an expected 32 teams`);
  }

  return { rows, warnings, teamCount: rows.length };
}

export default mapPowerIndexPayload;
