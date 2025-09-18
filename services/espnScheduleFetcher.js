// Dynamic import of SupabaseDataManager to ensure env vars are loaded first
let SupabaseDataManager;
import { extractOwnerInfo } from '../utils/ownerUtils.js';

export class ESPNScheduleFetcher {
  constructor(leagueId, seasonYear, espnS2 = null, swid = null) {
    this.leagueId = leagueId;
    this.seasonYear = seasonYear;
    this.espnS2 = espnS2;
    this.swid = swid;
    this.baseUrl = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
    // Initialize dataManager lazily to ensure env vars are loaded
    this.dataManager = null;
  }

  async initializeDataManager() {
    if (!this.dataManager) {
      if (!SupabaseDataManager) {
        const module = await import('./supabaseDataManager.js');
        SupabaseDataManager = module.SupabaseDataManager;
      }
      this.dataManager = new SupabaseDataManager();
      await this.dataManager.initialize();
    }
  }

  async fetchLeagueSchedule() {
    try {
      const url = `${this.baseUrl}/${this.seasonYear}/segments/0/leagues/${this.leagueId}`;
      const params = new URLSearchParams();
      params.append('view', 'mMatchup');
      params.append('view', 'mMatchupScore');
      params.append('view', 'mScoreboard');
      params.append('view', 'mTeam');
      params.append('view', 'mSettings');
      params.append('view', 'mMembers');

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
      throw error;
    }
  }

  async fetchScheduleByWeek(weekNumber) {
    try {
      const url = `${this.baseUrl}/${this.seasonYear}/segments/0/leagues/${this.leagueId}`;
      const params = new URLSearchParams();
      params.append('view', 'mMatchup');
      params.append('view', 'mMatchupScore');
      params.append('view', 'mScoreboard');
      params.append('view', 'mTeam');
      params.append('scoringPeriodId', weekNumber.toString());

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
      throw error;
    }
  }

  parseMatchupData(matchup, teams, settings, members = []) {
    const homeTeam = teams.find(team => team.id === matchup.home?.teamId);
    const awayTeam = teams.find(team => team.id === matchup.away?.teamId);
    
    // Extract owner information for both teams
    const homeOwnerInfo = homeTeam ? extractOwnerInfo(homeTeam, members) : { ownerId: null, ownerName: null };
    const awayOwnerInfo = awayTeam ? extractOwnerInfo(awayTeam, members) : { ownerId: null, ownerName: null };
    
    // Get playoff info if available - only consider it playoff if playoffTierType is a positive number
    const playoffTierType = matchup.playoffTierType;
    const isPlayoff = playoffTierType != null && playoffTierType > 0;
    
    return {
      matchupId: matchup.id,
      week: matchup.matchupPeriodId,
      scoringPeriodId: matchup.scoringPeriodId,
      homeTeam: {
        teamId: matchup.home?.teamId,
        teamName: homeTeam?.abbrev || homeTeam?.location || `Team ${matchup.home?.teamId}`,
        ownerId: homeOwnerInfo.ownerId,
        ownerName: homeOwnerInfo.ownerName,
        score: matchup.home?.totalPoints || 0,
        projectedScore: matchup.home?.totalPointsLive || 0,
        rosterForCurrentScoringPeriod: matchup.home?.rosterForCurrentScoringPeriod || null
      },
      awayTeam: {
        teamId: matchup.away?.teamId,
        teamName: awayTeam?.abbrev || awayTeam?.location || `Team ${matchup.away?.teamId}`,
        ownerId: awayOwnerInfo.ownerId,
        ownerName: awayOwnerInfo.ownerName,
        score: matchup.away?.totalPoints || 0,
        projectedScore: matchup.away?.totalPointsLive || 0,
        rosterForCurrentScoringPeriod: matchup.away?.rosterForCurrentScoringPeriod || null
      },
      winner: this.determineWinner(matchup),
      status: this.getMatchupStatus(matchup, settings),
      isPlayoff,
      playoffTierType,
      playoffRound: this.getPlayoffRound(playoffTierType),
      tiebreaker: matchup.tiebreaker || null,
      // Additional ESPN-specific data
      espnMatchupData: {
        id: matchup.id,
        matchupPeriodId: matchup.matchupPeriodId,
        scoringPeriodId: matchup.scoringPeriodId,
        playoffTierType: matchup.playoffTierType
      }
    };
  }

  determineWinner(matchup) {
    const homeScore = matchup.home?.totalPoints || 0;
    const awayScore = matchup.away?.totalPoints || 0;
    
    if (homeScore === awayScore) return 'TIE';
    if (homeScore > awayScore) return 'HOME';
    return 'AWAY';
  }

  getMatchupStatus(matchup, settings) {
    const currentScoringPeriod = settings?.scoringSettings?.scoringPeriodId || 1;
    const matchupPeriod = matchup.scoringPeriodId;
    
    if (matchupPeriod < currentScoringPeriod) return 'COMPLETED';
    if (matchupPeriod === currentScoringPeriod) return 'IN_PROGRESS';
    return 'SCHEDULED';
  }

  getPlayoffRound(playoffTierType) {
    if (playoffTierType === null || playoffTierType === undefined) return null;
    
    const playoffRounds = {
      1: 'CHAMPIONSHIP',
      2: 'SEMIFINALS', 
      3: 'QUARTERFINALS',
      4: 'FIRST_ROUND',
      // Consolation bracket
      10: 'CONSOLATION_CHAMPIONSHIP',
      11: 'CONSOLATION_SEMIFINALS'
    };
    
    return playoffRounds[playoffTierType] || `PLAYOFF_TIER_${playoffTierType}`;
  }

  async getFullSeasonSchedule() {
    try {
      
      const leagueData = await this.fetchLeagueSchedule();
      
      if (!leagueData.schedule) {
        throw new Error('No schedule data found in ESPN response');
      }

      const teams = leagueData.teams || [];
      const settings = leagueData.settings || {};
      const members = leagueData.members || [];
      
      // Parse all matchups
      const allMatchups = leagueData.schedule.map(matchup => 
        this.parseMatchupData(matchup, teams, settings, members)
      );

      // Group by week
      const scheduleByWeek = {};
      allMatchups.forEach(matchup => {
        const week = matchup.week;
        if (!scheduleByWeek[week]) {
          scheduleByWeek[week] = [];
        }
        scheduleByWeek[week].push(matchup);
      });

      // Sort weeks
      const sortedWeeks = Object.keys(scheduleByWeek)
        .map(Number)
        .sort((a, b) => a - b);

      const scheduleData = {
        leagueInfo: {
          leagueId: this.leagueId,
          seasonYear: this.seasonYear,
          leagueName: settings.name || 'Unnamed League',
          teamCount: teams.length,
          regularSeasonLength: settings.scheduleSettings?.matchupPeriodCount || 14,
          playoffTeamCount: settings.scheduleSettings?.playoffTeamCount || 4
        },
        teams: teams.map(team => {
          const ownerInfo = extractOwnerInfo(team, members);
          return {
            teamId: team.id,
            teamName: team.abbrev || team.location || `Team ${team.id}`,
            abbreviation: team.abbrev,
            location: team.location,
            nickname: team.nickname,
            owners: team.owners || [],
            ownerId: ownerInfo.ownerId,
            ownerName: ownerInfo.ownerName,
            record: {
              wins: team.record?.overall?.wins || 0,
              losses: team.record?.overall?.losses || 0,
              ties: team.record?.overall?.ties || 0,
              pointsFor: team.record?.overall?.pointsFor || 0,
              pointsAgainst: team.record?.overall?.pointsAgainst || 0
            }
          };
        }),
        schedule: scheduleByWeek,
        weekNumbers: sortedWeeks,
        totalMatchups: allMatchups.length,
        regularSeasonMatchups: allMatchups.filter(m => !m.isPlayoff).length,
        playoffMatchups: allMatchups.filter(m => m.isPlayoff).length,
        rawData: leagueData // Store original ESPN response
      };

      return scheduleData;
    } catch (error) {
      throw error;
    }
  }

  async saveScheduleToDatabase(scheduleData) {
    try {
      await this.initializeDataManager();
      
      
      // Create schedule import record
      const importData = {
        espn_league_id: scheduleData.leagueInfo.leagueId,
        season_year: scheduleData.leagueInfo.seasonYear,
        league_name: scheduleData.leagueInfo.leagueName,
        team_count: scheduleData.leagueInfo.teamCount,
        total_matchups: scheduleData.totalMatchups,
        regular_season_matchups: scheduleData.regularSeasonMatchups,
        playoff_matchups: scheduleData.playoffMatchups,
        raw_data: scheduleData.rawData
      };


      const { data: importRecord, error: importError } = await this.dataManager.client
        .from('espn_schedule_imports')
        .insert(importData)
        .select()
        .single();

      if (importError) throw importError;
      

      // Save teams
      const teamInserts = scheduleData.teams.map(team => {
        const teamData = {
          import_id: importRecord.id,
          espn_team_id: team.teamId,
          team_name: team.teamName,
          abbreviation: team.abbreviation,
          location: team.location,
          nickname: team.nickname,
          owners: team.owners,
          owner_id: team.ownerId,
          owner_name: team.ownerName,
          record: team.record
        };


        return teamData;
      });

      const { data: savedTeams, error: teamsError } = await this.dataManager.client
        .from('espn_teams')
        .insert(teamInserts)
        .select();

      if (teamsError) throw teamsError;
      

      // Create team mapping for matchup references
      const teamMapping = {};
      savedTeams.forEach(team => {
        teamMapping[team.espn_team_id] = team.id;
      });

      // Save matchups
      const matchupInserts = [];
      Object.values(scheduleData.schedule).flat().forEach(matchup => {
        const matchupData = {
          import_id: importRecord.id,
          espn_matchup_id: matchup.matchupId,
          week: matchup.week,
          scoring_period_id: matchup.scoringPeriodId,
          home_team_id: teamMapping[matchup.homeTeam.teamId],
          home_espn_team_id: matchup.homeTeam.teamId,
          home_team_name: matchup.homeTeam.teamName,
          home_owner_id: matchup.homeTeam.ownerId,
          home_owner_name: matchup.homeTeam.ownerName,
          home_score: matchup.homeTeam.score,
          home_projected_score: matchup.homeTeam.projectedScore,
          away_team_id: teamMapping[matchup.awayTeam.teamId],
          away_espn_team_id: matchup.awayTeam.teamId,
          away_team_name: matchup.awayTeam.teamName,
          away_owner_id: matchup.awayTeam.ownerId,
          away_owner_name: matchup.awayTeam.ownerName,
          away_score: matchup.awayTeam.score,
          away_projected_score: matchup.awayTeam.projectedScore,
          winner: matchup.winner,
          status: matchup.status,
          is_playoff: matchup.isPlayoff,
          playoff_tier_type: matchup.playoffTierType,
          playoff_round: matchup.playoffRound,
          tiebreaker: matchup.tiebreaker,
          espn_raw_data: matchup.espnMatchupData
        };


        matchupInserts.push(matchupData);
      });

      const { data: savedMatchups, error: matchupsError } = await this.dataManager.client
        .from('espn_matchups')
        .insert(matchupInserts)
        .select();

      if (matchupsError) throw matchupsError;
      

      return {
        importId: importRecord.id,
        teams: savedTeams.length,
        matchups: savedMatchups.length,
        success: true
      };
    } catch (error) {
      throw error;
    }
  }

  async getScheduleFromDatabase(leagueId = null, seasonYear = null) {
    try {
      await this.initializeDataManager();
      
      const queryLeagueId = leagueId || this.leagueId;
      const querySeasonYear = seasonYear || this.seasonYear;
      
      
      // Get the most recent import for this league/season
      const { data: importRecord, error: importError } = await this.dataManager.client
        .from('espn_schedule_imports')
        .select('*')
        .eq('espn_league_id', queryLeagueId)
        .eq('season_year', querySeasonYear)
        .order('imported_at', { ascending: false })
        .limit(1)
        .single();

      if (importError) {
        if (importError.code === 'PGRST116') {
          return null; // No data found
        }
        throw importError;
      }

      // Get teams for this import
      const { data: teams, error: teamsError } = await this.dataManager.client
        .from('espn_teams')
        .select('*')
        .eq('import_id', importRecord.id)
        .order('espn_team_id');

      if (teamsError) throw teamsError;

      // Get matchups for this import
      const { data: matchups, error: matchupsError } = await this.dataManager.client
        .from('espn_matchups')
        .select('*')
        .eq('import_id', importRecord.id)
        .order('week')
        .order('espn_matchup_id');

      if (matchupsError) throw matchupsError;

      // Format data similar to the ESPN API response
      const scheduleByWeek = {};
      matchups.forEach(matchup => {
        if (!scheduleByWeek[matchup.week]) {
          scheduleByWeek[matchup.week] = [];
        }
        scheduleByWeek[matchup.week].push({
          matchupId: matchup.espn_matchup_id,
          week: matchup.week,
          scoringPeriodId: matchup.scoring_period_id,
          homeTeam: {
            teamId: matchup.home_espn_team_id,
            teamName: matchup.home_team_name,
            score: parseFloat(matchup.home_score) || 0,
            projectedScore: parseFloat(matchup.home_projected_score) || 0
          },
          awayTeam: {
            teamId: matchup.away_espn_team_id,
            teamName: matchup.away_team_name,
            score: parseFloat(matchup.away_score) || 0,
            projectedScore: parseFloat(matchup.away_projected_score) || 0
          },
          winner: matchup.winner,
          status: matchup.status,
          isPlayoff: matchup.is_playoff,
          playoffTierType: matchup.playoff_tier_type,
          playoffRound: matchup.playoff_round,
          tiebreaker: matchup.tiebreaker,
          espnMatchupData: matchup.espn_raw_data
        });
      });

      const sortedWeeks = Object.keys(scheduleByWeek)
        .map(Number)
        .sort((a, b) => a - b);

      return {
        leagueInfo: {
          leagueId: importRecord.espn_league_id,
          seasonYear: importRecord.season_year,
          leagueName: importRecord.league_name,
          teamCount: importRecord.team_count,
          totalMatchups: importRecord.total_matchups,
          regularSeasonMatchups: importRecord.regular_season_matchups,
          playoffMatchups: importRecord.playoff_matchups,
          importedAt: importRecord.imported_at
        },
        teams: teams.map(team => ({
          teamId: team.espn_team_id,
          teamName: team.team_name,
          abbreviation: team.abbreviation,
          location: team.location,
          nickname: team.nickname,
          owners: team.owners,
          record: team.record
        })),
        schedule: scheduleByWeek,
        weekNumbers: sortedWeeks,
        totalMatchups: matchups.length,
        regularSeasonMatchups: matchups.filter(m => !m.is_playoff).length,
        playoffMatchups: matchups.filter(m => m.is_playoff).length,
        fromDatabase: true
      };
    } catch (error) {
      throw error;
    }
  }

  async getScheduleByWeekRange(startWeek, endWeek) {
    try {
      
      const weeklyData = [];
      for (let week = startWeek; week <= endWeek; week++) {
        try {
          const weekData = await this.fetchScheduleByWeek(week);
          if (weekData.schedule) {
            weeklyData.push({
              week,
              matchups: weekData.schedule.map(matchup => 
                this.parseMatchupData(matchup, weekData.teams || [], weekData.settings || {})
              )
            });
          }
        } catch (weekError) {
        }
      }

      return weeklyData;
    } catch (error) {
      throw error;
    }
  }

  async validateConnection() {
    try {
      const leagueData = await this.fetchLeagueSchedule();
      
      return {
        success: true,
        leagueName: leagueData.settings?.name || 'Unnamed League',
        teamCount: leagueData.teams?.length || 0,
        matchupCount: leagueData.schedule?.length || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export async function createScheduleFetcher(leagueId, seasonYear, espnS2 = null, swid = null) {
  const fetcher = new ESPNScheduleFetcher(leagueId, seasonYear, espnS2, swid);
  
  return {
    fetcher,
    
    async testConnection() {
      return await fetcher.validateConnection();
    },

    async getFullSeason(saveToDb = false) {
      const scheduleData = await fetcher.getFullSeasonSchedule();
      
      if (saveToDb) {
        const dbResult = await fetcher.saveScheduleToDatabase(scheduleData);
        scheduleData.dbImport = dbResult;
      }
      
      return scheduleData;
    },

    async getWeekRange(startWeek, endWeek) {
      return await fetcher.getScheduleByWeekRange(startWeek, endWeek);
    },

    async getSingleWeek(weekNumber) {
      const weekData = await fetcher.getScheduleByWeekRange(weekNumber, weekNumber);
      return weekData.length > 0 ? weekData[0] : null;
    },

    async saveToDatabase(scheduleData) {
      return await fetcher.saveScheduleToDatabase(scheduleData);
    },

    async loadFromDatabase(leagueId = null, seasonYear = null) {
      return await fetcher.getScheduleFromDatabase(leagueId, seasonYear);
    }
  };
}

export default ESPNScheduleFetcher;