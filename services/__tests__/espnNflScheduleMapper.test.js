/**
 * The ESPN `proTeams[]` → `nfl_schedule` planner.
 *
 * The fixture is trimmed from a real 2025 `proTeamSchedules_wl` payload: four
 * teams over three weeks, keeping ESPN's own quirks — the `id: 0` free-agent
 * pseudo-team, games listed under both participants, weeks as an array, unix-ms
 * kickoffs, and a `byeWeek` field stated separately from the schedule.
 *
 * The property that matters most here is symmetry. ESPN lists every game twice
 * and the mapper emits both perspectives from one object, so a schedule where
 * BUF plays KC but KC plays nobody is unrepresentable — that is asserted
 * exhaustively rather than on one example.
 */

import { describe, it, expect } from 'vitest';

import { deriveWeekSpan, mapProTeamSchedules } from '../espnNflScheduleMapper.js';

const SEASON_YEAR = 2025;

/** BUF(2) v KC(12) in week 1, then each plays somebody else; BUF is off in 3. */
const GAME_BUF_KC = {
  id: 401772714,
  date: 1757116800000, // 2025-09-06T00:00:00.000Z
  homeProTeamId: 12,
  awayProTeamId: 2,
  scoringPeriodId: 1,
  startTimeTBD: false,
  statsOfficial: true
};

const GAME_BUF_MIA = {
  id: 401772800,
  date: 1757721600000,
  homeProTeamId: 2,
  awayProTeamId: 15,
  scoringPeriodId: 2,
  startTimeTBD: true,
  statsOfficial: false
};

const GAME_KC_DET = {
  id: 401772801,
  date: 1757721600000,
  homeProTeamId: 8,
  awayProTeamId: 12,
  scoringPeriodId: 2,
  startTimeTBD: false,
  statsOfficial: false
};

const GAME_KC_MIA = {
  id: 401772802,
  date: 1758326400000,
  homeProTeamId: 12,
  awayProTeamId: 15,
  scoringPeriodId: 3,
  startTimeTBD: false,
  statsOfficial: false
};

const GAME_DET_FILLER = {
  id: 401772803,
  date: 1757116800000,
  homeProTeamId: 8,
  awayProTeamId: 15,
  scoringPeriodId: 1,
  startTimeTBD: false,
  statsOfficial: true
};

/**
 * Each game appears under both of its teams, exactly as ESPN sends it. DET and
 * MIA are here so week 3 has a game for somebody while BUF and DET sit out.
 */
const PRO_TEAMS = [
  { id: 0, abbrev: 'FA', name: 'FA', byeWeek: 0, proGamesByScoringPeriod: {} },
  {
    id: 2,
    abbrev: 'BUF',
    location: 'Buffalo',
    name: 'Bills',
    byeWeek: 3,
    proGamesByScoringPeriod: { 1: [GAME_BUF_KC], 2: [GAME_BUF_MIA] }
  },
  {
    id: 12,
    abbrev: 'KC',
    location: 'Kansas City',
    name: 'Chiefs',
    byeWeek: 0,
    proGamesByScoringPeriod: { 1: [GAME_BUF_KC], 2: [GAME_KC_DET], 3: [GAME_KC_MIA] }
  },
  {
    id: 15,
    abbrev: 'MIA',
    location: 'Miami',
    name: 'Dolphins',
    byeWeek: 0,
    proGamesByScoringPeriod: { 1: [GAME_DET_FILLER], 2: [GAME_BUF_MIA], 3: [GAME_KC_MIA] }
  },
  {
    id: 8,
    abbrev: 'DET',
    location: 'Detroit',
    name: 'Lions',
    byeWeek: 3,
    proGamesByScoringPeriod: { 1: [GAME_DET_FILLER], 2: [GAME_KC_DET] }
  }
];

const find = (rows, week, proTeamId) =>
  rows.find((row) => row.week === week && row.pro_team_id === proTeamId);

describe('mapProTeamSchedules', () => {
  it('drops the free-agent pseudo-team', () => {
    const { rows, teamCount } = mapProTeamSchedules(PRO_TEAMS, SEASON_YEAR);

    expect(teamCount).toBe(4);
    expect(rows.some((row) => row.pro_team_id === 0)).toBe(false);
    expect(rows.some((row) => row.opponent_pro_team_id === 0)).toBe(false);
  });

  it('emits one row per team per week, and no more', () => {
    const { rows, weekSpan } = mapProTeamSchedules(PRO_TEAMS, SEASON_YEAR);

    expect(weekSpan).toBe(3);
    expect(rows).toHaveLength(4 * 3);

    // A game listed under both teams must not produce two pairs of rows.
    const keys = rows.map((row) => `${row.week}:${row.pro_team_id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('writes both perspectives of a game, and they agree', () => {
    const { rows } = mapProTeamSchedules(PRO_TEAMS, SEASON_YEAR);

    for (const row of rows) {
      if (row.opponent_pro_team_id === null) continue;

      const mirror = find(rows, row.week, row.opponent_pro_team_id);

      expect(mirror).toBeDefined();
      expect(mirror.opponent_pro_team_id).toBe(row.pro_team_id);
      expect(mirror.espn_game_id).toBe(row.espn_game_id);
      expect(mirror.game_time).toBe(row.game_time);
      // Exactly one side is home.
      expect(mirror.is_home).toBe(!row.is_home);
    }
  });

  it('reads home and away off the game rather than off the listing', () => {
    const { rows } = mapProTeamSchedules(PRO_TEAMS, SEASON_YEAR);

    // GAME_BUF_KC is listed first under BUF, but KC is the home team.
    expect(find(rows, 1, 12).is_home).toBe(true);
    expect(find(rows, 1, 2).is_home).toBe(false);
    expect(find(rows, 1, 2).opponent_pro_team_id).toBe(12);
  });

  it('emits an explicit bye row rather than leaving a gap', () => {
    const { rows } = mapProTeamSchedules(PRO_TEAMS, SEASON_YEAR);

    const bye = find(rows, 3, 2);

    expect(bye).toEqual({
      season_year: SEASON_YEAR,
      week: 3,
      pro_team_id: 2,
      opponent_pro_team_id: null,
      is_home: null,
      game_time: null,
      espn_game_id: null,
      start_time_tbd: false,
      stats_official: false
    });
  });

  it('converts ESPN unix-ms kickoffs to ISO, and carries its flags', () => {
    const { rows } = mapProTeamSchedules(PRO_TEAMS, SEASON_YEAR);

    expect(find(rows, 1, 2).game_time).toBe('2025-09-06T00:00:00.000Z');
    expect(find(rows, 1, 2).stats_official).toBe(true);
    expect(find(rows, 2, 2).start_time_tbd).toBe(true);
    expect(find(rows, 2, 2).stats_official).toBe(false);
  });

  it('warns when ESPN’s byeWeek disagrees with its own schedule', () => {
    const teams = PRO_TEAMS.map((team) =>
      team.id === 2 ? { ...team, byeWeek: 9 } : team
    );

    const { rows, warnings } = mapProTeamSchedules(teams, SEASON_YEAR);

    // The schedule is the stronger evidence, so the row still says week 3.
    expect(find(rows, 3, 2).opponent_pro_team_id).toBeNull();
    expect(warnings.join(' ')).toMatch(/BUF.*week 3.*bye is week 9/);
  });

  it('warns rather than throws when a team has no week off', () => {
    const { warnings } = mapProTeamSchedules(PRO_TEAMS, SEASON_YEAR);

    // KC and MIA play all three weeks in this trimmed fixture.
    expect(warnings.some((line) => /^KC: 0 weeks without a game/.test(line))).toBe(true);
    expect(warnings.some((line) => /^BUF:/.test(line))).toBe(false);
  });

  it('skips a game with no team pair and says so', () => {
    const broken = { id: 999, date: 1757116800000, scoringPeriodId: 1 };
    const teams = PRO_TEAMS.map((team) =>
      team.id === 12
        ? { ...team, proGamesByScoringPeriod: { ...team.proGamesByScoringPeriod, 1: [broken] } }
        : team
    );

    const { rows, warnings } = mapProTeamSchedules(teams, SEASON_YEAR);

    expect(warnings.join(' ')).toMatch(/game 999 has no team pair/);
    // KC's week 1 becomes a bye: BUF still lists the real game, so BUF keeps it.
    expect(rows.every((row) => row.espn_game_id !== 999)).toBe(true);
  });

  it('returns nothing, loudly, for a season ESPN has not published', () => {
    const empty = PRO_TEAMS.map((team) => ({ ...team, proGamesByScoringPeriod: {} }));

    const { rows, warnings } = mapProTeamSchedules(empty, 2030);

    // Not 32 bye weeks: an unpublished season is unknown, not a league-wide bye.
    expect(rows).toEqual([]);
    expect(warnings.join(' ')).toMatch(/has published no games for 2030/);
  });

  it('warns when the league is not 32 teams', () => {
    const { warnings } = mapProTeamSchedules(PRO_TEAMS.slice(0, 3), SEASON_YEAR);

    expect(warnings.join(' ')).toMatch(/expected 32 pro teams, ESPN returned 2/);
  });

  it('requires a season year', () => {
    expect(() => mapProTeamSchedules(PRO_TEAMS)).toThrow(/season year is required/);
  });
});

describe('deriveWeekSpan', () => {
  it('is the highest scoring period anybody plays in', () => {
    expect(deriveWeekSpan(PRO_TEAMS)).toBe(3);
  });

  it('follows the payload rather than assuming 18', () => {
    // 2020 ran to 17 scoring periods; every season since has run to 18.
    const shortSeason = [{ id: 2, abbrev: 'BUF', proGamesByScoringPeriod: { 17: [GAME_BUF_KC] } }];

    expect(deriveWeekSpan(shortSeason)).toBe(17);
  });

  it('ignores the free-agent pseudo-team and an empty league', () => {
    expect(deriveWeekSpan([{ id: 0, proGamesByScoringPeriod: { 40: [GAME_BUF_KC] } }])).toBe(0);
    expect(deriveWeekSpan([])).toBe(0);
  });
});
