/**
 * Playoff bracket: config, picks, scoring and the submission window.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatForDatabase, formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { getUserDisplayNames } from './users.js';
export async function getPlayoffBracketConfig(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('playoffs_2025_config')
      .select('*')
      .eq('season_id', seasonId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return data ? formatFromDatabase(data) : null;
  } catch (error) {
    throwDbError(error, 'Get playoff bracket config');
    return null;
  }
}

export async function upsertPlayoffBracketConfig(ctx, seasonId, configData) {

  try {
    const formattedData = formatForDatabase({
      seasonId,
      ...configData,
      updatedAt: new Date().toISOString()
    });

    const { data, error } = await ctx.client
      .from('playoffs_2025_config')
      .upsert(formattedData, { onConflict: 'season_id' })
      .select()
      .single();

    if (error) throw error;

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Upsert playoff bracket config');
  }
}

export async function getPlayoffGames(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('games')
      .select(`
        id,
        week,
        type,
        slot,
        team1_id,
        team2_id,
        team1_score,
        team2_score,
        is_completed,
        winner_team_id,
        team1:teams!games_team1_id_fkey(id, name, owner),
        team2:teams!games_team2_id_fkey(id, name, owner)
      `)

      .eq('season_id', seasonId)
      .or('type.like.playoff%,type.like.consolation%,type.eq.bye')
      .order('week')
      .order('type');

    if (error) throw error;

    return (data || []).map(game => formatFromDatabase(game));
  } catch (error) {
    throwDbError(error, 'Get playoff games');
    return [];
  }
}

export async function getUserPlayoffPicks(ctx, seasonId, userId = null) {

  try {
    // Get current user if not specified
    const { data: { session } } = await ctx.client.auth.getSession();
    const targetUserId = userId || session?.user?.id;

    if (!targetUserId) {
      return [];
    }

    const { data, error } = await ctx.client
      .from('playoffs_2025')
      .select(`
        *,
        predicted_winner:teams!playoffs_2025_predicted_winner_fkey(id, name, owner),
        actual_winner:teams!playoffs_2025_actual_winner_fkey(id, name, owner),
        game:games!playoffs_2025_game_id_fkey(id, week, type, winner_team_id)
      `)
      .eq('season_id', seasonId)
      .eq('user_id', targetUserId);

    if (error) throw error;

    return (data || []).map(pick => ({
      ...formatFromDatabase(pick),
      predictedWinner: pick.predicted_winner ? formatFromDatabase(pick.predicted_winner) : null,
      actualWinner: pick.actual_winner ? formatFromDatabase(pick.actual_winner) : null,
      game: pick.game ? formatFromDatabase(pick.game) : null
    }));
  } catch (error) {
    throwDbError(error, 'Get user playoff picks');
    return [];
  }
}

export async function submitPlayoffPicks(ctx, seasonId, picks) {

  if (!Array.isArray(picks) || picks.length === 0) {
    throw new Error('Picks must be a non-empty array');
  }

  try {
    const { data, error } = await ctx.client.rpc('submit_playoff_picks', {
      p_season_id: seasonId,
      p_picks: picks
    });

    if (error) throw error;

    return data;
  } catch (error) {
    throwDbError(error, 'Submit playoff picks');
  }
}

export async function getAllPlayoffPicks(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('playoffs_2025')
      .select(`
        *,
        predicted_winner:teams!playoffs_2025_predicted_winner_fkey(id, name, owner),
        actual_winner:teams!playoffs_2025_actual_winner_fkey(id, name, owner)
      `)
      .eq('season_id', seasonId);

    if (error) throw error;

    // Get display names for all users
    const userIds = [...new Set((data || []).map(p => p.user_id))];
    const displayNames = await getUserDisplayNames(ctx, userIds);

    return (data || []).map(pick => ({
      ...formatFromDatabase(pick),
      displayName: displayNames[pick.user_id] || `User ${pick.user_id.slice(0, 8)}`,
      predictedWinner: pick.predicted_winner ? formatFromDatabase(pick.predicted_winner) : null,
      actualWinner: pick.actual_winner ? formatFromDatabase(pick.actual_winner) : null
    }));
  } catch (error) {
    throwDbError(error, 'Get all playoff picks');
    return [];
  }
}

export async function getPlayoffStandings(ctx, seasonId) {

  try {
    const allPicks = await getAllPlayoffPicks(ctx, seasonId);

    if (!allPicks || allPicks.length === 0) {
      return [];
    }

    // Group picks by user and calculate scores
    const userStats = {};

    allPicks.forEach(pick => {
      const userId = pick.userId;
      if (!userStats[userId]) {
        userStats[userId] = {
          userId,
          displayName: pick.displayName,
          totalPicks: 0,
          correctPicks: 0,
          totalPoints: 0,
          picks: []
        };
      }

      userStats[userId].totalPicks++;
      userStats[userId].picks.push(pick);

      if (pick.isCorrect) {
        userStats[userId].correctPicks++;
        userStats[userId].totalPoints += pick.pointsEarned || 1;
      }
    });

    // Convert to array and sort
    const standingsArray = Object.values(userStats).map(stats => ({
      userId: stats.userId,
      displayName: stats.displayName,
      totalPicks: stats.totalPicks,
      correctPicks: stats.correctPicks,
      totalPoints: stats.totalPoints,
      accuracyPercentage: stats.totalPicks > 0
        ? (stats.correctPicks / stats.totalPicks) * 100
        : 0
    }));

    // Sort by points, then accuracy
    standingsArray.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return b.accuracyPercentage - a.accuracyPercentage;
    });

    // Assign ranks
    return standingsArray.map((standing, index) => ({
      ...standing,
      rank: index + 1
    }));
  } catch (error) {
    throwDbError(error, 'Get playoff standings');
    return [];
  }
}

export async function getPlayoffBracketStatus(ctx, seasonId) {

  try {
    const config = await getPlayoffBracketConfig(ctx, seasonId);
    const now = new Date();

    // The deadline belongs to playoff_config. With no row there is nothing
    // to fall back to that would still be right next season, so treat the
    // bracket as closed rather than inventing a date.
    const deadline = config?.submissionDeadline
      ? new Date(config.submissionDeadline)
      : null;

    const isBeforeDeadline = deadline !== null && now < deadline;
    const resultsReleased = config?.resultsReleased || false;

    // Calculate time remaining
    let timeRemaining = null;
    if (isBeforeDeadline) {
      const diff = deadline - now;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        timeRemaining = `${days}d ${hours}h remaining`;
      } else if (hours > 0) {
        timeRemaining = `${hours}h ${minutes}m remaining`;
      } else {
        timeRemaining = `${minutes}m remaining`;
      }
    }

    return {
      canSubmit: isBeforeDeadline,
      deadline: deadline ? deadline.toISOString() : null,
      deadlineFormatted: deadline
        ? deadline.toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        })
        : null,
      timeRemaining,
      resultsReleased,
      bracketData: config?.bracketData || null
    };
  } catch (error) {
    throwDbError(error, 'Get playoff bracket status');
    return {
      canSubmit: false,
      deadline: null,
      resultsReleased: false
    };
  }
}

export async function releasePlayoffResults(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('playoffs_2025_config')
      .upsert({
        season_id: seasonId,
        results_released: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'season_id' })
      .select()
      .single();

    if (error) throw error;

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Release playoff results');
  }
}

export async function updateConsolationGameSlots(ctx, seasonId, slotAssignments) {


  try {
    // Validate inputs
    if (!slotAssignments || typeof slotAssignments !== 'object') {
      throw new Error('slotAssignments must be an object');
    }

    // Update each game's slot
    const updates = [];
    for (const [slot, gameId] of Object.entries(slotAssignments)) {
      if (gameId) {
        const slotNumber = parseInt(slot, 10);
        if (slotNumber < 0 || slotNumber > 3) {
          throw new Error(`Slot must be between 0 and 3, got ${slotNumber}`);
        }

        updates.push(
          ctx.client
            .from('games')
            .update({ slot: slotNumber })
            .eq('id', gameId)
            .eq('season_id', seasonId)
            .eq('type', 'playoff_consolation_quarterfinals')
            .eq('week', 15)
        );
      }
    }

    // Execute all updates
    const results = await Promise.all(updates);

    // Check for errors
    for (const { error } of results) {
      if (error) throw error;
    }

    return { success: true, updatedCount: updates.length };
  } catch (error) {
    throwDbError(error, 'Update consolation game slots');
    throw error;
  }
}
