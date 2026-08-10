/**
 * Teams: identity and roster attachment. Stat columns on `teams` are legacy —
 * `v_team_standings` is the source of truth for records since the P1 migration.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { buildTeamIndex } from '../espnGameMapper.js';
import { formatForDatabase, formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { syncTeamRosterFromESPN } from './rosters.js';

/**
 * The season's teams as stored, in stable id order.
 *
 * Rows are returned in database shape, not `formatFromDatabase`d: the app
 * reads `team.division_id`, `team.points_for` and friends straight off these
 * objects, and the ranking calculator expects the same. Converting here would
 * have to be matched by a conversion in every consumer.
 */
export async function getTeamsForSeason(ctx, seasonId) {
  try {
    const { data, error } = await ctx.client
      .from('teams')
      .select('*')
      .eq('season_id', seasonId)
      .order('id', { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    throwDbError(error, 'Get teams for season');
  }
}

// Team management
export async function addTeamToSeason(ctx, seasonId, name, owner = '') {

  const team = {
    seasonId,
    name,
    owner,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    winPercentage: 0,
    pointDifferential: 0,
    averagePointsFor: 0,
    averagePointsAgainst: 0,
    strengthOfSchedule: 0,
    opponentWinPercentage: 0,
    qualityWins: 0,
    badLosses: 0,
    blowoutWins: 0,
    closeWins: 0,
    closeLosses: 0,
    recentForm: 0,
    currentStreak: { type: 'none', length: 0 },
    powerRating: 0,
    previousRank: null,
    rankChange: 0
  };

  if (!name || name.length === 0) {
    throw new Error('Invalid team data');
  }

  try {
    const { data, error } = await ctx.client
      .from('teams')
      .insert(formatForDatabase(team))
      .select()
      .single();

    if (error) throw error;

    const formattedTeam = formatFromDatabase(data);

    // Clear season cache to ensure fresh data on next fetch
    ctx.seasonsCache.delete(seasonId);

    return formattedTeam;
  } catch (error) {
    throwDbError(error, 'Add team');
  }
}

/**
 * Refresh team identity from ESPN.
 *
 * Replaces `schedule.importTeamsFromESPNImport`, which read the `espn_teams`
 * staging table. It now takes the live ESPN payload, so there is nothing to
 * stage and nothing to approve.
 *
 * Only what ESPN owns is written: name, owner, ESPN id and abbreviation.
 * `franchise_id`, `division_id` and every stat column belong to the league —
 * the season carry-forward sets them — and are never touched here.
 *
 * Teams are matched by ESPN id first, then owner name, and only inserted when
 * neither matches. A season whose teams were carried forward therefore gets its
 * names refreshed rather than a second set of teams.
 *
 * @param {Array} espnTeams from `getFullSeasonSchedule().teams`
 * @returns {Promise<{inserted: number, updated: number, unchanged: number, errors: Array}>}
 */
export async function upsertTeamsFromESPN(ctx, seasonId, espnTeams = []) {
  try {
    const existing = await getTeamsForSeason(ctx, seasonId);
    const index = buildTeamIndex(existing);

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const errors = [];

    for (const espnTeam of espnTeams) {
      // `teamName` is ESPN's `name` — the abbreviation lives in its own field.
      // These were the same value until the fetcher was fixed, which would have
      // renamed every team to "LE", "msh" and friends on the first sync.
      const name = espnTeam.teamName?.trim();
      const owner = espnTeam.ownerName?.trim() || '';
      const abbreviation = espnTeam.abbreviation?.trim() || null;

      if (!name) {
        errors.push({ espnTeamId: espnTeam.teamId, error: 'ESPN returned no team name' });
        continue;
      }

      const match = index.find(espnTeam.teamId, espnTeam.ownerName);

      if (!match) {
        const { error } = await ctx.client.from('teams').insert({
          season_id: seasonId,
          name,
          owner,
          espn_team_id: espnTeam.teamId,
          abbreviation
        });

        if (error) {
          errors.push({ team: name, error: error.message });
          continue;
        }
        inserted += 1;
        continue;
      }

      const patch = {};
      if (name !== match.name) patch.name = name;
      if (owner && owner !== match.owner) patch.owner = owner;
      if (abbreviation !== (match.abbreviation ?? null)) patch.abbreviation = abbreviation;
      if (match.espn_team_id == null) patch.espn_team_id = espnTeam.teamId;

      if (Object.keys(patch).length === 0) {
        unchanged += 1;
        continue;
      }

      const { error } = await ctx.client.from('teams').update(patch).eq('id', match.id);

      if (error) {
        // `teams_name_season_unique` bites when two owners swap team names
        // between runs. Report the team and keep going — the rest of the
        // league should still import.
        errors.push({ team: name, error: error.message });
        continue;
      }
      updated += 1;
    }

    ctx.seasonsCache.delete(seasonId);

    return { inserted, updated, unchanged, errors };
  } catch (error) {
    throwDbError(error, 'Upsert teams from ESPN');
  }
}

/**
 * Copy a season's teams into another season.
 *
 * Only *identity* carries over: name, owner, ESPN team id, franchise and
 * division. Every stat column is left unset so the database defaults apply and
 * the new season starts 0-0 with no roster, no playoff finish and no rating —
 * copying last year's record forward would poison the standings views and the
 * ranking calculator, both of which read those columns.
 *
 * Owner is the stable identity across seasons (team names change most years),
 * and `franchise_id` is what the history tables join on, so both are carried
 * even though ESPN would supply a fresh team name at the first sync.
 *
 * Division ids are per-season rows; pass the map from `copyDivisionsToSeason`
 * to keep each team in the division it was in. Teams whose division has no
 * counterpart land unassigned rather than pointing at another season's row.
 *
 * @param {Map<number, number>} [divisionIdMap] source division id → new id.
 * @returns {Promise<Array>} the inserted rows, in database shape (as
 *   `getTeamsForSeason` returns them).
 */
export async function copyTeamsToSeason(ctx, sourceSeasonId, targetSeasonId, divisionIdMap = new Map()) {
  try {
    const { data: source, error } = await ctx.client
      .from('teams')
      .select('name, owner, espn_team_id, franchise_id, division_id')
      .eq('season_id', sourceSeasonId)
      .order('espn_team_id', { ascending: true, nullsFirst: false });

    if (error) throw error;
    if (!source || source.length === 0) return [];

    const rows = source.map((team) => ({
      season_id: targetSeasonId,
      name: team.name,
      owner: team.owner,
      espn_team_id: team.espn_team_id,
      franchise_id: team.franchise_id,
      division_id: divisionIdMap.get(team.division_id) ?? null
    }));

    const { data: inserted, error: insertError } = await ctx.client
      .from('teams')
      .insert(rows)
      .select();

    if (insertError) throw insertError;

    ctx.seasonsCache.delete(targetSeasonId);

    return inserted || [];
  } catch (error) {
    throwDbError(error, 'Copy teams to season');
  }
}

export async function updateTeam(ctx, seasonId, teamId, updates) {

  try {
    // Separate roster data from team updates
    const { roster, ...teamUpdates } = updates;

    // Update team record (if there are non-roster fields to update)
    let updatedTeam = null;
    if (Object.keys(teamUpdates).length > 0) {
      const formattedUpdates = formatForDatabase(teamUpdates);

      const { data, error } = await ctx.client
        .from('teams')
        .update(formattedUpdates)
        .eq('id', teamId)
        .eq('season_id', seasonId)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error(`No team found with id: ${teamId} and season_id: ${seasonId}`);
      }

      updatedTeam = formatFromDatabase(data[0]);
    }

    // Handle roster data using the database function
    if (roster && Array.isArray(roster)) {
      const currentWeek = updates.currentWeek || 1; // Default to week 1 if not provided
      await syncTeamRosterFromESPN(ctx, teamId, roster, currentWeek);
    }

    // Clear season cache
    ctx.seasonsCache.delete(seasonId);

    return updatedTeam || { id: teamId };
  } catch (error) {
    throwDbError(error, 'Update team');
  }
}

export async function removeTeamFromSeason(ctx, seasonId, teamId) {

  try {
    const { error } = await ctx.client
      .from('teams')
      .delete()
      .eq('id', teamId)
      .eq('season_id', seasonId);

    if (error) throw error;

    // Clear season cache
    ctx.seasonsCache.delete(seasonId);
  } catch (error) {
    throwDbError(error, 'Remove team');
  }
}
