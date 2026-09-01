/**
 * The TD parlay grader.
 *
 * Every case here is about the same asymmetry: a wrong `false` is invisible
 * (nobody audits "no TD", it is the common outcome) while an ungraded pick is
 * conspicuous. So the tests that matter most are the ones asserting a *skip* —
 * they are what stops the grader from quietly telling somebody they lost.
 */

import { describe, it, expect } from 'vitest';

import {
  SKIP_REASONS,
  findMissingStatLines,
  gradeParlayPicks,
  scheduleKey,
  statKey
} from '../parlayGrader.js';
import { ESPN_STAT_IDS } from '../db/espnMapping.js';

const WEEK = 4;
const BUF = 2;

const pick = (over = {}) => ({
  id: 'pick-1',
  week: WEEK,
  playerId: 'p1',
  playerNameRaw: 'James Cook',
  player: { id: 'p1', espnPlayerId: 3117251, proTeamId: BUF },
  ...over
});

const stats = (breakdown, over = {}) => ({
  [statKey(WEEK, 3117251)]: {
    espnPlayerId: 3117251,
    proTeamId: BUF,
    statBreakdown: breakdown,
    ...over
  }
});

const played = (over = {}) => ({
  [scheduleKey(WEEK, BUF)]: {
    week: WEEK,
    proTeamId: BUF,
    opponentProTeamId: 12,
    statsOfficial: true,
    ...over
  }
});

const grade = (args) => gradeParlayPicks({ picks: [pick()], ...args });

describe('gradeParlayPicks', () => {
  it('grades a rushing touchdown as a hit', () => {
    const { grades, skipped } = grade({
      statsByEspnPlayerId: stats({ [ESPN_STAT_IDS.RUSHING_TD]: 1 }),
      scheduleByTeam: played()
    });

    expect(skipped).toEqual([]);
    expect(grades).toEqual([{ pickId: 'pick-1', week: WEEK, espnPlayerId: 3117251, scoredTd: true }]);
  });

  it('grades a receiving touchdown as a hit', () => {
    const { grades } = grade({
      statsByEspnPlayerId: stats({ [ESPN_STAT_IDS.RECEIVING_TD]: 2 }),
      scheduleByTeam: played()
    });

    expect(grades[0].scoredTd).toBe(true);
  });

  it('grades a played week with no touchdown as a miss', () => {
    const { grades } = grade({
      statsByEspnPlayerId: stats({ '24': 88, '42': 30 }),
      scheduleByTeam: played()
    });

    expect(grades[0].scoredTd).toBe(false);
  });

  it('grades a quarterback who only threw touchdowns as a miss', () => {
    // Thrown is not scored. Grading this as a hit would be wrong in the one
    // direction nobody would check.
    const { grades } = grade({
      statsByEspnPlayerId: stats({ [ESPN_STAT_IDS.PASSING_TD]: 4 }),
      scheduleByTeam: played()
    });

    expect(grades[0].scoredTd).toBe(false);
  });

  it('grades an explicit bye as a miss, with no stat line at all', () => {
    // The week is over and the team did not play. A fact, not an inference —
    // and the only case that grades false without a stat line.
    const { grades, skipped } = grade({
      statsByEspnPlayerId: {},
      scheduleByTeam: { [scheduleKey(WEEK, BUF)]: { opponentProTeamId: null, statsOfficial: false } }
    });

    expect(skipped).toEqual([]);
    expect(grades[0].scoredTd).toBe(false);
  });

  it('skips when the calendar has no row for that team and week', () => {
    // The uncertain twin of a bye. Inferring one from a gap would grade a
    // whole league false the first time an import dropped half the calendar.
    const { grades, skipped } = grade({
      statsByEspnPlayerId: stats({ [ESPN_STAT_IDS.RUSHING_TD]: 1 }),
      scheduleByTeam: {}
    });

    expect(grades).toEqual([]);
    expect(skipped[0].reason).toBe(SKIP_REASONS.NO_SCHEDULE_ROW);
  });

  it('skips while the game is not official', () => {
    const { grades, skipped } = grade({
      statsByEspnPlayerId: stats({ [ESPN_STAT_IDS.RUSHING_TD]: 1 }),
      scheduleByTeam: played({ statsOfficial: false })
    });

    expect(grades).toEqual([]);
    expect(skipped[0].reason).toBe(SKIP_REASONS.NOT_OFFICIAL);
  });

  it('skips a null breakdown rather than reading it as no touchdown', () => {
    // Every row written before 2026-09 has none. Grading them false would
    // report the whole of league history as having scored nothing.
    const { grades, skipped } = grade({
      statsByEspnPlayerId: stats(null),
      scheduleByTeam: played()
    });

    expect(grades).toEqual([]);
    expect(skipped[0].reason).toBe(SKIP_REASONS.NO_BREAKDOWN);
  });

  it('skips when there is no stat line at all', () => {
    const { grades, skipped } = grade({ statsByEspnPlayerId: {}, scheduleByTeam: played() });

    expect(grades).toEqual([]);
    expect(skipped[0].reason).toBe(SKIP_REASONS.NO_STATS_ROW);
  });

  it('skips a free-text pick', () => {
    const { skipped } = gradeParlayPicks({
      picks: [pick({ playerId: null, player: null })],
      statsByEspnPlayerId: {},
      scheduleByTeam: played()
    });

    expect(skipped[0].reason).toBe(SKIP_REASONS.FREE_TEXT);
  });

  it('skips a matched player with no ESPN id', () => {
    const { skipped } = gradeParlayPicks({
      picks: [pick({ player: { id: 'p1', espnPlayerId: null, proTeamId: BUF } })],
      statsByEspnPlayerId: {},
      scheduleByTeam: played()
    });

    expect(skipped[0].reason).toBe(SKIP_REASONS.NO_ESPN_ID);
  });

  it('skips a player with no NFL team anywhere', () => {
    const { skipped } = gradeParlayPicks({
      picks: [pick({ player: { id: 'p1', espnPlayerId: 3117251, proTeamId: null } })],
      statsByEspnPlayerId: {},
      scheduleByTeam: played()
    });

    expect(skipped[0].reason).toBe(SKIP_REASONS.NO_PRO_TEAM);
  });

  it("prefers the week's own pro team over the player's current one", () => {
    // A player traded in October played week 4 for whoever he played it for.
    // `players.pro_team_id` is a last-write-wins snapshot of today.
    const KC = 12;
    const { grades } = gradeParlayPicks({
      picks: [pick({ player: { id: 'p1', espnPlayerId: 3117251, proTeamId: KC } })],
      statsByEspnPlayerId: stats({ [ESPN_STAT_IDS.RUSHING_TD]: 1 }, { proTeamId: BUF }),
      scheduleByTeam: played()
    });

    // Graded off BUF's week-4 game, which is the one he played in.
    expect(grades[0].scoredTd).toBe(true);
  });

  it('grades a batch spanning several weeks independently', () => {
    const picks = [
      pick({ id: 'a', week: 3 }),
      pick({ id: 'b', week: 4 })
    ];

    const { grades } = gradeParlayPicks({
      picks,
      statsByEspnPlayerId: {
        [statKey(3, 3117251)]: { proTeamId: BUF, statBreakdown: { [ESPN_STAT_IDS.RUSHING_TD]: 1 } },
        [statKey(4, 3117251)]: { proTeamId: BUF, statBreakdown: {} }
      },
      scheduleByTeam: {
        [scheduleKey(3, BUF)]: { opponentProTeamId: 12, statsOfficial: true },
        [scheduleKey(4, BUF)]: { opponentProTeamId: 15, statsOfficial: true }
      }
    });

    expect(grades).toEqual([
      { pickId: 'a', week: 3, espnPlayerId: 3117251, scoredTd: true },
      { pickId: 'b', week: 4, espnPlayerId: 3117251, scoredTd: false }
    ]);
  });
});

describe('findMissingStatLines', () => {
  it('names the player and week a kona lookup could rescue', () => {
    expect(
      findMissingStatLines({ picks: [pick()], statsByEspnPlayerId: {}, scheduleByTeam: played() })
    ).toEqual([{ week: WEEK, espnPlayerId: 3117251 }]);
  });

  it('asks for nothing when the stat line is already there', () => {
    expect(
      findMissingStatLines({
        picks: [pick()],
        statsByEspnPlayerId: stats({}),
        scheduleByTeam: played()
      })
    ).toEqual([]);
  });

  it('asks for nothing a second fetch could not fix', () => {
    // A bye needs no stat line; an unofficial or unknown game will not have
    // one yet either way.
    const cases = [
      played({ opponentProTeamId: null }),
      played({ statsOfficial: false }),
      {}
    ];

    for (const scheduleByTeam of cases) {
      expect(
        findMissingStatLines({ picks: [pick()], statsByEspnPlayerId: {}, scheduleByTeam })
      ).toEqual([]);
    }
  });

  it('asks once for a player two people picked in the same week', () => {
    expect(
      findMissingStatLines({
        picks: [pick({ id: 'a' }), pick({ id: 'b' })],
        statsByEspnPlayerId: {},
        scheduleByTeam: played()
      })
    ).toHaveLength(1);
  });
});
