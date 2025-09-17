const fs = require('fs');

function loadCompleteHistoricalData() {
    try {
        const data = JSON.parse(fs.readFileSync('complete_historical_data.json', 'utf8'));
        return data;
    } catch (error) {
        console.error('Error loading complete historical data:', error.message);
        return {};
    }
}

function findManagerAcrossSeasons(managerId, allSeasonMembers) {
    // Try to find manager info from any season (in case they missed a season)
    for (const seasonMembers of Object.values(allSeasonMembers)) {
        const manager = seasonMembers.find(m => m.id === managerId);
        if (manager) return manager;
    }
    return null;
}

function extractCompleteManagerStats(historicalData) {
    const managers = {};
    const allSeasonMembers = {};
    
    // First, collect all members from all seasons
    Object.keys(historicalData).forEach(season => {
        const seasonData = historicalData[season];
        allSeasonMembers[season] = seasonData.members || [];
    });
    
    console.log('📊 Analyzing Complete Historical Data (2020-2024)');
    console.log('='.repeat(60));
    
    // Process each season's data
    Object.keys(historicalData).forEach(season => {
        const seasonData = historicalData[season];
        const teams = seasonData.teams || [];
        const members = seasonData.members || [];
        
        console.log(`\n=== Season ${season} ===`);
        console.log(`Teams: ${teams.length}, Members: ${members.length}`);
        
        teams.forEach(team => {
            const ownerId = team.primaryOwner;
            const owner = members.find(m => m.id === ownerId) || 
                         findManagerAcrossSeasons(ownerId, allSeasonMembers);
            
            if (!owner) {
                console.log(`Warning: No owner found for team ${team.name} (${ownerId})`);
                return;
            }
            
            const managerName = `${owner.firstName} ${owner.lastName}`.trim();
            const managerId = ownerId;
            
            // Initialize manager if not exists
            if (!managers[managerId]) {
                managers[managerId] = {
                    name: managerName,
                    seasonsPlayed: [],
                    playoffAppearances: 0,
                    championships: 0,
                    runnerUps: 0,
                    top3Finishes: 0,
                    lastPlaceFinishes: 0,
                    seasonRecords: [],
                    seasonPointsFor: [],
                    seasonPointsAgainst: [],
                    allTimeWins: 0,
                    allTimeLosses: 0,
                    allTimeTies: 0,
                    totalPointsScored: 0,
                    bestSeason: null,
                    worstSeason: null
                };
            }
            
            const manager = managers[managerId];
            
            // Track season participation
            manager.seasonsPlayed.push(parseInt(season));
            
            // Extract season stats
            const record = team.record?.overall || {};
            const wins = record.wins || 0;
            const losses = record.losses || 0;
            const ties = record.ties || 0;
            const pointsFor = record.pointsFor || team.points || 0;
            const pointsAgainst = record.pointsAgainst || 0;
            const finalPosition = team.rankCalculatedFinal || team.playoffSeed || 0;
            const playoffSeed = team.playoffSeed || 0;
            
            // Accumulate all-time stats
            manager.allTimeWins += wins;
            manager.allTimeLosses += losses;
            manager.allTimeTies += ties;
            manager.totalPointsScored += pointsFor;
            
            // Store season data
            const seasonRecord = {
                season: parseInt(season),
                wins,
                losses,
                ties,
                record: `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`,
                pointsFor,
                pointsAgainst,
                finalPosition,
                playoffSeed,
                winPercentage: wins / (wins + losses + ties) * 100
            };
            
            manager.seasonRecords.push(seasonRecord);
            manager.seasonPointsFor.push(pointsFor);
            manager.seasonPointsAgainst.push(pointsAgainst);
            
            // Track best and worst seasons
            if (!manager.bestSeason || seasonRecord.winPercentage > manager.bestSeason.winPercentage) {
                manager.bestSeason = seasonRecord;
            }
            if (!manager.worstSeason || seasonRecord.winPercentage < manager.worstSeason.winPercentage) {
                manager.worstSeason = seasonRecord;
            }
            
            // Determine achievements
            const totalTeams = teams.length;
            const playoffCutoff = Math.ceil(totalTeams / 2);
            
            // Playoff appearances (typically top half)
            if (playoffSeed > 0 && playoffSeed <= playoffCutoff) {
                manager.playoffAppearances++;
            }
            
            // Championships (1st place)
            if (finalPosition === 1) {
                manager.championships++;
            }
            
            // Runner-ups (2nd place)
            if (finalPosition === 2) {
                manager.runnerUps++;
            }
            
            // Top-3 finishes
            if (finalPosition <= 3 && finalPosition > 0) {
                manager.top3Finishes++;
            }
            
            // Last place finishes
            if (finalPosition === totalTeams) {
                manager.lastPlaceFinishes++;
            }
            
            console.log(`  ${managerName}: ${wins}-${losses}, ${pointsFor.toFixed(0)} PF, Rank ${finalPosition}`);
        });
    });
    
    return managers;
}

function calculateAdvancedMetrics(managers) {
    Object.keys(managers).forEach(managerId => {
        const manager = managers[managerId];
        
        if (manager.seasonPointsFor.length > 0) {
            // Career averages
            manager.avgPointsForPerSeason = manager.totalPointsScored / manager.seasonsPlayed.length;
            manager.avgPointsForPerGame = manager.totalPointsScored / (manager.allTimeWins + manager.allTimeLosses + manager.allTimeTies);
            
            // Standard deviation of points for (consistency measure)
            const variance = manager.seasonPointsFor.reduce((acc, val) => {
                return acc + Math.pow(val - manager.avgPointsForPerSeason, 2);
            }, 0) / manager.seasonPointsFor.length;
            manager.stdDevPointsFor = Math.sqrt(variance);
            
            // Career win percentage
            const totalGames = manager.allTimeWins + manager.allTimeLosses + manager.allTimeTies;
            manager.careerWinPercentage = totalGames > 0 ? (manager.allTimeWins / totalGames) * 100 : 0;
            
            // Recent form (last 2 seasons)
            const recentSeasons = manager.seasonRecords.slice(-2);
            if (recentSeasons.length > 0) {
                const recentWins = recentSeasons.reduce((acc, s) => acc + s.wins, 0);
                const recentGames = recentSeasons.reduce((acc, s) => acc + s.wins + s.losses + s.ties, 0);
                manager.recentFormPercentage = recentGames > 0 ? (recentWins / recentGames) * 100 : 0;
                
                manager.recentPointsAvg = recentSeasons.reduce((acc, s) => acc + s.pointsFor, 0) / recentSeasons.length;
            }
            
            // Playoff success rate
            manager.playoffSuccessRate = manager.seasonsPlayed.length > 0 ? 
                (manager.playoffAppearances / manager.seasonsPlayed.length) * 100 : 0;
            
            // Championship rate
            manager.championshipRate = manager.seasonsPlayed.length > 0 ? 
                (manager.championships / manager.seasonsPlayed.length) * 100 : 0;
        }
    });
    
    return managers;
}

function generateComprehensiveReport(managers) {
    console.log('\n' + '='.repeat(80));
    console.log('COMPREHENSIVE FANTASY FOOTBALL MANAGER ANALYSIS (2020-2024)');
    console.log('='.repeat(80));
    
    // Sort managers by career win percentage for ranking
    const sortedManagers = Object.keys(managers).sort((a, b) => 
        managers[b].careerWinPercentage - managers[a].careerWinPercentage
    );
    
    sortedManagers.forEach((managerId, index) => {
        const manager = managers[managerId];
        
        console.log(`\n🏆 #${index + 1} Manager: ${manager.name}`);
        console.log('-'.repeat(50));
        
        // Career Overview
        console.log(`📈 CAREER OVERVIEW:`);
        console.log(`   Seasons played: ${manager.seasonsPlayed.length} (${manager.seasonsPlayed.join(', ')})`);
        console.log(`   All-time record: ${manager.allTimeWins}-${manager.allTimeLosses}-${manager.allTimeTies} (${manager.careerWinPercentage.toFixed(1)}%)`);
        console.log(`   Total points scored: ${manager.totalPointsScored.toFixed(0)} (${manager.avgPointsForPerGame.toFixed(1)} per game)`);
        
        // Achievements
        console.log(`\n🏅 ACHIEVEMENTS:`);
        console.log(`   Championships: ${manager.championships} (${manager.championshipRate.toFixed(1)}% rate)`);
        console.log(`   Runner-ups (2nd place): ${manager.runnerUps}`);
        console.log(`   Top-3 finishes: ${manager.top3Finishes}`);
        console.log(`   Playoff appearances: ${manager.playoffAppearances} (${manager.playoffSuccessRate.toFixed(1)}% rate)`);
        console.log(`   Last-place finishes: ${manager.lastPlaceFinishes}`);
        
        // Performance Metrics
        console.log(`\n📊 PERFORMANCE METRICS:`);
        console.log(`   Avg points per season: ${manager.avgPointsForPerSeason.toFixed(2)}`);
        console.log(`   Scoring consistency (Std Dev): ${manager.stdDevPointsFor.toFixed(2)}`);
        if (manager.recentFormPercentage !== undefined) {
            console.log(`   Recent form (last 2 years): ${manager.recentFormPercentage.toFixed(1)}% (${manager.recentPointsAvg.toFixed(0)} avg PF)`);
        }
        
        // Best and Worst Seasons
        if (manager.bestSeason && manager.worstSeason) {
            console.log(`\n🔥 BEST SEASON: ${manager.bestSeason.season} - ${manager.bestSeason.record}, ${manager.bestSeason.pointsFor.toFixed(0)} PF, Rank ${manager.bestSeason.finalPosition}`);
            console.log(`❄️  WORST SEASON: ${manager.worstSeason.season} - ${manager.worstSeason.record}, ${manager.worstSeason.pointsFor.toFixed(0)} PF, Rank ${manager.worstSeason.finalPosition}`);
        }
        
        // Recent Records (last 3 years)
        const recentRecords = manager.seasonRecords.slice(-3);
        console.log(`\n📅 RECENT RECORDS (last ${recentRecords.length} years): ${recentRecords.map(r => r.record).join(', ')}`);
        
        // Season-by-season breakdown
        console.log(`\n📋 SEASON-BY-SEASON:`);
        manager.seasonRecords.forEach(season => {
            console.log(`     ${season.season}: ${season.record}, ${season.pointsFor.toFixed(0)} PF, Rank ${season.finalPosition}`);
        });
    });
}

function generateAdvancedBettingOdds(managers) {
    console.log('\n' + '='.repeat(80));
    console.log('2025 CHAMPIONSHIP BETTING ODDS (BASED ON 5-YEAR ANALYSIS)');
    console.log('='.repeat(80));
    
    // Advanced scoring algorithm
    const scoredManagers = Object.keys(managers).map(managerId => {
        const manager = managers[managerId];
        
        let score = 0;
        
        // Career performance (40% weight)
        score += manager.careerWinPercentage * 0.4;
        
        // Recent form (30% weight) - heavily weight last 2 seasons
        if (manager.recentFormPercentage !== undefined) {
            score += manager.recentFormPercentage * 0.3;
        }
        
        // Championship history (20% weight)
        score += (manager.championships * 15) + (manager.runnerUps * 10) + (manager.top3Finishes * 5);
        
        // Scoring consistency (10% weight) - higher average with lower std dev is better
        if (manager.stdDevPointsFor > 0) {
            const consistencyScore = manager.avgPointsForPerSeason / manager.stdDevPointsFor;
            score += consistencyScore * 0.1;
        }
        
        // Playoff success bonus
        score += manager.playoffSuccessRate * 0.1;
        
        // Recent high scoring bonus
        if (manager.recentPointsAvg > 1500) {
            score += (manager.recentPointsAvg - 1500) / 10;
        }
        
        // Penalty for last place finishes
        score -= manager.lastPlaceFinishes * 5;
        
        return {
            managerId,
            name: manager.name,
            score: score,
            manager: manager
        };
    }).sort((a, b) => b.score - a.score);
    
    console.log('\n🎲 CHAMPIONSHIP ODDS:');
    console.log('-'.repeat(70));
    
    scoredManagers.forEach((entry, index) => {
        // More sophisticated odds calculation
        const baseOdds = 200;
        const positionMultiplier = index * 80;
        const odds = Math.max(150, baseOdds + positionMultiplier);
        const percentage = (100 / (odds / 100 + 1)).toFixed(1);
        
        console.log(`${(index + 1).toString().padStart(2)}. ${entry.name.padEnd(20)} +${odds} (${percentage}%)`);
        
        // Show key supporting stats
        const mgr = entry.manager;
        const recentRecord = mgr.seasonRecords.slice(-2).map(r => r.record).join(', ');
        console.log(`    Career: ${mgr.careerWinPercentage.toFixed(1)}% | Recent: ${recentRecord} | Championships: ${mgr.championships} | Playoffs: ${mgr.playoffAppearances}/${mgr.seasonsPlayed.length}`);
    });
    
    console.log('\n📈 METHODOLOGY:');
    console.log('• Career win % (40%), Recent form (30%), Championships (20%), Consistency (10%)');
    console.log('• Bonuses: Playoff success, recent high scoring');
    console.log('• Penalties: Last place finishes');
    console.log('• Based on comprehensive 5-year analysis (2020-2024)');
    
    return scoredManagers;
}

function generateSummaryStats(managers) {
    console.log('\n' + '='.repeat(80));
    console.log('LEAGUE SUMMARY STATISTICS');
    console.log('='.repeat(80));
    
    const activeManagers = Object.values(managers);
    const totalSeasons = activeManagers.reduce((acc, mgr) => acc + mgr.seasonsPlayed.length, 0);
    const avgSeasonsPlayed = totalSeasons / activeManagers.length;
    
    console.log(`📊 Total Managers: ${activeManagers.length}`);
    console.log(`📊 Average Seasons Played: ${avgSeasonsPlayed.toFixed(1)}`);
    console.log(`📊 Total Championships Awarded: ${activeManagers.reduce((acc, mgr) => acc + mgr.championships, 0)}`);
    console.log(`📊 Most Championships: ${Math.max(...activeManagers.map(mgr => mgr.championships))}`);
    console.log(`📊 Highest Career Win %: ${Math.max(...activeManagers.map(mgr => mgr.careerWinPercentage)).toFixed(1)}%`);
    console.log(`📊 League Scoring Average: ${(activeManagers.reduce((acc, mgr) => acc + mgr.avgPointsForPerSeason, 0) / activeManagers.length).toFixed(0)} points/season`);
}

function main() {
    console.log('🏈 Complete Fantasy Football Analysis Tool (5-Year Data)');
    console.log('='.repeat(65));
    
    const historicalData = loadCompleteHistoricalData();
    
    if (Object.keys(historicalData).length === 0) {
        console.log('❌ No complete historical data found. Please run fetch_full_history.js first.');
        return;
    }
    
    console.log(`✅ Loaded complete data for seasons: ${Object.keys(historicalData).join(', ')}`);
    
    const managers = extractCompleteManagerStats(historicalData);
    const analyzedManagers = calculateAdvancedMetrics(managers);
    
    generateComprehensiveReport(analyzedManagers);
    const bettingOdds = generateAdvancedBettingOdds(analyzedManagers);
    generateSummaryStats(analyzedManagers);
    
    // Save comprehensive analysis
    fs.writeFileSync('complete_manager_analysis.json', JSON.stringify({
        managers: analyzedManagers,
        bettingOdds: bettingOdds,
        generatedAt: new Date().toISOString()
    }, null, 2));
    
    console.log('\n💾 Complete analysis saved to complete_manager_analysis.json');
    console.log('🎯 2025 betting odds are now ready based on 5 years of comprehensive data!');
}

if (require.main === module) {
    main();
}

module.exports = { extractCompleteManagerStats, calculateAdvancedMetrics, generateAdvancedBettingOdds };