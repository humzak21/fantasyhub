/**
 * Calculate Season Awards Script
 *
 * This script analyzes historical season data and assigns awards across
 * four categories: Standard, Regular Season, Dubious Honors, and Advanced Stats.
 *
 * Award Categories:
 * - STANDARD: Champion, Runner-up, 3rd Place, 4th Place
 * - REGULAR_SEASON: Best Record, Highest Points, Most Blowouts, Biggest Comeback
 * - DUBIOUS: Worst Record, Lowest Points, Most Points Against, Biggest Loss
 * - ADVANCED: Most Consistent, Best Playoff Run, Unluckiest
 *
 * Usage:
 *   node scripts/calculateSeasonAwards.js
 *   node scripts/calculateSeasonAwards.js --season 2024  (specific season)
 *   node scripts/calculateSeasonAwards.js --rebuild      (clear and rebuild)
 *
 * Prerequisites:
 *   - historical_seasons, historical_teams, historical_games must be populated
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getSupabaseAdmin } from './lib/getSupabaseAdmin.js';

const args = process.argv.slice(2);
const specificSeason = args.find(arg => arg.startsWith('--season='))?.split('=')[1];
const rebuildAll = args.includes('--rebuild');

/**
 * Get all historical seasons (or specific season)
 */
async function getHistoricalSeasons(supabaseAdmin) {
  console.log('\n📊 Fetching historical seasons...');

  let query = supabaseAdmin
    .from('historical_seasons')
    .select('*')
    .order('year', { ascending: true });

  if (specificSeason) {
    query = query.eq('year', parseInt(specificSeason));
  }

  const { data: seasons, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch seasons: ${error.message}`);
  }

  console.log(`   ✅ Found ${seasons?.length || 0} seasons`);
  return seasons || [];
}

/**
 * Get teams for a season
 */
async function getSeasonTeams(seasonId, supabaseAdmin) {
  const { data: teams, error } = await supabaseAdmin
    .from('historical_teams')
    .select('*')
    .eq('season_id', seasonId);

  if (error) {
    throw new Error(`Failed to fetch teams: ${error.message}`);
  }

  return teams || [];
}

/**
 * Get games for a season
 */
async function getSeasonGames(seasonId, supabaseAdmin) {
  const { data: games, error } = await supabaseAdmin
    .from('historical_games')
    .select('*')
    .eq('season_id', seasonId)
    .eq('is_completed', true);

  if (error) {
    throw new Error(`Failed to fetch games: ${error.message}`);
  }

  return games || [];
}

/**
 * Calculate standard awards (playoff finishes)
 */
function calculateStandardAwards(teams, season) {
  console.log(`   📊 Calculating standard awards...`);

  // Debug: Show playoff finishes
  const playoffTeams = teams.filter(t => t.made_playoffs === true);
  console.log(`      Found ${playoffTeams.length} playoff teams`);
  playoffTeams.forEach(t => {
    console.log(`      - ${t.team_name}: playoff_finish="${t.playoff_finish}", made_playoffs=${t.made_playoffs}`);
  });

  const awards = [];

  // Champion
  const champion = teams.find(t => t.playoff_finish === 'champion');
  if (champion) {
    awards.push({
      season_id: season.id,
      franchise_id: champion.franchise_id,
      team_id: champion.id,
      award_category: 'standard',
      award_type: 'champion',
      award_name: 'League Champion',
      value: null,
      value_label: `${champion.regular_season_wins}-${champion.regular_season_losses}`,
      description: `Won the ${season.year} championship`,
      notes: null
    });
  }

  // Runner-up
  const runnerUp = teams.find(t => t.playoff_finish === '2nd');
  if (runnerUp) {
    awards.push({
      season_id: season.id,
      franchise_id: runnerUp.franchise_id,
      team_id: runnerUp.id,
      award_category: 'standard',
      award_type: 'runner_up',
      award_name: 'Runner-Up',
      value: null,
      value_label: `${runnerUp.regular_season_wins}-${runnerUp.regular_season_losses}`,
      description: `Finished 2nd in ${season.year}`,
      notes: null
    });
  }

  // 3rd Place
  const thirdPlace = teams.find(t => t.playoff_finish === '3rd');
  if (thirdPlace) {
    awards.push({
      season_id: season.id,
      franchise_id: thirdPlace.franchise_id,
      team_id: thirdPlace.id,
      award_category: 'standard',
      award_type: 'third_place',
      award_name: '3rd Place',
      value: null,
      value_label: `${thirdPlace.regular_season_wins}-${thirdPlace.regular_season_losses}`,
      description: `Finished 3rd in ${season.year}`,
      notes: null
    });
  }

  console.log(`      ✅ ${awards.length} standard awards`);
  return awards;
}

/**
 * Calculate regular season awards
 */
function calculateRegularSeasonAwards(teams, games, season) {
  console.log(`   📊 Calculating regular season awards...`);

  const awards = [];

  // Best Record
  const bestRecord = teams.reduce((best, team) => {
    if (!best) return team;
    if (team.regular_season_wins > best.regular_season_wins) return team;
    if (team.regular_season_wins === best.regular_season_wins &&
        team.points_for > best.points_for) return team;
    return best;
  }, null);

  if (bestRecord) {
    awards.push({
      season_id: season.id,
      franchise_id: bestRecord.franchise_id,
      team_id: bestRecord.id,
      award_category: 'regular_season',
      award_type: 'best_record',
      award_name: 'Best Regular Season Record',
      value: bestRecord.regular_season_wins,
      value_label: `${bestRecord.regular_season_wins}-${bestRecord.regular_season_losses}`,
      description: `Best record in ${season.year} regular season`,
      notes: null
    });
  }

  // Highest Points
  const highestPoints = teams.reduce((best, team) => {
    return !best || team.points_for > best.points_for ? team : best;
  }, null);

  if (highestPoints) {
    awards.push({
      season_id: season.id,
      franchise_id: highestPoints.franchise_id,
      team_id: highestPoints.id,
      award_category: 'regular_season',
      award_type: 'highest_points',
      award_name: 'Highest Points Scored',
      value: highestPoints.points_for,
      value_label: `${highestPoints.points_for.toFixed(2)} points`,
      description: `Highest total points in ${season.year}`,
      notes: null
    });
  }

  // Most Blowouts (wins by 25+ points)
  const regularSeasonGames = games.filter(g => g.type === 'regular');
  const blowoutCounts = new Map();

  for (const game of regularSeasonGames) {
    if (game.is_blowout && game.winner_team_id) {
      blowoutCounts.set(game.winner_team_id, (blowoutCounts.get(game.winner_team_id) || 0) + 1);
    }
  }

  let mostBlowoutsTeamId = null;
  let mostBlowoutsCount = 0;
  for (const [teamId, count] of blowoutCounts) {
    if (count > mostBlowoutsCount) {
      mostBlowoutsCount = count;
      mostBlowoutsTeamId = teamId;
    }
  }

  if (mostBlowoutsTeamId && mostBlowoutsCount > 0) {
    const team = teams.find(t => t.id === mostBlowoutsTeamId);
    if (team) {
      awards.push({
        season_id: season.id,
        franchise_id: team.franchise_id,
        team_id: team.id,
        award_category: 'regular_season',
        award_type: 'most_blowouts',
        award_name: 'Most Blowout Wins',
        value: mostBlowoutsCount,
        value_label: `${mostBlowoutsCount} blowout wins`,
        description: `Most wins by 25+ points in ${season.year}`,
        notes: null
      });
    }
  }

  // Highest Weekly Score
  let highestWeeklyScore = 0;
  let highestWeeklyTeamId = null;
  let highestWeeklyWeek = null;

  for (const game of games) {
    if (game.team1_score > highestWeeklyScore) {
      highestWeeklyScore = game.team1_score;
      highestWeeklyTeamId = game.team1_id;
      highestWeeklyWeek = game.week;
    }
    if (game.team2_score > highestWeeklyScore) {
      highestWeeklyScore = game.team2_score;
      highestWeeklyTeamId = game.team2_id;
      highestWeeklyWeek = game.week;
    }
  }

  if (highestWeeklyTeamId) {
    const team = teams.find(t => t.id === highestWeeklyTeamId);
    if (team) {
      awards.push({
        season_id: season.id,
        franchise_id: team.franchise_id,
        team_id: team.id,
        award_category: 'regular_season',
        award_type: 'highest_weekly_score',
        award_name: 'Highest Weekly Score',
        value: highestWeeklyScore,
        value_label: `${highestWeeklyScore.toFixed(2)} points (Week ${highestWeeklyWeek})`,
        description: `Highest single-week score in ${season.year}`,
        notes: null
      });
    }
  }

  console.log(`      ✅ ${awards.length - awards.filter(a => a.award_category === 'standard').length} regular season awards`);
  return awards;
}

/**
 * Calculate dubious honors
 */
function calculateDubiousAwards(teams, games, season) {
  console.log(`   📊 Calculating dubious honors...`);

  const awards = [];

  // Worst Record
  const worstRecord = teams.reduce((worst, team) => {
    if (!worst) return team;
    if (team.regular_season_wins < worst.regular_season_wins) return team;
    if (team.regular_season_wins === worst.regular_season_wins &&
        team.points_for < worst.points_for) return team;
    return worst;
  }, null);

  if (worstRecord) {
    awards.push({
      season_id: season.id,
      franchise_id: worstRecord.franchise_id,
      team_id: worstRecord.id,
      award_category: 'dubious',
      award_type: 'worst_record',
      award_name: 'Worst Record (Sacko)',
      value: worstRecord.regular_season_losses,
      value_label: `${worstRecord.regular_season_wins}-${worstRecord.regular_season_losses}`,
      description: `Worst record in ${season.year}`,
      notes: null
    });
  }

  // Lowest Points
  const lowestPoints = teams.reduce((worst, team) => {
    return !worst || team.points_for < worst.points_for ? team : worst;
  }, null);

  if (lowestPoints) {
    awards.push({
      season_id: season.id,
      franchise_id: lowestPoints.franchise_id,
      team_id: lowestPoints.id,
      award_category: 'dubious',
      award_type: 'lowest_points',
      award_name: 'Lowest Points Scored',
      value: lowestPoints.points_for,
      value_label: `${lowestPoints.points_for.toFixed(2)} points`,
      description: `Lowest total points in ${season.year}`,
      notes: null
    });
  }

  // Most Points Against (unlucky)
  const mostPointsAgainst = teams.reduce((worst, team) => {
    return !worst || team.points_against > worst.points_against ? team : worst;
  }, null);

  if (mostPointsAgainst) {
    awards.push({
      season_id: season.id,
      franchise_id: mostPointsAgainst.franchise_id,
      team_id: mostPointsAgainst.id,
      award_category: 'dubious',
      award_type: 'most_points_against',
      award_name: 'Most Points Against',
      value: mostPointsAgainst.points_against,
      value_label: `${mostPointsAgainst.points_against.toFixed(2)} points`,
      description: `Most points scored against in ${season.year}`,
      notes: null
    });
  }

  // Biggest Blowout Loss
  let biggestLoss = 0;
  let biggestLossTeamId = null;
  let biggestLossWeek = null;

  for (const game of games) {
    if (game.loser_team_id && game.point_differential > biggestLoss) {
      biggestLoss = game.point_differential;
      biggestLossTeamId = game.loser_team_id;
      biggestLossWeek = game.week;
    }
  }

  if (biggestLossTeamId) {
    const team = teams.find(t => t.id === biggestLossTeamId);
    if (team) {
      awards.push({
        season_id: season.id,
        franchise_id: team.franchise_id,
        team_id: team.id,
        award_category: 'dubious',
        award_type: 'biggest_blowout_loss',
        award_name: 'Biggest Blowout Loss',
        value: biggestLoss,
        value_label: `Lost by ${biggestLoss.toFixed(2)} points (Week ${biggestLossWeek})`,
        description: `Largest margin of defeat in ${season.year}`,
        notes: null
      });
    }
  }

  // Lowest Weekly Score
  let lowestWeeklyScore = Infinity;
  let lowestWeeklyTeamId = null;
  let lowestWeeklyWeek = null;

  for (const game of games) {
    if (game.team1_score < lowestWeeklyScore && game.team1_score > 0) {
      lowestWeeklyScore = game.team1_score;
      lowestWeeklyTeamId = game.team1_id;
      lowestWeeklyWeek = game.week;
    }
    if (game.team2_score < lowestWeeklyScore && game.team2_score > 0) {
      lowestWeeklyScore = game.team2_score;
      lowestWeeklyTeamId = game.team2_id;
      lowestWeeklyWeek = game.week;
    }
  }

  if (lowestWeeklyTeamId && lowestWeeklyScore < Infinity) {
    const team = teams.find(t => t.id === lowestWeeklyTeamId);
    if (team) {
      awards.push({
        season_id: season.id,
        franchise_id: team.franchise_id,
        team_id: team.id,
        award_category: 'dubious',
        award_type: 'lowest_weekly_score',
        award_name: 'Lowest Weekly Score',
        value: lowestWeeklyScore,
        value_label: `${lowestWeeklyScore.toFixed(2)} points (Week ${lowestWeeklyWeek})`,
        description: `Lowest single-week score in ${season.year}`,
        notes: null
      });
    }
  }

  console.log(`      ✅ ${awards.filter(a => a.award_category === 'dubious').length} dubious awards`);
  return awards;
}

/**
 * Calculate advanced awards
 */
function calculateAdvancedAwards(teams, games, season) {
  console.log(`   📊 Calculating advanced awards...`);

  const awards = [];

  // Most Consistent (lowest standard deviation in weekly scores)
  const teamWeeklyScores = new Map();
  for (const game of games.filter(g => g.type === 'regular')) {
    if (!teamWeeklyScores.has(game.team1_id)) {
      teamWeeklyScores.set(game.team1_id, []);
    }
    if (!teamWeeklyScores.has(game.team2_id)) {
      teamWeeklyScores.set(game.team2_id, []);
    }
    teamWeeklyScores.get(game.team1_id).push(game.team1_score);
    teamWeeklyScores.get(game.team2_id).push(game.team2_score);
  }

  let mostConsistent = null;
  let lowestStdDev = Infinity;

  for (const [teamId, scores] of teamWeeklyScores) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < lowestStdDev) {
      lowestStdDev = stdDev;
      mostConsistent = teams.find(t => t.id === teamId);
    }
  }

  if (mostConsistent) {
    awards.push({
      season_id: season.id,
      franchise_id: mostConsistent.franchise_id,
      team_id: mostConsistent.id,
      award_category: 'advanced',
      award_type: 'most_consistent',
      award_name: 'Most Consistent',
      value: lowestStdDev,
      value_label: `σ = ${lowestStdDev.toFixed(2)}`,
      description: `Most consistent weekly scores in ${season.year}`,
      notes: 'Lowest standard deviation in weekly scoring'
    });
  }

  console.log(`      ✅ ${awards.filter(a => a.award_category === 'advanced').length} advanced awards`);
  return awards;
}

/**
 * Save awards to database
 */
async function saveAwards(awards, season, supabaseAdmin) {
  console.log(`   💾 Saving ${awards.length} awards...`);

  if (rebuildAll) {
    // Clear existing awards for this season
    const { error: deleteError } = await supabaseAdmin
      .from('season_awards')
      .delete()
      .eq('season_id', season.id);

    if (deleteError) {
      throw new Error(`Failed to clear existing awards: ${deleteError.message}`);
    }
  }

  let saved = 0;
  let errors = 0;

  for (const award of awards) {
    const { error } = await supabaseAdmin
      .from('season_awards')
      .insert(award);

    if (error) {
      console.error(`      ❌ Error saving award: ${error.message}`);
      errors++;
      continue;
    }

    saved++;
  }

  console.log(`      ✅ Saved ${saved} awards${errors > 0 ? `, ${errors} errors` : ''}`);
}

/**
 * Update franchise career stats
 */
async function updateFranchiseStats(supabaseAdmin) {
  console.log('\n📊 Updating franchise career statistics...');

  const { data: franchises, error: franchisesError } = await supabaseAdmin
    .from('league_franchises')
    .select('id');

  if (franchisesError) {
    throw new Error(`Failed to fetch franchises: ${franchisesError.message}`);
  }

  for (const franchise of franchises) {
    // Aggregate stats from historical_teams
    const { data: stats, error: statsError } = await supabaseAdmin
      .from('historical_teams')
      .select('*')
      .eq('franchise_id', franchise.id);

    if (statsError) {
      console.error(`   ❌ Error fetching stats for franchise ${franchise.id}: ${statsError.message}`);
      continue;
    }

    if (!stats || stats.length === 0) continue;

    const totalSeasons = stats.length;
    const totalWins = stats.reduce((sum, t) => sum + (t.regular_season_wins || 0), 0);
    const totalLosses = stats.reduce((sum, t) => sum + (t.regular_season_losses || 0), 0);
    const totalPointsFor = stats.reduce((sum, t) => sum + (t.points_for || 0), 0);
    const totalPointsAgainst = stats.reduce((sum, t) => sum + (t.points_against || 0), 0);
    const championships = stats.filter(t => t.playoff_finish === 'champion').length;
    const playoffAppearances = stats.filter(t => t.made_playoffs === true).length;

    const winPercentage = totalWins + totalLosses > 0
      ? totalWins / (totalWins + totalLosses)
      : 0;

    // Update franchise
    const { error: updateError } = await supabaseAdmin
      .from('league_franchises')
      .update({
        total_seasons: totalSeasons,
        total_regular_season_wins: totalWins,
        total_regular_season_losses: totalLosses,
        total_points_for: totalPointsFor,
        total_points_against: totalPointsAgainst,
        total_championships: championships,
        total_playoff_appearances: playoffAppearances,
        career_win_percentage: winPercentage
      })
      .eq('id', franchise.id);

    if (updateError) {
      console.error(`   ❌ Error updating franchise ${franchise.id}: ${updateError.message}`);
    }
  }

  console.log(`   ✅ Updated ${franchises.length} franchises`);
}

/**
 * Main function
 */
async function calculateSeasonAwards() {
  console.log('🏈 Calculate Season Awards');
  console.log('='.repeat(60));
  console.log(`   Specific season: ${specificSeason || 'All'}`);
  console.log(`   Rebuild: ${rebuildAll}`);
  console.log('='.repeat(60));

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Please set SUPABASE_SERVICE_ROLE_KEY in your .env.local file');
    process.exit(1);
  }

  try {
    // Get seasons to process
    const seasons = await getHistoricalSeasons(supabaseAdmin);

    if (seasons.length === 0) {
      console.log('\n⚠️  No historical seasons found. Import historical data first.');
      process.exit(0);
    }

    // Process each season
    for (const season of seasons) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing ${season.year} Season`);
      console.log('='.repeat(60));

      const teams = await getSeasonTeams(season.id, supabaseAdmin);
      const games = await getSeasonGames(season.id, supabaseAdmin);

      if (teams.length === 0) {
        console.log(`   ⚠️  No teams found for ${season.year}`);
        continue;
      }

      const allAwards = [
        ...calculateStandardAwards(teams, season),
        ...calculateRegularSeasonAwards(teams, games, season),
        ...calculateDubiousAwards(teams, games, season),
        ...calculateAdvancedAwards(teams, games, season)
      ];

      await saveAwards(allAwards, season, supabaseAdmin);
    }

    // Update franchise career stats
    await updateFranchiseStats(supabaseAdmin);

    console.log('\n' + '='.repeat(60));
    console.log('✅ AWARDS CALCULATION COMPLETE');
    console.log('='.repeat(60));
    console.log('\n📝 Next Steps:');
    console.log('   1. Query season_awards table to view all awards');
    console.log('   2. Run refresh_league_history_views() to update materialized views');
    console.log('   3. Use get_franchise_awards(franchise_id) function to see awards for a franchise');

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
calculateSeasonAwards()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
