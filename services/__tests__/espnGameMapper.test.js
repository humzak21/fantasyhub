/**
 * The ESPN → `games` planner.
 *
 * These cover the behaviours the SQL function this replaces got wrong: teams
 * matched by owner string only, unmatched matchups dropped in silence, the ESPN
 * matchup id thrown away, the playoff bracket flattened, "played" inferred from
 * `score > 0`, and `completed_at` stamped with the import time.
 */

import { describe, it, expect } from 'vitest';

import {
  buildTeamIndex,
  hasFinalScore,
  planGameWrites,
  resolveGameType,
  TRIGGER_OWNED_COLUMNS
} from '../espnGameMapper.js';

const SEASON_ID = 'season-2026';

const TEAMS = [
  { id: 'team-humza', name: 'Lightskin Empire', owner: 'Humza Khalil', espn_team_id: 1 },
  { id: 'team-rohit', name: 'GrandPinto', owner: 'Rohit Ramki', espn_team_id: 9 },
  { id: 'team-arya', name: 'Comeback season', owner: 'Arya Shah', espn_team_id: 12 }
];

/** An ESPN matchup in the shape `parseMatchupData` produces. */
const matchup = (overrides = {}) => ({
  matchupId: 101,
  week: 3,
  scoringPeriodId: 3,
  homeTeam: { teamId: 1, ownerName: 'Humza Khalil', score: 120.5 },
  awayTeam: { teamId: 9, ownerName: 'Rohit Ramki', score: 98.2 },
  espnWinner: 'HOME',
  isPlayoff: false,
  playoffTierType: 'NONE',
  ...overrides
});

const plan = (options) =>
  planGameWrites({
    seasonId: SEASON_ID,
    teamIndex: buildTeamIndex(TEAMS),
    existingGames: [],
    regularSeasonWeeks: 14,
    ...options
  });

describe('buildTeamIndex', () => {
  it('matches on the ESPN team id', () => {
    expect(buildTeamIndex(TEAMS).find(9, null)?.id).toBe('team-rohit');
  });

  it('falls back to the owner name when the ESPN id is unknown', () => {
    // The previous copy of this read `team.ownerName`, a key neither the
    // camelCase nor the snake_case team shape has, so this never once fired.
    expect(buildTeamIndex(TEAMS).find(999, '  humza khalil ')?.id).toBe('team-humza');
  });

  it('indexes camelCase and snake_case team rows identically', () => {
    const camel = buildTeamIndex([{ id: 'a', owner: 'Humza Khalil', espnTeamId: 1 }]);
    const snake = buildTeamIndex([{ id: 'a', owner: 'Humza Khalil', espn_team_id: 1 }]);

    expect(camel.find(1, null)?.id).toBe('a');
    expect(snake.find(1, null)?.id).toBe('a');
  });

  it('returns null rather than a wrong team when nothing matches', () => {
    expect(buildTeamIndex(TEAMS).find(404, 'Nobody At All')).toBeNull();
  });
});

describe('resolveGameType', () => {
  it('treats the string tiers ESPN actually sends as playoff games', () => {
    // `playoffTierType` is a string; the fetcher used to test `> 0`, which is
    // false for every string, so no matchup was ever seen as a playoff game.
    expect(resolveGameType({ playoffTierType: 'WINNERS_BRACKET' }, { playoffIndex: 2 }))
      .toBe('playoff_semifinals');
  });

  it('maps the bracket and the week to the granular type', () => {
    const winners = (i) => resolveGameType({ playoffTierType: 'WINNERS_BRACKET' }, { playoffIndex: i });
    const losers = (i) =>
      resolveGameType({ playoffTierType: 'LOSERS_CONSOLATION_LADDER' }, { playoffIndex: i });

    expect([winners(1), winners(2), winners(3)]).toEqual([
      'playoff_first_round',
      'playoff_semifinals',
      'playoff_championship'
    ]);
    expect([losers(1), losers(2), losers(3)]).toEqual([
      'playoff_consolation_quarterfinals',
      'playoff_consolation_semifinals',
      'playoff_consolation_championship'
    ]);
  });

  it('falls back to a legal type for tiers and rounds it does not know', () => {
    // Never invent a value: `games_type_check` would reject it mid-batch.
    expect(resolveGameType({ playoffTierType: 'WINNERS_CONSOLATION_LADDER' }, { playoffIndex: 2 }))
      .toBe('playoff');
    expect(resolveGameType({ playoffTierType: 'WINNERS_BRACKET' }, { playoffIndex: 9 }))
      .toBe('playoff');
  });

  it('reads NONE and a bye correctly', () => {
    expect(resolveGameType({ playoffTierType: 'NONE' }, { playoffIndex: 0 })).toBe('regular');
    expect(resolveGameType({ playoffTierType: 'WINNERS_BRACKET' }, { isBye: true, playoffIndex: 1 }))
      .toBe('bye');
  });
});

describe('hasFinalScore', () => {
  it('believes ESPN over the scoreline', () => {
    expect(hasFinalScore({ espnWinner: 'AWAY' })).toBe(true);
    expect(hasFinalScore({ espnWinner: 'TIE' })).toBe(true);
    expect(hasFinalScore({ espnWinner: 'UNDECIDED' })).toBe(false);
  });

  it('falls back to the scoring period when there is no verdict', () => {
    expect(hasFinalScore({ week: 3 }, { currentScoringPeriod: 5 })).toBe(true);
    expect(hasFinalScore({ week: 7 }, { currentScoringPeriod: 5 })).toBe(false);
  });
});

describe('planGameWrites', () => {
  it('inserts a matchup that has no row yet, home as team1', () => {
    const { inserts, updates } = plan({ matchups: [matchup()] });

    expect(updates).toEqual([]);
    expect(inserts).toEqual([
      {
        season_id: SEASON_ID,
        week: 3,
        team1_id: 'team-humza',
        team2_id: 'team-rohit',
        team1_score: 120.5,
        team2_score: 98.2,
        type: 'regular',
        espn_matchup_id: 101,
        espn_scoring_period_id: 3
      }
    ]);
  });

  it('reports an unresolvable matchup instead of dropping it', () => {
    // The SQL function skipped these silently: no row, no error, no way to know.
    const { inserts, unmatched } = plan({
      matchups: [matchup({ awayTeam: { teamId: 77, ownerName: 'Ghost Owner', score: 0 } })]
    });

    expect(inserts).toEqual([]);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]).toMatchObject({ matchupId: 101, week: 3, awayEspnTeamId: 77 });
    expect(unmatched[0].reason).toMatch(/away team 77 not found/);
  });

  describe('matching an existing row', () => {
    const existing = (overrides = {}) => ({
      id: 'game-1',
      week: 3,
      team1_id: 'team-humza',
      team2_id: 'team-rohit',
      team1_score: null,
      team2_score: null,
      type: 'regular',
      espn_matchup_id: null,
      espn_scoring_period_id: null,
      ...overrides
    });

    it('matches on the ESPN matchup id', () => {
      const { updates, inserts } = plan({
        matchups: [matchup()],
        existingGames: [existing({ espn_matchup_id: 101, week: 99, team1_id: 'x', team2_id: 'y' })]
      });

      expect(inserts).toEqual([]);
      expect(updates[0].matchedBy).toBe('espn_matchup_id');
    });

    it('adopts a row that predates ESPN ids rather than duplicating it', () => {
      const { inserts, updates } = plan({ matchups: [matchup()], existingGames: [existing()] });

      expect(inserts).toEqual([]);
      expect(updates[0].matchedBy).toBe('teams');
      expect(updates[0].patch.espn_matchup_id).toBe(101);
    });

    it('matches a row that stores the teams the other way round', () => {
      const { inserts, updates } = plan({
        matchups: [matchup()],
        existingGames: [existing({ team1_id: 'team-rohit', team2_id: 'team-humza' })]
      });

      expect(inserts).toEqual([]);
      // Scores follow the stored teams, not ESPN's home/away.
      expect(updates[0].patch).toMatchObject({ team1_score: 98.2, team2_score: 120.5 });
    });

    it('never lets two matchups claim the same row', () => {
      const { inserts, updates } = plan({
        matchups: [matchup(), matchup({ matchupId: 102 })],
        existingGames: [existing()]
      });

      expect(updates).toHaveLength(1);
      expect(inserts).toHaveLength(1);
    });

    it('leaves a row that already agrees with ESPN alone', () => {
      const result = plan({
        matchups: [matchup()],
        existingGames: [
          existing({ team1_score: 120.5, team2_score: 98.2, espn_matchup_id: 101, espn_scoring_period_id: 3 })
        ]
      });

      expect(result).toMatchObject({ inserts: [], updates: [], unchanged: 1 });
    });
  });

  /**
   * ESPN reuses matchup ids when it re-draws a schedule, so rung 1 of
   * `findExistingGame` can match a row whose teams have nothing to do with the
   * matchup any more. The patch used to carry only scores and ESPN ids, so such
   * a row produced an empty patch and was counted as "unchanged" — which is how
   * all seven 2026 week-1 games kept their pre-draft pairings through two full
   * imports and a --dry-run that reported "0 would update, 98 unchanged".
   */
  describe('when ESPN re-draws a fixture', () => {
    const scheduled = (overrides = {}) => ({
      id: 'game-1',
      week: 3,
      team1_id: 'team-humza',
      team2_id: 'team-rohit',
      team1_score: null,
      team2_score: null,
      type: 'regular',
      espn_matchup_id: 101,
      espn_scoring_period_id: 3,
      ...overrides
    });

    it('re-points a scoreless row whose teams ESPN has changed', () => {
      // Same matchup id, but Arya has replaced Rohit.
      const { updates, inserts, unchanged, conflicts } = plan({
        matchups: [matchup({ awayTeam: { teamId: 12, ownerName: 'Arya Shah', score: 98.2 } })],
        existingGames: [scheduled()]
      });

      expect(inserts).toEqual([]);
      expect(unchanged).toBe(0);
      expect(conflicts).toEqual([]);
      expect(updates).toHaveLength(1);
      expect(updates[0].patch).toMatchObject({
        team1_id: 'team-humza',
        team2_id: 'team-arya'
      });
    });

    it('refuses to re-point a row that already has a result, and reports it', () => {
      const { updates, inserts, unchanged, conflicts } = plan({
        matchups: [matchup({ awayTeam: { teamId: 12, ownerName: 'Arya Shah', score: 98.2 } })],
        existingGames: [scheduled({ team1_score: 120.5, team2_score: 98.2 })]
      });

      // Those scores belong to Humza vs Rohit. Moving the row would credit a
      // game to a team that never played it.
      expect(inserts).toEqual([]);
      expect(updates).toEqual([]);
      expect(unchanged).toBe(0);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        id: 'game-1',
        matchupId: 101,
        storedTeams: ['team-humza', 'team-rohit'],
        espnTeams: ['team-humza', 'team-arya']
      });
      expect(conflicts[0].reason).toMatch(/different teams/);
    });

    it('treats a completed row as having a result even with no scores selected', () => {
      const { updates, conflicts } = plan({
        matchups: [matchup({ awayTeam: { teamId: 12, ownerName: 'Arya Shah', score: 98.2 } })],
        existingGames: [scheduled({ is_completed: true })]
      });

      expect(updates).toEqual([]);
      expect(conflicts).toHaveLength(1);
    });

    it('moves a scoreless row that ESPN has rescheduled to another week', () => {
      const { updates, inserts, conflicts } = plan({
        matchups: [matchup({ week: 5, scoringPeriodId: 5 })],
        existingGames: [scheduled()]
      });

      expect(inserts).toEqual([]);
      expect(conflicts).toEqual([]);
      expect(updates[0].patch).toMatchObject({ week: 5 });
      // The teams still agree, so they are not rewritten.
      expect(updates[0].patch.team1_id).toBeUndefined();
    });

    it('reports a week change on a row that already has a result', () => {
      const { updates, conflicts } = plan({
        matchups: [matchup({ week: 5, scoringPeriodId: 5 })],
        existingGames: [scheduled({ team1_score: 120.5, team2_score: 98.2 })]
      });

      expect(updates).toEqual([]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].reason).toMatch(/another week/);
    });

    it('does not mistake a reversed pair for a re-draw', () => {
      // The row stores the same two teams the other way round, which is
      // legitimate and already handled by the score assignment.
      const { updates, conflicts, unchanged } = plan({
        matchups: [matchup()],
        existingGames: [scheduled({ team1_id: 'team-rohit', team2_id: 'team-humza' })]
      });

      expect(conflicts).toEqual([]);
      expect(unchanged + updates.length).toBe(1);
      if (updates.length) expect(updates[0].patch.team1_id).toBeUndefined();
    });

    it('gives a re-pointed row the scores in ESPN order', () => {
      // A scoreless row being re-pointed takes ESPN's home/away, so the score
      // assignment must not consult the pairing it is about to overwrite.
      const { updates } = plan({
        matchups: [
          matchup({
            awayTeam: { teamId: 12, ownerName: 'Arya Shah', score: 98.2 },
            espnWinner: 'HOME'
          })
        ],
        existingGames: [scheduled({ team1_id: 'team-rohit', team2_id: 'team-humza' })]
      });

      expect(updates[0].patch).toMatchObject({
        team1_id: 'team-humza',
        team2_id: 'team-arya',
        team1_score: 120.5,
        team2_score: 98.2
      });
    });
  });

  describe('the type rule', () => {
    it('never writes type on an update', () => {
      // 2025's postseason types were corrected by hand (migration
      // 20260805100000). ESPN calling this WINNERS_BRACKET must not undo it.
      const { updates } = plan({
        matchups: [matchup({ week: 16, playoffTierType: 'WINNERS_BRACKET', espnWinner: 'HOME' })],
        existingGames: [
          {
            id: 'game-1',
            week: 16,
            team1_id: 'team-humza',
            team2_id: 'team-rohit',
            team1_score: null,
            team2_score: null,
            type: 'playoff_consolation_semifinals',
            espn_matchup_id: null,
            espn_scoring_period_id: null
          }
        ]
      });

      expect(updates).toHaveLength(1);
      expect(updates[0].patch).not.toHaveProperty('type');
    });

    it('does write the granular type on an insert', () => {
      const { inserts } = plan({
        matchups: [matchup({ week: 16, playoffTierType: 'WINNERS_BRACKET' })]
      });

      expect(inserts[0].type).toBe('playoff_semifinals');
    });
  });

  describe('scores', () => {
    it('leaves a scheduled matchup scoreless', () => {
      // `score > 0` could not tell an unplayed week from a real one, so a future
      // week imported as a completed 0-0 tie.
      const { inserts } = plan({
        matchups: [
          matchup({
            espnWinner: 'UNDECIDED',
            homeTeam: { teamId: 1, ownerName: 'Humza Khalil', score: 0 },
            awayTeam: { teamId: 9, ownerName: 'Rohit Ramki', score: 0 }
          })
        ]
      });

      expect(inserts[0]).toMatchObject({ team1_score: null, team2_score: null });
    });

    it('imports a genuine shutout that ESPN has decided', () => {
      const { inserts } = plan({
        matchups: [
          matchup({
            espnWinner: 'HOME',
            homeTeam: { teamId: 1, ownerName: 'Humza Khalil', score: 88.4 },
            awayTeam: { teamId: 9, ownerName: 'Rohit Ramki', score: 0 }
          })
        ]
      });

      expect(inserts[0]).toMatchObject({ team1_score: 88.4, team2_score: 0 });
    });

    it('never nulls out a stored score when ESPN goes undecided again', () => {
      const { updates, unchanged } = plan({
        matchups: [matchup({ espnWinner: 'UNDECIDED' })],
        existingGames: [
          {
            id: 'game-1',
            week: 3,
            team1_id: 'team-humza',
            team2_id: 'team-rohit',
            team1_score: 120.5,
            team2_score: 98.2,
            type: 'regular',
            espn_matchup_id: 101,
            espn_scoring_period_id: 3
          }
        ]
      });

      expect(updates).toEqual([]);
      expect(unchanged).toBe(1);
    });
  });

  describe('byes', () => {
    it('writes a bye as a single-team row', () => {
      const { inserts } = plan({
        matchups: [
          matchup({
            week: 15,
            playoffTierType: 'WINNERS_BRACKET',
            espnWinner: 'UNDECIDED',
            awayTeam: { teamId: null, ownerName: null, score: 0 }
          })
        ]
      });

      expect(inserts[0]).toMatchObject({ team1_id: 'team-humza', team2_id: null, type: 'bye' });
    });

    it('matches an existing bye instead of adding a second one', () => {
      // (season, week, team1, team2) cannot catch this — nulls are distinct in
      // a unique constraint, which is why the ESPN id is the upsert key.
      const { inserts, updates } = plan({
        matchups: [
          matchup({ week: 15, awayTeam: { teamId: null, ownerName: null, score: 0 } })
        ],
        existingGames: [
          {
            id: 'bye-1',
            week: 15,
            team1_id: 'team-humza',
            team2_id: null,
            team1_score: null,
            team2_score: null,
            type: 'bye',
            espn_matchup_id: null,
            espn_scoring_period_id: null
          }
        ]
      });

      expect(inserts).toEqual([]);
      expect(updates[0].matchedBy).toBe('bye');
    });
  });

  it('ignores matchups outside the requested week', () => {
    const { inserts } = plan({
      matchups: [matchup({ week: 3 }), matchup({ matchupId: 102, week: 4 })],
      week: 3
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].week).toBe(3);
  });

  it('never writes a column the database owns', () => {
    // The trigger derives all of these, and `completed_at: null` in a patch
    // would make it re-stamp the row with the import time — the exact bug in
    // the function this replaces.
    const { inserts, updates } = plan({
      matchups: [matchup(), matchup({ matchupId: 102, week: 16, playoffTierType: 'WINNERS_BRACKET' })],
      existingGames: [
        {
          id: 'game-1',
          week: 3,
          team1_id: 'team-humza',
          team2_id: 'team-rohit',
          team1_score: null,
          team2_score: null,
          type: 'regular',
          espn_matchup_id: null,
          espn_scoring_period_id: null
        }
      ]
    });

    const payloads = [...inserts, ...updates.map((update) => update.patch)];
    expect(payloads.length).toBeGreaterThan(0);

    for (const payload of payloads) {
      for (const column of [...TRIGGER_OWNED_COLUMNS, 'slot']) {
        expect(payload).not.toHaveProperty(column);
      }
    }
  });

  it('stamps user_id on inserts only', () => {
    const { inserts, updates } = plan({
      matchups: [matchup(), matchup({ matchupId: 102, week: 4 })],
      existingGames: [
        {
          id: 'game-1',
          week: 4,
          team1_id: 'team-humza',
          team2_id: 'team-rohit',
          team1_score: null,
          team2_score: null,
          type: 'regular',
          espn_matchup_id: null,
          espn_scoring_period_id: null
        }
      ],
      userId: 'admin-uuid'
    });

    expect(inserts[0].user_id).toBe('admin-uuid');
    expect(updates[0].patch).not.toHaveProperty('user_id');
  });
});
