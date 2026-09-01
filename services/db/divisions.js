/**
 * Divisions and the division-grouped standings the UI renders.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import * as models from '../../types/index.js';
import { formatForDatabase, formatFromDatabase } from './caseMap.js';
import { DbError, DbErrorKind, throwDbError } from './errors.js';
export async function getDivisions(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('divisions')
      .select('*')
      .eq('season_id', seasonId)
      .order('display_order');

    if (error) throw error;

    return data || [];
  } catch (error) {
    throwDbError(error, 'Get divisions');
    return [];
  }
}

// Division management methods
export async function getDivisionsForSeason(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('divisions')
      .select('*')
      .eq('season_id', seasonId)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return data?.map(formatFromDatabase) || [];
  } catch (error) {
    throwDbError(error, 'Get divisions for season');
    return [];
  }
}

export async function createDivision(ctx, seasonId, name, displayOrder = 1) {

  const division = models.createDivision(null, seasonId, name, displayOrder);

  if (!models.validateDivision(division)) {
    throw new Error('Invalid division data');
  }

  try {
    // A brand-new division is a brand-new lineage. Minting the identity first
    // is what lets next season's carry-forward adopt this row rather than
    // guessing from its display order — see `league_divisions`.
    const { data: identity, error: identityError } = await ctx.client
      .from('league_divisions')
      .insert({ label: division.name })
      .select('id')
      .single();

    if (identityError) throw identityError;

    const divisionData = formatForDatabase({
      seasonId: division.seasonId,
      name: division.name,
      displayOrder: division.displayOrder,
      divisionIdentityId: identity?.id ?? null
    });

    const { data, error } = await ctx.client
      .from('divisions')
      .insert(divisionData)
      .select()
      .single();

    if (error) throw error;

    // Clear season cache
    ctx.seasonsCache.delete(seasonId);

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Create division');
  }
}

/**
 * Give one season the same divisions as another.
 *
 * `divisions.id` is a serial and a division row belongs to exactly one season,
 * so a new season cannot point its teams at last year's division ids. It needs
 * its own rows, and the teams copied alongside need to know which new row
 * corresponds to which old one.
 *
 * This is an upsert, not an insert: the `trigger_create_default_divisions`
 * trigger has already seeded the new season with 'Division 1' and 'Division 2'
 * by the time we get here, and `(season_id, display_order)` is unique — a plain
 * insert collides. Matching on `display_order` renames those placeholders in
 * place, which is also what makes the id map unambiguous.
 *
 * `division_identity_id` crosses over with the name. That is the whole reason
 * `league_divisions` exists: a rename no longer breaks the lineage, because the
 * lineage was never the name.
 *
 * @returns {Promise<Map<number, number>>} source division id → new division id.
 */
export async function copyDivisionsToSeason(ctx, sourceSeasonId, targetSeasonId) {
  try {
    const { data: source, error } = await ctx.client
      .from('divisions')
      .select('id, name, display_order, division_identity_id')
      .eq('season_id', sourceSeasonId)
      .order('display_order', { ascending: true });

    if (error) throw error;
    if (!source || source.length === 0) return new Map();

    const { data: written, error: writeError } = await ctx.client
      .from('divisions')
      .upsert(
        source.map((division) => ({
          season_id: targetSeasonId,
          name: division.name,
          display_order: division.display_order,
          // The placeholder rows the trigger seeded get renamed *and* adopted
          // into their lineage — the same upsert, one more column.
          division_identity_id: division.division_identity_id ?? null
        })),
        { onConflict: 'season_id,display_order' }
      )
      .select('id, display_order');

    if (writeError) throw writeError;

    // Placeholders past the end of the source season's divisions — a league
    // that shrank from three divisions to two. No team points at them yet.
    const keptOrders = source.map((division) => division.display_order);
    const { error: pruneError } = await ctx.client
      .from('divisions')
      .delete()
      .eq('season_id', targetSeasonId)
      .not('display_order', 'in', `(${keptOrders.join(',')})`);

    if (pruneError) throw pruneError;

    const newIdByOrder = new Map((written || []).map((d) => [d.display_order, d.id]));

    ctx.seasonsCache.delete(targetSeasonId);

    return new Map(
      source
        .map((division) => [division.id, newIdByOrder.get(division.display_order)])
        .filter(([, newId]) => newId != null)
    );
  } catch (error) {
    throwDbError(error, 'Copy divisions to season');
  }
}

export async function updateDivision(ctx, divisionId, updates) {

  try {
    const { data, error } = await ctx.client
      .from('divisions')
      .update(formatForDatabase(updates))
      .eq('id', divisionId)
      .select()
      .single();

    if (error) throw error;

    // Clear season cache if we have the season id
    if (data?.season_id) {
      ctx.seasonsCache.delete(data.season_id);
    }

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Update division');
  }
}

export async function deleteDivision(ctx, divisionId) {

  try {
    // First, get the season_id for cache clearing
    const { data: divisionData } = await ctx.client
      .from('divisions')
      .select('season_id')
      .eq('id', divisionId)
      .single();

    const { error } = await ctx.client
      .from('divisions')
      .delete()
      .eq('id', divisionId);

    if (error) throw error;

    // Clear season cache
    if (divisionData?.season_id) {
      ctx.seasonsCache.delete(divisionData.season_id);
    }

    return true;
  } catch (error) {
    throwDbError(error, 'Delete division');
    return false;
  }
}

/**
 * Put a team in a division.
 *
 * A team row belongs to one season and a division row belongs to one season,
 * so the write is season-scoped by construction — but the FK on
 * `teams.division_id` only says the division exists, not that it is the same
 * season's. Pointing 2024's team at 2026's division would pass the FK and
 * then vanish from both years' standings, because `get_standings_by_division`
 * joins on the season. So the pair is checked here before anything is written,
 * and the update is filtered on the team's own `season_id` as well as its id.
 *
 * `divisionId` may be null: that is "unassigned", which every season allows.
 */
export async function assignTeamToDivision(ctx, teamId, divisionId) {

  try {
    const { data: team, error: teamError } = await ctx.client
      .from('teams')
      .select('season_id')
      .eq('id', teamId)
      .single();

    if (teamError) throw teamError;

    if (divisionId != null) {
      const { data: division, error: divisionError } = await ctx.client
        .from('divisions')
        .select('season_id')
        .eq('id', divisionId)
        .single();

      if (divisionError) throw divisionError;

      if (division?.season_id !== team?.season_id) {
        throw new DbError('Division belongs to a different season than the team', {
          kind: DbErrorKind.FOREIGN_KEY,
          details: { teamId, divisionId, teamSeasonId: team?.season_id, divisionSeasonId: division?.season_id }
        });
      }
    }

    const { data, error } = await ctx.client
      .from('teams')
      .update({ division_id: divisionId })
      .eq('id', teamId)
      .eq('season_id', team.season_id)
      .select('season_id')
      .single();

    if (error) throw error;

    // Clear season cache
    if (data?.season_id) {
      ctx.seasonsCache.delete(data.season_id);
    }

    return true;
  } catch (error) {
    throwDbError(error, 'Assign team to division');
    return false;
  }
}

export async function getStandingsByDivision(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .rpc('get_standings_by_division', {
        season_id_param: seasonId
      });

    if (error) throw error;

    // Group the results by division
    const standingsByDivision = {};
    const unassigned = [];

    (data || []).forEach(team => {
      if (team.division_id) {
        if (!standingsByDivision[team.division_id]) {
          standingsByDivision[team.division_id] = {
            divisionId: team.division_id,
            divisionName: team.division_name,
            teams: []
          };
        }
        standingsByDivision[team.division_id].teams.push({
          teamId: team.team_id,
          id: team.team_id,
          name: team.team_name,
          owner: team.owner,
          divisionId: team.division_id,
          wins: team.wins,
          losses: team.losses,
          ties: team.ties,
          pointsFor: parseFloat(team.points_for || 0),
          pointsAgainst: parseFloat(team.points_against || 0),
          pointDifferential: parseFloat(team.point_differential || 0),
          winPercentage: parseFloat(team.win_percentage || 0),
          currentStreak: {
            type: team.streak_type || 'none',
            length: team.streak_length || 0
          },
          divisionRank: team.division_rank,
          isPlayoffSpot: team.playoff_position,
          // 2026+ only: the RPC returns NULL/false for earlier seasons, whose
          // rule was top three per division and had no seeds at all.
          playoffSeed: team.playoff_seed ?? null,
          isBye: Boolean(team.is_bye),
          isWildcard: Boolean(team.is_wildcard)
        });
      } else {
        unassigned.push({
          teamId: team.team_id,
          id: team.team_id,
          name: team.team_name,
          owner: team.owner,
          divisionId: null,
          wins: team.wins,
          losses: team.losses,
          ties: team.ties,
          pointsFor: parseFloat(team.points_for || 0),
          pointsAgainst: parseFloat(team.points_against || 0),
          pointDifferential: parseFloat(team.point_differential || 0),
          winPercentage: parseFloat(team.win_percentage || 0),
          currentStreak: {
            type: team.streak_type || 'none',
            length: team.streak_length || 0
          },
          // A team with no division cannot win one, but from 2026 a wildcard
          // is awarded league-wide, so it can still hold a seed.
          playoffSeed: team.playoff_seed ?? null,
          isBye: Boolean(team.is_bye),
          isWildcard: Boolean(team.is_wildcard),
          isPlayoffSpot: Boolean(team.playoff_position)
        });
      }
    });

    return {
      divisions: Object.values(standingsByDivision),
      unassigned
    };
  } catch (error) {
    throwDbError(error, 'Get standings by division');
    return { divisions: [], unassigned: [] };
  }
}
