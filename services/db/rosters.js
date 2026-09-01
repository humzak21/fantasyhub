/**
 * Rosters: ESPN roster sync and the read paths over the `rosters` table.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';
import { getNFLTeamAbbreviation, mapESPNRosterSlot } from './espnMapping.js';
import { syncPlayerFromESPN } from './players.js';
import { getPlayerWeekStatsForWeek } from './playerWeekStats.js';

const log = createLogger('db:rosters');

export async function syncTeamRosterFromESPN(ctx, teamId, rosterData, currentWeek = 1) {

  try {
    // Get the team's user_id first
    const { data: teamData, error: teamError } = await ctx.client
      .from('teams')
      .select('user_id')
      .eq('id', teamId)
      .single();

    if (teamError) throw teamError;
    if (!teamData) throw new Error(`Team not found: ${teamId}`);


    // Since the database function doesn't handle user_id properly with service role,
    // let's do a manual sync instead
    await manualSyncTeamRoster(ctx, teamId, teamData.user_id, rosterData, currentWeek);

    return rosterData.length;
  } catch (error) {
    throwDbError(error, 'Sync team roster from ESPN');
  }
}

export async function manualSyncTeamRoster(ctx, teamId, userId, rosterData, currentWeek = 1) {

  try {
    // First, clear existing roster for this team
    const { error: deleteError } = await ctx.client
      .from('rosters')
      .delete()
      .eq('team_id', teamId);

    if (deleteError) throw deleteError;

    // Build roster data for bulk insert
    const rosterInserts = [];

    for (const player of rosterData) {
      // Sync player to database first with all stats data
      const playerId = await syncPlayerFromESPN(ctx, 
        player.playerId,
        player.playerName,
        player.position,
        getNFLTeamAbbreviation(player.proTeam),
        {
          seasonProjectedPoints: player.seasonProjectedPoints,
          seasonActualPoints: player.seasonActualPoints,
          projectedPoints: player.projectedPoints,
          actualPoints: player.actualPoints,
          gamesPlayed: player.gamesPlayed,
          injuryStatus: player.injuryStatus,
          percentOwned: player.percentOwned,
          percentStarted: player.percentStarted,
          proTeamName: player.proTeamName,
          proTeam: player.proTeam
        }
      );

      rosterInserts.push({
        user_id: userId,
        team_id: teamId,
        player_id: playerId,
        roster_slot: mapESPNRosterSlot(player.rosterSlot),
        acquisition_type: 'free_agent',
        acquisition_week: currentWeek,
        cost: 0
      });
    }


    // Try disabling trigger temporarily for service role

    const { error: disableError } = await ctx.client.rpc('disable_roster_trigger');

    if (disableError) {

      const { data, error } = await ctx.client
        .from('rosters')
        .insert(rosterInserts)
        .select();

      if (error) {
        return await insertRosterOneByOne(ctx, rosterInserts);
      }

      return data || rosterInserts;
    } else {
      // Trigger disabled, now insert
      const { data, error } = await ctx.client
        .from('rosters')
        .insert(rosterInserts)
        .select();

      // Re-enable trigger
      await ctx.client.rpc('enable_roster_trigger');

      if (error) {
        return await insertRosterOneByOne(ctx, rosterInserts);
      }

      return data || rosterInserts;
    }
  } catch (error) {
    throwDbError(error, 'Manual sync team roster');
  }
}

export async function fallbackRosterInsert(ctx, rosterEntries) {

  try {
    // Build values for bulk insert
    const insertQuery = `
      INSERT INTO rosters (user_id, team_id, player_id, roster_slot, acquisition_type, acquisition_week, cost)
      VALUES ${rosterEntries.map((_, i) =>
      `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
    ).join(', ')}
      RETURNING id;
    `;

    const params = rosterEntries.flatMap(entry => [
      entry.user_id,
      entry.team_id,
      entry.player_id,
      entry.roster_slot,
      entry.acquisition_type,
      entry.acquisition_week,
      entry.cost
    ]);

    // Execute raw SQL that bypasses triggers
    const { data, error } = await ctx.client
      .rpc('execute_raw_sql', {
        query: insertQuery,
        parameters: params
      });

    if (error) {
      // Last resort: Insert one by one with minimal error handling
      return await insertRosterOneByOne(ctx, rosterEntries);
    }

    return data || rosterEntries;
  } catch (error) {
    return await insertRosterOneByOne(ctx, rosterEntries);
  }
}

/**
 * Last-resort roster insert: one row at a time, skipping the ones that fail.
 * Partial success is the point — a single rejected player should not cost the
 * team its other 15 — but the skips used to vanish into empty blocks, so a
 * half-written roster looked exactly like a complete one. They are logged now,
 * and the caller can compare `inserted.length` against what it passed in.
 */
export async function insertRosterOneByOne(ctx, rosterEntries) {
  const inserted = [];

  for (let i = 0; i < rosterEntries.length; i++) {
    const entry = rosterEntries[i];

    try {
      const { data, error } = await ctx.client
        .from('rosters')
        .insert(entry)
        .select()
        .single();

      if (error) {
        log.warn(`roster row ${i} rejected (player ${entry.player_id}):`, error.message);
      } else if (data) {
        inserted.push(data);
      } else {
        log.warn(`roster row ${i} (player ${entry.player_id}) inserted but returned no row`);
      }
    } catch (exception) {
      log.warn(`roster row ${i} (player ${entry.player_id}) threw:`, exception?.message ?? exception);
    }
  }

  if (inserted.length !== rosterEntries.length) {
    log.warn(`inserted ${inserted.length} of ${rosterEntries.length} roster rows`);
  }

  return inserted;
}

// Roster management methods
export async function getTeamRoster(ctx, teamId) {

  try {
    const { data, error } = await ctx.client
      .from('rosters')
      .select(`
        id,
        roster_slot,
        acquisition_type,
        acquisition_week,
        added_date,
        cost,
        is_keeper,
        player:players (
          id,
          espn_player_id,
          name,
          position,
          team_abbreviation,
          jersey_number,
          is_active
        )
      `)
      .eq('team_id', teamId)
      // Ordering by a column of an embedded resource needs `referencedTable`.
      // Written as `.order('player.position')` this produced the literal order
      // key `player.position`, which PostgREST rejects with "failed to parse
      // order (...)" — so every call 400'd rather than returning a roster.
      .order('roster_slot')
      .order('position', { referencedTable: 'player' })
      .order('name', { referencedTable: 'player' });

    if (error) throw error;

    return formatFromDatabase(data || []);
  } catch (error) {
    throwDbError(error, 'Get team roster');
  }
}

/**
 * Every team's roster for a season, `{ [teamId]: { team, roster } }`.
 *
 * The player projection, NFL team and injury status ride along because the
 * Teams tab renders all three. `projected_points` is the rolling figure the
 * roster sync refreshes — a present-tense view with no week navigation, which
 * is why the tab labels it "proj" rather than presenting it as a result — and
 * `injury_status` lives on `players`, not on `rosters`, which is why the
 * injury dot on that card never fired: the row it read had no such column.
 */
export async function getAllRosters(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('rosters')
      .select(`
        id,
        team_id,
        roster_slot,
        acquisition_type,
        acquisition_week,
        added_date,
        cost,
        is_keeper,
        team:teams!inner (
          id,
          name,
          owner,
          season_id
        ),
        player:players (
          id,
          espn_player_id,
          name,
          position,
          team_abbreviation,
          jersey_number,
          is_active,
          pro_team_id,
          projected_points,
          injury_status
        )
      `)
      .eq('team.season_id', seasonId)
      .order('roster_slot')

    if (error) throw error;

    // Group by team and sort
    const rostersByTeam = {};
    (data || []).forEach(rosterEntry => {
      const teamId = rosterEntry.team_id;
      if (!rostersByTeam[teamId]) {
        rostersByTeam[teamId] = {
          team: rosterEntry.team,
          roster: []
        };
      }
      rostersByTeam[teamId].roster.push(formatFromDatabase(rosterEntry));
    });

    // Sort teams by name and roster entries by position, then name
    Object.values(rostersByTeam).forEach(teamRoster => {
      teamRoster.roster.sort((a, b) => {
        // First sort by roster slot (starters before bench)
        const slotOrder = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST', 'BE', 'IR'];
        const aSlotIndex = slotOrder.indexOf(a.rosterSlot) !== -1 ? slotOrder.indexOf(a.rosterSlot) : 999;
        const bSlotIndex = slotOrder.indexOf(b.rosterSlot) !== -1 ? slotOrder.indexOf(b.rosterSlot) : 999;

        if (aSlotIndex !== bSlotIndex) {
          return aSlotIndex - bSlotIndex;
        }

        // Then sort by player name
        const aName = a.player?.name || '';
        const bName = b.player?.name || '';
        return aName.localeCompare(bName);
      });
    });

    return rostersByTeam;
  } catch (error) {
    throwDbError(error, 'Get all rosters');
  }
}

export async function getRosterStats(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('rosters')
      .select(`
        team_id,
        roster_slot,
        team:teams!inner (
          id,
          name,
          season_id
        ),
        player:players (
          position,
          team_abbreviation
        )
      `)
      .eq('team.season_id', seasonId);

    if (error) throw error;

    // Calculate roster composition stats
    const stats = {};
    (data || []).forEach(entry => {
      const teamId = entry.team_id;
      if (!stats[teamId]) {
        stats[teamId] = {
          teamName: entry.team.name,
          totalPlayers: 0,
          positions: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, 'D/ST': 0 },
          starters: 0,
          bench: 0,
          ir: 0
        };
      }

      stats[teamId].totalPlayers++;

      if (entry.player?.position) {
        stats[teamId].positions[entry.player.position] =
          (stats[teamId].positions[entry.player.position] || 0) + 1;
      }

      if (['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST'].includes(entry.roster_slot)) {
        stats[teamId].starters++;
      } else if (entry.roster_slot === 'BE') {
        stats[teamId].bench++;
      } else if (entry.roster_slot === 'IR') {
        stats[teamId].ir++;
      }
    });

    return stats;
  } catch (error) {
    throwDbError(error, 'Get roster stats');
  }
}

/**
 * The current starting lineups, with the best points available for a week.
 *
 * This exists because the pick'ems research panel asks a *present-tense*
 * question — "who is starting this week" — and the table it used to read,
 * `player_week_stats`, cannot answer one. That table is a historical fact
 * table written once a week by the cron, so between two syncs it describes a
 * roster that has since taken waivers, made trades and changed its lineup.
 * Measured against the live league on 2026-08-31, 122 of the 125 starters it
 * reported were no longer the starters: its newest rows were from 2026-08-18,
 * three weeks before the season and before the draft, while `rosters` had been
 * rewritten the same day.
 *
 * So membership and lineup slot come from `rosters`, which is deleted and
 * reinserted per team on every sync and is therefore a true snapshot of now.
 * Points are layered on in order of how much they know:
 *
 *   1. `player_week_stats.actual_points` for this week, once the games are
 *      played and the sync has written them.
 *   2. `player_week_stats.projected_points` for this week, which is
 *      week-specific and so beats a rolling figure.
 *   3. `players.projected_points`, refreshed by the same roster sync, which is
 *      what a player added since the last week-stats write has instead of
 *      nothing.
 *
 * A player with no points at all still appears, with a dash. Showing a real
 * starter without a projection is honest; hiding them because a stats row is
 * missing is how the stale view looked complete while being wrong.
 *
 * Falls back to `player_week_stats` wholesale when a season has no roster rows
 * at all, so a season that predates roster syncing renders what it always did
 * rather than rendering empty.
 *
 * @returns {Promise<object[]>} rows shaped like `getPlayerWeekStatsForWeek`'s
 */
export async function getCurrentLineupsForWeek(ctx, seasonId, week) {
  try {
    const [{ data: rosterRows, error: rosterError }, weekStats] = await Promise.all([
      ctx.client
        .from('rosters')
        .select(`
          id,
          team_id,
          roster_slot,
          player:players (
            id,
            espn_player_id,
            name,
            position,
            team_abbreviation,
            pro_team_id,
            projected_points,
            injury_status
          ),
          team:teams!inner ( id, season_id )
        `)
        .eq('team.season_id', seasonId),
      getPlayerWeekStatsForWeek(ctx, seasonId, week)
    ]);

    if (rosterError) throw rosterError;

    // No roster snapshot for this season: the stored week is all there is.
    if (!rosterRows || rosterRows.length === 0) return weekStats;

    const statsByPlayerId = new Map(
      (weekStats || []).map((row) => [row.playerId, row])
    );

    return rosterRows.map((row) => {
      const stat = statsByPlayerId.get(row.player?.id);
      const slot = row.roster_slot;

      return {
        id: row.id,
        seasonId,
        week,
        teamId: row.team_id,
        playerId: row.player?.id ?? null,
        espnPlayerId: row.player?.espn_player_id ?? null,
        proTeamId: row.player?.pro_team_id ?? null,
        rosterSlot: slot,
        // `rosters` has no `started` column; the slot is the fact. Bench and IR
        // are the only slots that do not score, matching `isStarterSlot`.
        started: slot !== 'BE' && slot !== 'IR',
        position: row.player?.position ?? null,
        actualPoints: stat?.actualPoints ?? null,
        projectedPoints: stat?.projectedPoints ?? row.player?.projected_points ?? null,
        injuryStatus: stat?.injuryStatus ?? row.player?.injury_status ?? null,
        player: row.player
          ? {
              id: row.player.id,
              name: row.player.name,
              position: row.player.position,
              teamAbbreviation: row.player.team_abbreviation,
              proTeamId: row.player.pro_team_id
            }
          : null
      };
    });
  } catch (error) {
    throwDbError(error, 'Get current lineups for week');
  }
}
