/**
 * Pick'ems: weeks, submissions, scoring and standings.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import * as models from '../../types/index.js';
import { formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';
import { getSeason } from './seasons.js';
import { getUserDisplayNames } from './users.js';

const log = createLogger('db:pickems');
// Pick'em week management
export async function createPickEmWeek(ctx, seasonId, weekNumber, customSchedule = null) {

  try {
    const schedule = customSchedule || models.calculatePickEmSchedule(weekNumber);

    const { data, error } = await ctx.client.rpc('create_pick_em_week', {
      p_season_id: seasonId,
      p_week_number: weekNumber,
      p_submission_opens_at: schedule.submissionOpensAt,
      p_submission_closes_at: schedule.submissionClosesAt,
      p_results_reveal_at: schedule.resultsRevealAt
    });

    if (error) throw error;

    return data;
  } catch (error) {
    throwDbError(error, 'Create pick em week');
  }
}

export async function getPickEmWeek(ctx, seasonId, weekNumber) {

  try {
    const { data, error } = await ctx.client
      .from('pick_em_weeks')
      .select('*')
      .eq('season_id', seasonId)
      .eq('week_number', weekNumber)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return data ? formatFromDatabase(data) : null;
  } catch (error) {
    throwDbError(error, 'Get pick em week');
  }
}

export async function getAllPickEmWeeks(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('pick_em_weeks')
      .select('*')
      .eq('season_id', seasonId)
      .order('week_number');

    if (error) throw error;

    return (data || []).map(formatFromDatabase);
  } catch (error) {
    throwDbError(error, 'Get all pick em weeks');
  }
}

export async function getPickEmStatus(ctx, seasonId) {

  try {
    // Get all pick'em weeks for the season
    const { data: pickEmWeeks, error: weeksError } = await ctx.client
      .from('pick_em_weeks')
      .select('*')
      .eq('season_id', seasonId)
      .order('week_number');

    if (weeksError) throw weeksError;

    if (!pickEmWeeks || pickEmWeeks.length === 0) {
      return [];
    }

    const now = new Date();
    const statusResults = [];

    for (const week of pickEmWeeks) {
      const submissionOpensAt = new Date(week.submission_opens_at);
      const submissionClosesAt = new Date(week.submission_closes_at);
      const resultsRevealAt = new Date(week.results_reveal_at);

      // Check if all games for this week are completed
      const { data: games, error: gamesError } = await ctx.client
        .from('games')
        .select('is_completed')
        .eq('season_id', seasonId)
        .eq('week', week.week_number);

      if (gamesError) throw gamesError;

      const allGamesCompleted = games && games.length > 0 && games.every(g => g.is_completed);

      // Determine status
      let status = 'upcoming';
      let canSubmit = false;
      let resultsAvailable = false;
      let timeInfo = '';

      if (now < submissionOpensAt) {
        status = 'upcoming';
        timeInfo = `Opens ${submissionOpensAt.toLocaleDateString()}`;
      } else if (now >= submissionOpensAt && now < submissionClosesAt) {
        status = 'open';
        canSubmit = true;
        timeInfo = `Closes ${submissionClosesAt.toLocaleDateString()}`;
      } else if (now >= submissionClosesAt) {
        status = 'closed';

        // Results are available if all games are completed OR we're past reveal time
        if (allGamesCompleted || now >= resultsRevealAt) {
          resultsAvailable = true;
          status = 'completed';
          timeInfo = 'Results Available';
        } else {
          timeInfo = `Results reveal ${resultsRevealAt.toLocaleDateString()}`;
        }
      }

      statusResults.push({
        weekNumber: week.week_number,
        pickEmWeekId: week.id,
        status,
        canSubmit,
        resultsAvailable,
        timeInfo,
        allGamesCompleted,
        submissionOpensAt: week.submission_opens_at,
        submissionClosesAt: week.submission_closes_at,
        resultsRevealAt: week.results_reveal_at
      });
    }

    return statusResults;
  } catch (error) {
    throwDbError(error, 'Get pick em status');
    return [];
  }
}

// Pick'em submissions
export async function submitPickEmPicks(ctx, pickEmWeekId, picks) {

  if (!Array.isArray(picks) || picks.length === 0) {
    throw new Error('Picks must be a non-empty array');
  }

  // Validate all picks
  for (const pick of picks) {
    if (!models.validatePickEmSubmission({
      pickEmWeekId,
      gameId: pick.gameId,
      predictedWinnerTeamId: pick.predictedWinnerTeamId
    })) {
      throw new Error('Invalid pick submission data');
    }
  }

  try {
    const { data, error } = await ctx.client.rpc('submit_pick_em_picks', {
      p_pick_em_week_id: pickEmWeekId,
      p_picks: picks
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    throwDbError(error, 'Submit pick em picks');
  }
}

export async function getUserPicksForWeek(ctx, pickEmWeekId, userId = null) {

  try {

    // Get current user session
    const { data: { session } } = await ctx.client.auth.getSession();
    const currentUserId = session?.user?.id;

    // Use current user ID if none provided
    const targetUserId = userId || currentUserId;

    const { data, error } = await ctx.client.rpc('get_user_picks_for_week', {
      p_pick_em_week_id: pickEmWeekId,
      p_user_id: targetUserId
    });

    if (error) throw error;


    // Transform snake_case to camelCase for frontend
    const transformedData = (data || []).map(pick => ({
      submissionId: pick.submission_id,
      gameId: pick.game_id,
      weekNumber: pick.week_number,
      team1Name: pick.team1_name,
      team2Name: pick.team2_name,
      predictedWinnerTeamId: pick.predicted_winner_team_id,
      predictedWinnerName: pick.predicted_winner_name,
      confidenceLevel: pick.confidence_level,
      isCorrect: pick.is_correct,
      pointsEarned: pick.points_earned,
      actualWinnerTeamId: pick.actual_winner_team_id,
      actualWinnerName: pick.actual_winner_name,
      submittedAt: pick.submitted_at
    }));


    return transformedData;
  } catch (error) {
    throwDbError(error, 'Get user picks for week');
    return [];
  }
}

export async function getAllPicksForWeek(ctx, pickEmWeekId) {

  try {
    // Get all submissions with game and team data
    const { data, error } = await ctx.client
      .from('pick_em_submissions')
      .select(`
        *,
        pick_em_weeks!inner(is_completed),
        games(
          week,
          is_completed,
          winner_team_id,
          team1_score,
          team2_score,
          team1:teams!games_team1_id_fkey(id, name, owner),
          team2:teams!games_team2_id_fkey(id, name, owner)
        ),
        predicted_team:teams!pick_em_submissions_predicted_winner_team_id_fkey(name)
      `)
      .eq('pick_em_week_id', pickEmWeekId);

    if (error) throw error;

    // Get unique user IDs
    const userIds = [...new Set((data || []).map(s => s.user_id))];
    const displayNames = await getUserDisplayNames(ctx, userIds);

    // Calculate results on the fly by comparing picks to actual game results
    const submissions = (data || []).map(submission => {
      const game = submission.games;
      const isCorrect = game?.is_completed && game.winner_team_id === submission.predicted_winner_team_id;
      const pointsEarned = isCorrect ? 1 : 0; // Simple scoring: 1 point per correct pick
      const formattedSubmission = formatFromDatabase(submission);

      return {
        ...formattedSubmission,
        displayName: displayNames[submission.user_id] || `User ${submission.user_id?.slice(0, 8)}`,
        isCorrect,
        pointsEarned,
        pickedTeamId: submission.predicted_winner_team_id,
        pickedTeamName: formattedSubmission.predictedTeam?.name,
        predictedWinnerName: formattedSubmission.predictedTeam?.name,
        actualWinnerTeamId: game?.winner_team_id,
        actualWinnerName: game?.winner_team_id === game?.team1?.id ? game?.team1?.name :
          game?.winner_team_id === game?.team2?.id ? game?.team2?.name : null,
        team1Id: game?.team1?.id,
        team2Id: game?.team2?.id,
        team1Name: game?.team1?.name,
        team2Name: game?.team2?.name,
        team1Score: game?.team1_score,
        team2Score: game?.team2_score,
        gameCompleted: game?.is_completed
      };
    });

    return submissions;
  } catch (error) {
    throwDbError(error, 'Get all picks for week');
  }
}

export async function getAdminSubmissionsForWeek(ctx, pickEmWeekId) {

  try {
    const { data, error } = await ctx.client
      .from('pick_em_submissions')
      .select(`
        *,
        games(
          week,
          team1:teams!games_team1_id_fkey(id, name, owner),
          team2:teams!games_team2_id_fkey(id, name, owner)
        ),
        predicted_team:teams!pick_em_submissions_predicted_winner_team_id_fkey(name)
      `)
      .eq('pick_em_week_id', pickEmWeekId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const submissions = (data || []).map(formatFromDatabase);

    // Get user details for each unique user ID
    const userIds = [...new Set(submissions.map(s => s.userId))];
    const userDetails = {};

    // Try to get user details using the RPC function first
    try {
      const { data: usersData, error: usersError } = await ctx.client.rpc('get_users_for_admin', {
        user_ids: userIds
      });

      if (!usersError && usersData && Array.isArray(usersData)) {
        usersData.forEach(user => {
          if (user && user.id) {
            userDetails[user.id] = {
              email: user.email || `user-${user.id.slice(0, 8)}@unknown.com`,
              displayName: user.display_name || user.email || `User ${user.id.slice(0, 8)}`
            };
          }
        });
      } else {
        log.warn('RPC function get_users_for_admin failed or returned no data:', usersError);
      }
    } catch (rpcError) {
      log.warn('RPC function get_users_for_admin not available. Please run the database migration in /database/admin_user_details_migration.sql');
      log.warn('Error details:', rpcError);
    }

    // Fallback: get current user details for comparison
    try {
      const { data: currentUserData } = await ctx.client.auth.getUser();
      if (currentUserData?.user?.id) {
        userDetails[currentUserData.user.id] = {
          email: currentUserData.user.email,
          displayName: currentUserData.user.user_metadata?.name || currentUserData.user.email
        };
      }
    } catch (authError) {
      log.warn('Could not get current user details:', authError);
    }

    // Apply user details to submissions with fallbacks
    return submissions.map(submission => ({
      ...submission,
      userDetails: userDetails[submission.userId] || {
        email: `user-${submission.userId?.slice(0, 8) || 'unknown'}@needs-migration.com`,
        displayName: `User ${submission.userId?.slice(0, 8) || 'Unknown'} (Run DB Migration)`
      }
    }));
  } catch (error) {
    throwDbError(error, 'Get admin submissions for week');
    return [];
  }
}

// Pick'em results and scoring
export async function calculatePickEmResults(ctx, pickEmWeekId) {

  try {
    // Since we calculate results on the fly, we just need to mark the week as completed
    // and ensure all games for the week are completed

    // First, verify all games are completed
    const { data: pickEmWeek, error: weekError } = await ctx.client
      .from('pick_em_weeks')
      .select('week_number, season_id')
      .eq('id', pickEmWeekId)
      .single();

    if (weekError) throw weekError;

    const { data: games, error: gamesError } = await ctx.client
      .from('games')
      .select('is_completed')
      .eq('season_id', pickEmWeek.season_id)
      .eq('week', pickEmWeek.week_number);

    if (gamesError) throw gamesError;

    const allGamesCompleted = games && games.length > 0 && games.every(g => g.is_completed);

    if (!allGamesCompleted) {
      throw new Error('Cannot calculate results: Not all games for this week are completed');
    }

    // Mark the week as completed
    const { error: updateError } = await ctx.client
      .from('pick_em_weeks')
      .update({
        is_completed: true,
        is_closed: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', pickEmWeekId);

    if (updateError) throw updateError;

    // Return success - results are calculated on the fly when requested
    return { success: true, message: 'Results calculated successfully' };
  } catch (error) {
    throwDbError(error, 'Calculate pick em results');
  }
}

export async function getWeeklyPickEmScores(ctx, pickEmWeekId) {

  try {
    // Get all picks for the week with calculated results
    const allPicks = await getAllPicksForWeek(ctx, pickEmWeekId);

    if (!allPicks || allPicks.length === 0) {
      return [];
    }

    // Group picks by user
    const userScores = {};
    allPicks.forEach(pick => {
      const userId = pick.userId;
      if (!userScores[userId]) {
        userScores[userId] = {
          userId,
          totalPicks: 0,
          correctPicks: 0,
          totalPoints: 0,
          pickEmWeekId
        };
      }

      userScores[userId].totalPicks++;
      if (pick.isCorrect) {
        userScores[userId].correctPicks++;
        userScores[userId].totalPoints += pick.pointsEarned || 1;
      }
    });

    // Get display names for all users
    const userIds = Object.keys(userScores);
    const displayNames = await getUserDisplayNames(ctx, userIds);

    // Convert to array and calculate accuracy and rank
    const scoresArray = Object.values(userScores).map(score => ({
      ...score,
      displayName: displayNames[score.userId] || `User ${score.userId.slice(0, 8)}`,
      accuracyPercentage: score.totalPicks > 0 ? (score.correctPicks / score.totalPicks) * 100 : 0
    }));

    // Sort by total points (desc), then by correct picks (desc), then by accuracy (desc)
    scoresArray.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.correctPicks !== a.correctPicks) return b.correctPicks - a.correctPicks;
      return b.accuracyPercentage - a.accuracyPercentage;
    });

    // Assign ranks
    return scoresArray.map((score, index) => ({
      ...score,
      weeklyRank: index + 1
    }));
  } catch (error) {
    throwDbError(error, 'Get weekly pick em scores');
    return [];
  }
}

export async function getSeasonPickEmStandings(ctx, seasonId) {

  try {
    // Get all pick'em weeks for the season
    const { data: pickEmWeeks, error: weeksError } = await ctx.client
      .from('pick_em_weeks')
      .select('id, week_number')
      .eq('season_id', seasonId)
      .order('week_number');

    if (weeksError) throw weeksError;

    if (!pickEmWeeks || pickEmWeeks.length === 0) {
      return [];
    }

    // Get all picks for all weeks
    const userStats = {};

    for (const week of pickEmWeeks) {
      const allPicks = await getAllPicksForWeek(ctx, week.id);

      allPicks.forEach(pick => {
        const userId = pick.userId;
        if (!userStats[userId]) {
          userStats[userId] = {
            userId,
            totalPicks: 0,
            totalCorrectPicks: 0,
            totalPoints: 0,
            totalWeeksParticipated: new Set(),
            perfectWeeks: 0,
            weeklyResults: []
          };
        }

        userStats[userId].totalPicks++;
        if (pick.isCorrect) {
          userStats[userId].totalCorrectPicks++;
          userStats[userId].totalPoints += pick.pointsEarned || 1;
        }
        userStats[userId].totalWeeksParticipated.add(week.week_number);
      });

      // Check for perfect weeks
      const weekScores = await getWeeklyPickEmScores(ctx, week.id);
      weekScores.forEach(score => {
        if (score.accuracyPercentage === 100 && userStats[score.userId]) {
          userStats[score.userId].perfectWeeks++;
        }
      });
    }

    // Get display names for all users
    const userIds = Object.keys(userStats);
    const displayNames = await getUserDisplayNames(ctx, userIds);

    // Convert to array and calculate overall stats
    const standingsArray = Object.values(userStats).map(stats => ({
      userId: stats.userId,
      displayName: displayNames[stats.userId] || `User ${stats.userId.slice(0, 8)}`,
      totalPicks: stats.totalPicks,
      totalCorrectPicks: stats.totalCorrectPicks,
      totalPoints: stats.totalPoints,
      totalWeeksParticipated: stats.totalWeeksParticipated.size,
      perfectWeeks: stats.perfectWeeks,
      overallAccuracyPercentage: stats.totalPicks > 0 ? (stats.totalCorrectPicks / stats.totalPicks) * 100 : 0
    }));

    // Sort by total points, then by accuracy
    standingsArray.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return b.overallAccuracyPercentage - a.overallAccuracyPercentage;
    });

    // Assign season ranks
    return standingsArray.map((standing, index) => ({
      ...standing,
      seasonRank: index + 1
    }));
  } catch (error) {
    throwDbError(error, 'Get season pick em standings');
    return [];
  }
}

// Get all picks from all weeks in a season
export async function getAllSeasonPicks(ctx, seasonId) {

  try {
    // Get all pick'em weeks for the season
    const { data: pickEmWeeks, error: weeksError } = await ctx.client
      .from('pick_em_weeks')
      .select('id, week_number')
      .eq('season_id', seasonId)
      .order('week_number');

    if (weeksError) throw weeksError;

    if (!pickEmWeeks || pickEmWeeks.length === 0) {
      return [];
    }

    // Get all picks for all weeks
    const allSeasonPicks = [];

    for (const week of pickEmWeeks) {
      const weekPicks = await getAllPicksForWeek(ctx, week.id);
      allSeasonPicks.push(...weekPicks);
    }

    return allSeasonPicks;
  } catch (error) {
    throwDbError(error, 'Get all season picks');
    return [];
  }
}

// Pick'em analytics
export async function getPickEmWeeklyBreakdown(ctx, seasonId) {

  try {
    // Get all pick'em weeks for the season
    const { data: pickEmWeeks, error } = await ctx.client
      .from('pick_em_weeks')
      .select('id, week_number')
      .eq('season_id', seasonId)
      .order('week_number');

    if (error) throw error;

    // Get scores for each week and group by week number
    const weeklyBreakdown = {};

    for (const week of pickEmWeeks || []) {
      const scores = await getWeeklyPickEmScores(ctx, week.id);
      weeklyBreakdown[week.week_number] = scores;
    }

    return weeklyBreakdown;
  } catch (error) {
    throwDbError(error, 'Get pick em weekly breakdown');
    return {};
  }
}

export async function getPickEmGameData(ctx, seasonId, weekNumber) {

  try {
    // Get games for the week to use for pick'ems
    const { data, error } = await ctx.client
      .from('games')
      .select(`
        id,
        week,
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
      .eq('week', weekNumber)
      .order('id');

    if (error) throw error;

    return (data || []).map(game => ({
      ...formatFromDatabase(game),
      canPredict: !game.is_completed // Can only predict on incomplete games
    }));
  } catch (error) {
    throwDbError(error, 'Get pick em game data');
  }
}

// Administrative functions
export async function createPickEmWeeksForSeason(ctx, seasonId, startWeek = 1, endWeek = null) {

  try {
    const season = await getSeason(ctx, seasonId);
    if (!season) throw new Error('Season not found');

    const finalWeek = endWeek || season.regularSeasonWeeks;
    const createdWeeks = [];

    for (let week = startWeek; week <= finalWeek; week++) {
      try {
        const pickEmWeekId = await createPickEmWeek(ctx, seasonId, week);
        createdWeeks.push({ week, pickEmWeekId });
      } catch (error) {
        // Skipping is intentional — re-running this for a season that already
        // has some weeks should fill the gaps, not abort on the first
        // duplicate. The returned list says which weeks were actually created.
        log.warn(`week ${week} not created:`, error?.message ?? error);
      }
    }

    return createdWeeks;
  } catch (error) {
    throwDbError(error, 'Create pick em weeks for season');
  }
}

export async function updatePickEmWeekStatus(ctx, pickEmWeekId, status) {

  const statusUpdates = {};

  switch (status) {
    case models.PICK_EM_STATUS.OPEN:
      statusUpdates.is_active = true;
      statusUpdates.is_closed = false;
      break;
    case models.PICK_EM_STATUS.CLOSED:
      statusUpdates.is_active = false;
      statusUpdates.is_closed = true;
      break;
    case models.PICK_EM_STATUS.COMPLETED:
      statusUpdates.is_active = false;
      statusUpdates.is_closed = true;
      statusUpdates.is_completed = true;
      break;
    default:
      statusUpdates.is_active = false;
      statusUpdates.is_closed = false;
      statusUpdates.is_completed = false;
  }

  try {
    const { data, error } = await ctx.client
      .from('pick_em_weeks')
      .update(statusUpdates)
      .eq('id', pickEmWeekId)
      .select()
      .single();

    if (error) throw error;

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Update pick em week status');
  }
}
