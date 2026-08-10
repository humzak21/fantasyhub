/**
 * A read-only ESPN client. No database access lives here any more: the staging
 * writers (`saveScheduleToDatabase`, `getScheduleFromDatabase`) were the only
 * reason this file knew about Supabase, and they are gone along with the
 * `espn_teams`/`espn_matchups` tables they fed. Callers hand the parsed
 * matchups to `services/db/games.js::upsertEspnGames`.
 */

import { extractOwnerInfo } from '../utils/ownerUtils.js';

/**
 * A team's display name as ESPN reports it.
 *
 * ESPN returns `name` ("Lightskin Empire") and `abbrev` ("LE") and, for several
 * seasons now, nulls for `location`/`nickname`. This used to read
 * `abbrev || location`, so every team name coming out of an import was the
 * abbreviation — harmless while imports only ever created teams that already
 * existed, and a league-wide rename the moment they started refreshing names.
 */
function espnTeamName(team, espnTeamId) {
  const composed = [team?.location, team?.nickname].filter(Boolean).join(' ').trim();
  return team?.name?.trim() || composed || team?.abbrev || `Team ${espnTeamId}`;
}

export class ESPNScheduleFetcher {
  constructor(leagueId, seasonYear, espnS2 = null, swid = null) {
    this.leagueId = leagueId;
    this.seasonYear = seasonYear;
    this.espnS2 = espnS2;
    this.swid = swid;
    this.baseUrl = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
  }

  async fetchLeagueSchedule() {
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
  }

  async fetchScheduleByWeek(weekNumber) {
    const url = `${this.baseUrl}/${this.seasonYear}/segments/0/leagues/${this.leagueId}`;
    const params = new URLSearchParams();
    params.append('view', 'mMatchup');
    params.append('view', 'mMatchupScore');
    params.append('view', 'mScoreboard');
    params.append('view', 'mTeam');
    params.append('view', 'mMembers'); // Add members view to get owner info
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
  }

  parseMatchupData(matchup, teams, settings, members = []) {
    const homeTeam = teams.find(team => team.id === matchup.home?.teamId);
    const awayTeam = teams.find(team => team.id === matchup.away?.teamId);
    
    // Extract owner information for both teams
    const homeOwnerInfo = homeTeam ? extractOwnerInfo(homeTeam, members) : { ownerId: null, ownerName: null };
    const awayOwnerInfo = awayTeam ? extractOwnerInfo(awayTeam, members) : { ownerId: null, ownerName: null };
    
    // `playoffTierType` is a string — 'NONE', 'WINNERS_BRACKET',
    // 'LOSERS_CONSOLATION_LADDER', 'WINNERS_CONSOLATION_LADDER'. This used to
    // test `playoffTierType > 0`, which is false for every string, so no
    // matchup was ever recognised as a playoff game and the 2025 bracket had to
    // be typed by hand afterwards.
    const playoffTierType = matchup.playoffTierType;
    const isPlayoff = Boolean(playoffTierType) && playoffTierType !== 'NONE';

    return {
      matchupId: matchup.id,
      week: matchup.matchupPeriodId,
      scoringPeriodId: matchup.scoringPeriodId ?? null,
      homeTeam: {
        teamId: matchup.home?.teamId,
        teamName: espnTeamName(homeTeam, matchup.home?.teamId),
        ownerId: homeOwnerInfo.ownerId,
        ownerName: homeOwnerInfo.ownerName,
        score: matchup.home?.totalPoints || 0,
        projectedScore: matchup.home?.totalPointsLive || 0,
        rosterForCurrentScoringPeriod: matchup.home?.rosterForCurrentScoringPeriod || null
      },
      awayTeam: {
        teamId: matchup.away?.teamId,
        teamName: espnTeamName(awayTeam, matchup.away?.teamId),
        ownerId: awayOwnerInfo.ownerId,
        ownerName: awayOwnerInfo.ownerName,
        score: matchup.away?.totalPoints || 0,
        projectedScore: matchup.away?.totalPointsLive || 0,
        rosterForCurrentScoringPeriod: matchup.away?.rosterForCurrentScoringPeriod || null
      },
      winner: this.determineWinner(matchup),
      // ESPN's own verdict — 'HOME' | 'AWAY' | 'TIE' | 'UNDECIDED'. It is the
      // only reliable "has this been played" signal; comparing scores to zero
      // cannot tell a scheduled week from a real 0-0.
      espnWinner: matchup.winner ?? null,
      status: this.getMatchupStatus(matchup),
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

  /**
   * Where a matchup is in its life.
   *
   * This used to read `settings.scoringSettings.scoringPeriodId` — a field that
   * does not exist; the current period is on the league envelope, not under
   * settings — so it defaulted to 1 and called almost everything SCHEDULED.
   * ESPN's own `winner` answers the question directly and needs no plumbing.
   */
  getMatchupStatus(matchup) {
    return matchup.winner && matchup.winner !== 'UNDECIDED' ? 'COMPLETED' : 'SCHEDULED';
  }

  /**
   * ESPN's bracket name for a matchup.
   *
   * The tier says which bracket a game belongs to, not which round — the round
   * depends on how far into the postseason the week is, so it is resolved from
   * the week in `services/espnGameMapper.js::resolveGameType`. This stays for
   * display and for the import log.
   */
  getPlayoffRound(playoffTierType) {
    if (!playoffTierType || playoffTierType === 'NONE') return null;
    return playoffTierType;
  }

  async getFullSeasonSchedule() {
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
      // The period ESPN is currently scoring, from the league envelope. It is
      // not under `settings` — `getMatchupStatus` looked for it there, found
      // nothing, and defaulted to 1, which marked every matchup SCHEDULED.
      currentScoringPeriod:
        leagueData.scoringPeriodId ?? leagueData.status?.currentMatchupPeriod ?? null,
      teams: teams.map(team => {
        const ownerInfo = extractOwnerInfo(team, members);
        return {
          teamId: team.id,
          teamName: espnTeamName(team, team.id),
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
  }

  async getScheduleByWeekRange(startWeek, endWeek) {
    const weeklyData = [];

    for (let week = startWeek; week <= endWeek; week++) {
      try {
        const weekData = await this.fetchScheduleByWeek(week);
        if (weekData.schedule) {
          // Filter matchups to only include those for the requested week
          const filteredMatchups = weekData.schedule.filter(matchup =>
            matchup.matchupPeriodId === week || matchup.scoringPeriodId === week
          );

          weeklyData.push({
            week,
            currentScoringPeriod:
              weekData.scoringPeriodId ?? weekData.status?.currentMatchupPeriod ?? null,
            matchups: filteredMatchups.map(matchup =>
              this.parseMatchupData(matchup, weekData.teams || [], weekData.settings || {}, weekData.members || [])
            )
          });
        }
      } catch (weekError) {
        // A week that fails to fetch used to disappear in silence. The caller
        // now writes games from this, so a missing week means a missing
        // matchup — say so rather than importing a hole.
        console.warn(`⚠️  ESPN week ${week} could not be fetched: ${weekError.message}`);
      }
    }

    return weeklyData;
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

    async getFullSeason() {
      return await fetcher.getFullSeasonSchedule();
    },

    async getWeekRange(startWeek, endWeek) {
      return await fetcher.getScheduleByWeekRange(startWeek, endWeek);
    },

    async getSingleWeek(weekNumber) {
      const weekData = await fetcher.getScheduleByWeekRange(weekNumber, weekNumber);
      return weekData.length > 0 ? weekData[0] : null;
    }
  };
}

export default ESPNScheduleFetcher;