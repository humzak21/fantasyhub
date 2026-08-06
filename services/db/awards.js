/**
 * Awards: the ballot, the votes and the release gate.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatForDatabase, formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';

const log = createLogger('db:awards');
// Awards Management
export async function getAwards(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('awards_2025')
      .select('*')
      .eq('season_id', seasonId)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return formatFromDatabase(data || []);
  } catch (error) {
    throwDbError(error, 'Get awards');
  }
}

export async function createAward(ctx, seasonId, awardData) {

  try {
    const formattedData = formatForDatabase({
      seasonId,
      ...awardData
    });

    const { data, error } = await ctx.client
      .from('awards_2025')
      .insert(formattedData)
      .select()
      .single();

    if (error) throw error;

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Create award');
  }
}

export async function updateAward(ctx, awardId, updates) {

  try {
    const formattedUpdates = formatForDatabase(updates);

    log.debug('Updating award with data:', formattedUpdates);

    // First, do the update without trying to select the result
    const { error: updateError } = await ctx.client
      .from('awards_2025')
      .update(formattedUpdates)
      .eq('id', awardId);

    if (updateError) {
      log.error('Supabase update error:', updateError);
      throw updateError;
    }

    // Then fetch the updated record separately
    const { data, error: selectError } = await ctx.client
      .from('awards_2025')
      .select('*')
      .eq('id', awardId)
      .single();

    if (selectError) {
      log.error('Supabase select error:', selectError);
      throw selectError;
    }

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Update award');
  }
}

export async function deleteAward(ctx, awardId) {

  try {
    const { error } = await ctx.client
      .from('awards_2025')
      .delete()
      .eq('id', awardId);

    if (error) throw error;
    return true;
  } catch (error) {
    throwDbError(error, 'Delete award');
  }
}

export async function getUserVotes(ctx, seasonId, userId) {

  try {
    // Join with awards to filter by season
    const { data, error } = await ctx.client
      .from('award_votes')
      .select('*, awards_2025!inner(season_id)')
      .eq('user_id', userId)
      .eq('awards_2025.season_id', seasonId);

    if (error) throw error;

    return formatFromDatabase(data || []);
  } catch (error) {
    throwDbError(error, 'Get user votes');
  }
}

export async function submitAwardVotes(ctx, seasonId, votes) {

  try {
    const userId = (await ctx.client.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('User not authenticated');

    const formattedVotes = votes.map(vote => ({
      award_id: vote.awardId,
      user_id: userId,
      vote_value: vote.voteValue,
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await ctx.client
      .from('award_votes')
      .upsert(formattedVotes, {
        onConflict: 'award_id,user_id'
      })
      .select();

    if (error) throw error;

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Submit award votes');
  }
}

export async function getAwardsUnlockStatus(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .rpc('check_awards_unlock_status', { season_id_param: seasonId });

    if (error) throw error;

    // Format the result from snake_case to camelCase
    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Get awards unlock status');
  }
}

export async function releaseAwardResults(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('awards_metadata')
      .upsert({
        season_id: seasonId,
        results_released: true,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    throwDbError(error, 'Release award results');
  }
}

export async function toggleVotingAccess(ctx, seasonId, votingOpenToAll) {

  try {
    const { data, error } = await ctx.client
      .from('awards_metadata')
      .upsert({
        season_id: seasonId,
        voting_open_to_all: votingOpenToAll,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    throwDbError(error, 'Toggle voting access');
  }
}

export async function getAwardResults(ctx, seasonId) {

  try {
    // Get all votes for the season
    const { data, error } = await ctx.client
      .from('award_votes')
      .select(`
        vote_value,
        award_id,
        awards_2025!inner(season_id)
      `)
      .eq('awards_2025.season_id', seasonId);

    if (error) throw error;

    // Aggregate results in memory (or could do via RPC)
    const results = {};
    data.forEach(vote => {
      if (!results[vote.award_id]) {
        results[vote.award_id] = {};
      }
      if (!results[vote.award_id][vote.vote_value]) {
        results[vote.award_id][vote.vote_value] = 0;
      }
      results[vote.award_id][vote.vote_value]++;
    });

    return results;
  } catch (error) {
    throwDbError(error, 'Get award results');
  }
}
