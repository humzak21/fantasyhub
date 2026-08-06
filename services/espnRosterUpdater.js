import { getDb } from './db/index.js';
import { extractOwnerInfo, findMatchingTeam } from '../utils/ownerUtils.js';

export class ESPNRosterUpdater {
  constructor(leagueId, seasonYear, espnS2 = null, swid = null) {
    this.leagueId = leagueId;
    this.seasonYear = seasonYear;
    this.espnS2 = espnS2;
    this.swid = swid;
    this.baseUrl = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
    // Resolved lazily so the process has finished loading env vars first.
    this.db = null;
  }

  async initializeDataManager() {
    if (!this.db) this.db = getDb();
  }

  async fetchLeagueData() {
    try {
      const url = `${this.baseUrl}/${this.seasonYear}/segments/0/leagues/${this.leagueId}`;
      const params = new URLSearchParams();
      params.append('view', 'mRoster');
      params.append('view', 'mTeam');
      params.append('view', 'mSettings');
      params.append('view', 'mMembers');
      params.append('view', 'mMatchupScore');
      params.append('view', 'mScoreboard');
      params.append('view', 'mStats');

      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };

      if (this.espnS2 && this.swid) {
        headers['Cookie'] = `espn_s2=${this.espnS2}; SWID=${this.swid}`;
      }

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`ESPN API request failed: ${response.status} - ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching league data from ESPN:', error);
      throw error;
    }
  }

  parseTeamData(espnTeamData, members = []) {
    // Use abbreviation as team name since that's what ESPN returns
    const teamName = espnTeamData.abbrev || `Team ${espnTeamData.id}`;
    
    // Use enhanced owner extraction with cross-season fallback
    const { ownerId, ownerName } = extractOwnerInfo(espnTeamData, members);
    
    return {
      espnTeamId: espnTeamData.id,
      teamName,
      ownerId,
      ownerName,
      roster: this.parseRosterData(espnTeamData.roster),
      record: {
        wins: espnTeamData.record?.overall?.wins || 0,
        losses: espnTeamData.record?.overall?.losses || 0,
        ties: espnTeamData.record?.overall?.ties || 0
      },
      pointsFor: espnTeamData.record?.overall?.pointsFor || 0,
      pointsAgainst: espnTeamData.record?.overall?.pointsAgainst || 0
    };
  }

  parseRosterData(rosterData) {
    if (!rosterData?.entries) return [];

    return rosterData.entries.map(entry => {
      const player = entry.playerPoolEntry?.player;
      const stats = player?.stats || [];
      
      // Find actual stats (statSourceId: 0) and projected stats (statSourceId: 1)
      const actualStats = stats.find(stat => stat.statSourceId === 0 && stat.statSplitTypeId === 1);
      const projectedStats = stats.find(stat => stat.statSourceId === 1 && stat.statSplitTypeId === 1);
      
      // Find season totals (statSplitTypeId: 0)
      const seasonActualStats = stats.find(stat => stat.statSourceId === 0 && stat.statSplitTypeId === 0);
      const seasonProjectedStats = stats.find(stat => stat.statSourceId === 1 && stat.statSplitTypeId === 0);

      return {
        playerId: entry.playerId,
        playerName: player?.fullName || 'Unknown Player',
        position: this.getPositionName(player?.defaultPositionId),
        proTeam: player?.proTeamId,
        proTeamName: this.getProTeamName(player?.proTeamId),
        rosterSlot: entry.lineupSlotId,
        acquisitionType: player?.acquisitionType,
        isActive: entry.lineupSlotId !== 20 && entry.lineupSlotId !== 21,
        
        // Points data - current week/period
        projectedPoints: projectedStats?.appliedTotal || 0,
        actualPoints: actualStats?.appliedTotal || 0,
        
        // Season totals
        seasonProjectedPoints: seasonProjectedStats?.appliedTotal || 0,
        seasonActualPoints: seasonActualStats?.appliedTotal || 0,
        
        // Games played for averages
        gamesPlayed: actualStats?.externalId ? 1 : 0, // This will need refinement based on actual ESPN data structure
        
        // Additional useful stats
        injuryStatus: player?.injuryStatus || 'ACTIVE',
        percentOwned: player?.percentOwned || 0,
        percentStarted: player?.percentStarted || 0,
        
        // Calculate averages
        averagePointsPerGame: (() => {
          const games = actualStats?.gamesPlayed || 1;
          const points = seasonActualStats?.appliedTotal || 0;
          return games > 0 ? parseFloat((points / games).toFixed(1)) : 0;
        })(),
        
        projectedAverage: (() => {
          const weeksRemaining = 17; // Standard NFL season, could be dynamic  
          const projPoints = seasonProjectedStats?.appliedTotal || 0;
          return projPoints > 0 ? parseFloat((projPoints / weeksRemaining).toFixed(1)) : 0;
        })()
      };
    });
  }

  getPositionName(positionId) {
    const positions = {
      1: 'QB',
      2: 'RB', 
      3: 'WR',
      4: 'TE',
      5: 'K',
      16: 'D/ST'
    };
    return positions[positionId] || 'UNKNOWN';
  }

  getProTeamName(proTeamId) {
    const teams = {
      1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
      9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
      17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
      25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
    };
    return teams[proTeamId] || '';
  }



  async updateTeamRosters(seasonId = null) {
    try {
      console.log(`Fetching roster data for league ${this.leagueId}...`);
      
      // Initialize data manager first
      await this.initializeDataManager();
      
      
      
      const leagueData = await this.fetchLeagueData();
      
      if (!leagueData.teams) {
        throw new Error('No team data found in ESPN response');
      }

      const activeSeason = seasonId ? 
        await this.db.seasons.getSeason(seasonId) : 
        await this.db.seasons.getActiveSeason();

      if (!activeSeason) {
        throw new Error('No active season found. Please create a season first.');
      }
      
      console.log('Active season teams count:', activeSeason.teams?.length || 0);

      const updateResults = {
        updated: [],
        notFound: [],
        errors: []
      };

      const members = leagueData.members || [];
      
      for (const espnTeam of leagueData.teams) {
        try {
          const parsedTeam = this.parseTeamData(espnTeam, members);
          
          // Use team matching with confidence scoring
          console.log('Teams available for matching:', activeSeason.teams?.length || 0);
          const matchResult = findMatchingTeam(espnTeam, activeSeason.teams, members);
          
          if (matchResult && matchResult.team) {
            const existingTeam = matchResult.team;
            const rosterUpdate = {
              roster: parsedTeam.roster,
              espnTeamId: parsedTeam.espnTeamId,
              updatedAt: new Date().toISOString(),
              lastRosterSync: new Date().toISOString()
            };

            
            await this.db.teams.updateTeam(activeSeason.id, existingTeam.id, rosterUpdate);
            
            updateResults.updated.push({
              teamId: existingTeam.id,
              teamName: existingTeam.name,
              owner: existingTeam.owner,
              espnTeamName: parsedTeam.teamName,
              rosterSize: parsedTeam.roster.length
            });

            console.log(`✓ Updated roster for ${existingTeam.name} (${existingTeam.owner})`);
          } else {
            updateResults.notFound.push({
              espnTeamName: parsedTeam.teamName,
              espnTeamId: parsedTeam.espnTeamId,
              ownerName: parsedTeam.ownerName
            });
            console.log(`⚠ Could not find matching team for ESPN team: ${parsedTeam.teamName} (Owner: ${parsedTeam.ownerName || 'Unknown'}) [ID: ${parsedTeam.espnTeamId}]`);
          }
        } catch (teamError) {
          updateResults.errors.push({
            espnTeamId: espnTeam.id,
            error: teamError.message
          });
          console.error(`Error updating team ${espnTeam.id}:`, teamError);
        }
      }

      console.log('\n=== Roster Update Summary ===');
      console.log(`✓ Successfully updated: ${updateResults.updated.length} teams`);
      console.log(`⚠ Teams not found: ${updateResults.notFound.length}`);
      console.log(`✗ Errors: ${updateResults.errors.length}`);

      return updateResults;

    } catch (error) {
      console.error('Error updating team rosters:', error);
      throw error;
    }
  }

  async validateLeagueConnection() {
    try {
      console.log('Testing connection to ESPN Fantasy League...');
      const leagueData = await this.fetchLeagueData();
      
      console.log(`✓ Successfully connected to league: ${leagueData.settings?.name || 'Unnamed League'}`);
      console.log(`✓ Found ${leagueData.teams?.length || 0} teams`);
      console.log(`✓ League ID: ${this.leagueId}`);
      console.log(`✓ Season Year: ${this.seasonYear}`);
      
      if (leagueData.teams) {
        console.log('\nTeams found in ESPN league:');
        const members = leagueData.members || [];
        leagueData.teams.forEach((team, index) => {
          const parsedTeam = this.parseTeamData(team, members);
          console.log(`- ${parsedTeam.teamName} (Owner: ${parsedTeam.ownerName || 'Unknown'}) [ESPN ID: ${parsedTeam.espnTeamId}]`);
        });
      }

      return {
        success: true,
        leagueName: leagueData.settings?.name || 'Unnamed League',
        teamCount: leagueData.teams?.length || 0,
        teams: leagueData.teams?.map(team => ({
          name: team.abbrev || `Team ${team.id}`,
          espnId: team.id,
          ownerIds: team.owners || []
        }))
      };
    } catch (error) {
      console.error('❌ Failed to connect to ESPN league:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateMatchingReport(seasonId = null) {
    console.log('\n=== Team Matching Analysis ===');
    
    try {
      // First, get ESPN team data
      console.log('Fetching ESPN league data...');
      const leagueData = await this.fetchLeagueData();
      const members = leagueData.members || [];
      
      console.log('\nTeams found in ESPN league:');
      leagueData.teams.forEach((team, index) => {
        const parsedTeam = this.parseTeamData(team, members);
        console.log(`${index + 1}. ${parsedTeam.teamName} (Owner: ${parsedTeam.ownerName || 'Unknown'}) [ESPN ID: ${parsedTeam.espnTeamId}]`);
      });
      
      // Try to get local season data, but don't fail if not available
      try {
        await this.initializeDataManager();
        const activeSeason = seasonId ? 
          await this.db.seasons.getSeason(seasonId) : 
          await this.db.seasons.getActiveSeason();

        if (activeSeason && activeSeason.teams) {
          console.log('\nTeams in your local fantasy system:');
          activeSeason.teams.forEach((team, index) => {
            console.log(`${index + 1}. ${team.name} (Owner: ${team.owner || 'No owner set'})`);
          });
          
          console.log('\n=== Matching Analysis ===');
          console.log('Compare the ESPN teams above with your local teams.');
        } else {
          console.log('\nNo local season data found. This is normal if you haven\'t set up your fantasy system yet.');
        }
      } catch (dbError) {
        console.log('\nLocal database not accessible (this is normal for ESPN-only usage):');
        console.log('- No local season data to compare against');
        console.log('- ESPN team data shown above is what would be imported');
      }
      
      console.log('\n=== Next Steps ===');
      console.log('1. Verify the ESPN team owner names are correct');
      console.log('2. If using local database, ensure team owner names match between ESPN and your system');
      console.log('3. Run "node scripts/updateRosters.js test" to test the connection');
      
    } catch (error) {
      console.error('Failed to fetch ESPN data:', error.message);
      if (error.message.includes('401') || error.message.includes('403')) {
        console.error('\n💡 This might be a private league. You need to set espnS2 and swid cookies.');
      }
    }
  }
}

export async function createRosterUpdateScript(leagueId, seasonYear, espnS2 = null, swid = null) {
  const updater = new ESPNRosterUpdater(leagueId, seasonYear, espnS2, swid);
  
  return {
    updater,
    
    async testConnection() {
      return await updater.validateLeagueConnection();
    },

    async updateRosters(seasonId = null) {
      return await updater.updateTeamRosters(seasonId);
    },

    async showMatchingReport(seasonId = null) {
      return await updater.generateMatchingReport(seasonId);
    },

    async runWeeklyUpdate(seasonId = null) {
      console.log('🏈 Starting weekly roster update...');
      
      try {
        const connectionTest = await updater.validateLeagueConnection();
        if (!connectionTest.success) {
          throw new Error(`Connection failed: ${connectionTest.error}`);
        }

        const updateResults = await updater.updateTeamRosters(seasonId);
        
        console.log('\n🎉 Weekly roster update completed successfully!');
        return updateResults;
      } catch (error) {
        console.error('❌ Weekly roster update failed:', error);
        throw error;
      }
    }
  };
}

export default ESPNRosterUpdater;