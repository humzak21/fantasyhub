const axios = require('axios');

const LEAGUE_ID = 67674700;
const SEASONS = [2020, 2021, 2022, 2023, 2024];

// ESPN Authentication credentials
const ESPN_S2 = '***REMOVED-ESPN-S2***';
const SWID = '{REMOVED-SWID}';

// Configure axios with authentication
const createAuthenticatedRequest = () => {
    return axios.create({
        withCredentials: true,
        headers: {
            'Cookie': `espn_s2=${ESPN_S2}; SWID=${SWID};`
        }
    });
};

async function getSeasonData(seasonId, authenticatedAxios) {
    console.log(`\nFetching complete data for season ${seasonId}...`);
    
    try {
        const baseUrl = seasonId >= 2018 
            ? `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${seasonId}/segments/0/leagues/${LEAGUE_ID}`
            : `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}`;
        
        // For historical seasons (pre-2018), use different endpoint
        const isHistorical = seasonId < 2018;
        const seasonParam = isHistorical ? `?seasonId=${seasonId}` : '';
        
        // Get league settings and members
        const connector = isHistorical ? (seasonParam ? '&' : '?') : '?';
        const settingsUrl = `${baseUrl}${seasonParam}${connector}view=mSettings&view=mTeam`;
        console.log(`  Fetching settings: ${settingsUrl}`);
        const settingsResponse = await authenticatedAxios.get(settingsUrl);
        
        // Get teams with complete records
        const teamsUrl = `${baseUrl}${seasonParam}${connector}view=mRoster&view=mTeam&view=mMatchup&scoringPeriodId=1`;
        console.log(`  Fetching teams: ${teamsUrl}`);
        const teamsResponse = await authenticatedAxios.get(teamsUrl);
        
        // Get schedule for the entire season
        const scheduleUrl = `${baseUrl}${seasonParam}${connector}view=mMatchupScore&view=mSchedule`;
        console.log(`  Fetching schedule: ${scheduleUrl}`);
        const scheduleResponse = await authenticatedAxios.get(scheduleUrl);
        
        // Extract data (handle both current season format and historical format)
        const data = isHistorical ? settingsResponse.data[0] : settingsResponse.data;
        const teams = isHistorical ? data.teams : teamsResponse.data.teams;
        const schedule = isHistorical ? data.schedule : scheduleResponse.data.schedule;
        
        console.log(`  ✓ Season ${seasonId}: ${teams?.length || 0} teams, ${schedule?.length || 0} matchups`);
        
        return {
            seasonId,
            settings: data,
            teams: teams || [],
            schedule: schedule || [],
            members: data.members || []
        };
        
    } catch (error) {
        console.error(`  ❌ Error fetching season ${seasonId}:`, error.response?.status, error.message);
        return null;
    }
}

async function fetchCompleteHistoricalData() {
    console.log('🏈 Fetching Complete Historical Data with Authentication');
    console.log('='.repeat(60));
    
    const authenticatedAxios = createAuthenticatedRequest();
    const historicalData = {};
    
    // Test authentication with 2024 first
    console.log('Testing authentication...');
    const testData = await getSeasonData(2024, authenticatedAxios);
    if (!testData) {
        console.error('❌ Authentication failed. Please check your ESPN S2 and SWID cookies.');
        return {};
    }
    console.log('✅ Authentication successful!');
    
    // Fetch all seasons
    for (const season of SEASONS) {
        const data = await getSeasonData(season, authenticatedAxios);
        if (data) {
            historicalData[season] = data;
        }
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return historicalData;
}

async function main() {
    try {
        const historicalData = await fetchCompleteHistoricalData();
        
        if (Object.keys(historicalData).length === 0) {
            console.log('❌ No data retrieved. Check authentication and try again.');
            return;
        }
        
        // Save the complete historical data
        const fs = require('fs');
        fs.writeFileSync('complete_historical_data.json', JSON.stringify(historicalData, null, 2));
        console.log('\n✅ Complete historical data saved to complete_historical_data.json');
        
        // Summary of retrieved data
        console.log('\n📊 Data Summary:');
        console.log('-'.repeat(40));
        Object.keys(historicalData).forEach(season => {
            const data = historicalData[season];
            console.log(`${season}: ${data.teams?.length || 0} teams, ${data.schedule?.length || 0} games`);
        });
        
        console.log('\n🎯 Ready to run comprehensive analysis with 5 years of data!');
        console.log('Run: node analyze_complete_stats.js');
        
    } catch (error) {
        console.error('Main error:', error.message);
    }
}

if (require.main === module) {
    main();
}

module.exports = { fetchCompleteHistoricalData };