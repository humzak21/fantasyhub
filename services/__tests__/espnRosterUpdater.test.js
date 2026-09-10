/**
 * The roster refresh also refreshes team names.
 *
 * Managers rename their teams mid-season. Until 2026-09-10 the only writer of
 * `teams.name` was the annual schedule import, so a rename made in week 3 was
 * wrong on every page until the following August — the daily and weekly crons
 * both ran this updater, and it wrote rosters only. These pin the rule that
 * replaced it: identity goes through `upsertTeamsFromESPN` on every run, from
 * the `mTeam` view the updater already fetches, before any roster is written,
 * and the roster match then reads the refreshed rows.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = {
  seasons: { getSeason: vi.fn(), getActiveSeason: vi.fn() },
  teams: { upsertTeamsFromESPN: vi.fn(), getTeamsForSeason: vi.fn(), updateTeam: vi.fn() }
};

vi.mock('../db/index.js', () => ({ getDb: () => db }));

const { ESPNRosterUpdater } = await import('../espnRosterUpdater.js');

const SEASON = { id: 'season-2026', teams: [] };

/** ESPN's `mTeam` + `mMembers` shape, trimmed to what the updater reads. */
const leaguePayload = {
  members: [{ id: '{OWNER-1}', firstName: 'Humza', lastName: 'Khalil' }],
  teams: [
    {
      id: 7,
      name: 'Renamed Mid-Season',
      abbrev: 'RMS',
      location: null,
      nickname: null,
      owners: ['{OWNER-1}'],
      roster: { entries: [] }
    }
  ]
};

describe('ESPNRosterUpdater · team identity', () => {
  const calls = [];

  beforeEach(() => {
    calls.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => leaguePayload })));

    db.seasons.getSeason.mockResolvedValue(SEASON);
    db.seasons.getActiveSeason.mockResolvedValue(SEASON);
    db.teams.upsertTeamsFromESPN.mockImplementation(async () => {
      calls.push('identity');
      return { inserted: 0, updated: 1, unchanged: 0, errors: [], ownerConflicts: [] };
    });
    // What the table holds *after* the refresh: the new name, same ESPN id.
    db.teams.getTeamsForSeason.mockImplementation(async () => {
      calls.push('reread');
      return [{ id: 'team-7', name: 'Renamed Mid-Season', owner: 'Humza Khalil', espn_team_id: 7 }];
    });
    db.teams.updateTeam.mockImplementation(async () => {
      calls.push('roster');
      return { id: 'team-7' };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shapes the payload the way the schedule import does — name, not abbreviation', () => {
    const updater = new ESPNRosterUpdater('1', 2026);

    expect(updater.parseTeamIdentities(leaguePayload)).toEqual([
      { teamId: 7, teamName: 'Renamed Mid-Season', abbreviation: 'RMS', ownerName: 'Humza Khalil' }
    ]);
    // `parseTeamData` used to report the abbreviation as the team's name.
    expect(updater.parseTeamData(leaguePayload.teams[0], leaguePayload.members).teamName)
      .toBe('Renamed Mid-Season');
  });

  it('refreshes identity through upsertTeamsFromESPN before writing any roster', async () => {
    const updater = new ESPNRosterUpdater('1', 2026);

    const result = await updater.updateTeamRosters('season-2026');

    expect(db.teams.upsertTeamsFromESPN).toHaveBeenCalledWith('season-2026', [
      { teamId: 7, teamName: 'Renamed Mid-Season', abbreviation: 'RMS', ownerName: 'Humza Khalil' }
    ]);
    // Identity, then a re-read, then the roster — the match must see the new name.
    expect(calls).toEqual(['identity', 'reread', 'roster']);
    expect(result.updated).toEqual([
      expect.objectContaining({ teamId: 'team-7', teamName: 'Renamed Mid-Season' })
    ]);
    expect(result.teams).toMatchObject({ updated: 1, unchanged: 0, inserted: 0 });
  });

  it('matches the roster by ESPN id, so a renamed team is not "not found"', async () => {
    // The stored owner is the league's spelling; ESPN's differs. The fuzzy
    // owner matcher would miss, and the old name is gone — only the id holds.
    db.teams.getTeamsForSeason.mockResolvedValue([
      { id: 'team-7', name: 'Renamed Mid-Season', owner: 'H. Khalil (league)', espn_team_id: 7 }
    ]);
    const updater = new ESPNRosterUpdater('1', 2026);

    const result = await updater.updateTeamRosters('season-2026');

    expect(result.notFound).toEqual([]);
    expect(db.teams.updateTeam).toHaveBeenCalledWith(
      'season-2026', 'team-7', expect.objectContaining({ espnTeamId: 7 })
    );
  });
});
