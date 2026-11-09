import { describe, it, expect } from 'vitest';

import {
  PUNISHMENT_WATCH_AFTER_WEEK,
  WATCHED_TEAMS,
  buildPunishmentWatch,
  isSafe,
  showsPunishmentWatch,
  winsToBeSafe
} from '../punishmentWatch.js';

const REGULAR_WEEKS = 14;
const SIMS = 800;

const teams = Array.from({ length: 14 }, (_, i) => ({
  id: `t${i + 1}`,
  divisionId: i % 2 === 0 ? 'east' : 'west'
}));

/** A round robin where lower numbers are better teams. */
function schedule(scoredThrough) {
  const games = [];
  const ring = teams.map((team) => team.id);
  for (let week = 1; week <= REGULAR_WEEKS; week += 1) {
    for (let g = 0; g < 7; g += 1) {
      const team1Id = ring[g];
      const team2Id = ring[13 - g];
      const scored = week <= scoredThrough;
      const strength = (id) => 130 - Number(id.slice(1)) * 3;
      games.push({
        id: `w${week}g${g}`,
        week,
        type: 'regular',
        team1Id,
        team2Id,
        team1Score: scored ? strength(team1Id) + (week % 3) : null,
        team2Score: scored ? strength(team2Id) : null
      });
    }
    ring.splice(1, 0, ring.pop());
  }
  return games;
}

const watchAt = (scoredThrough) =>
  buildPunishmentWatch({ teams, games: schedule(scoredThrough), regularSeasonWeeks: REGULAR_WEEKS, simulations: SIMS });

const row = (id, wins, losses, gamesLeft, extra = {}) => ({
  id, wins, losses, ties: 0, pointsFor: 0, pointsAgainst: 0, gamesLeft, ...extra
});

describe('showsPunishmentWatch', () => {
  it('waits for every game of week 9 to be scored', () => {
    expect(PUNISHMENT_WATCH_AFTER_WEEK).toBe(9);
    expect(showsPunishmentWatch(schedule(8))).toBe(false);
    const partWeek = schedule(9).map((game) => (game.id === 'w9g0' ? { ...game, team1Score: null } : game));
    expect(showsPunishmentWatch(partWeek)).toBe(false);
    expect(showsPunishmentWatch(schedule(9))).toBe(true);
    expect(showsPunishmentWatch(schedule(14))).toBe(true);
  });
});

describe('isSafe', () => {
  it('is safe once a rival winning out stays below the team losing out', () => {
    const table = [row('a', 5, 4, 5), row('b', 2, 7, 2)];
    expect(isSafe(table, 'a')).toBe(true);
    expect(isSafe(table, 'b')).toBe(false);
  });

  it('is not safe level on record while points are still to be scored', () => {
    const table = [row('a', 4, 5, 5), row('b', 2, 7, 2)];
    expect(isSafe(table, 'a')).toBe(false);
  });

  it('reads the final table once nothing is left', () => {
    const table = [row('a', 3, 11, 0, { pointsFor: 1500 }), row('b', 3, 11, 0, { pointsFor: 1400 })];
    expect(isSafe(table, 'a')).toBe(true);
    expect(isSafe(table, 'b')).toBe(false);
  });
});

describe('winsToBeSafe', () => {
  it('is the wins that put the team past the lowest rival ceiling', () => {
    // c can reach 4; a at 2 needs 3 more to finish above that.
    const table = [row('a', 2, 7, 5), row('b', 3, 6, 5), row('c', 2, 7, 2)];
    expect(winsToBeSafe(table, 'a')).toBe(3);
  });

  it('is zero for a team already safe and null when winning out is not enough', () => {
    const table = [row('a', 6, 3, 5), row('b', 0, 9, 5), row('c', 1, 8, 5)];
    expect(winsToBeSafe(table, 'a')).toBe(0);
    expect(winsToBeSafe(table, 'b')).toBe(null);
  });

  it('counts a tie as half a win', () => {
    const table = [row('a', 2, 6, 5, { ties: 1 }), row('b', 3, 6, 1)];
    // b can reach 4; a at 2.5 needs 2 more to reach 4.5.
    expect(winsToBeSafe(table, 'a')).toBe(2);
  });
});

describe('buildPunishmentWatch', () => {
  const watch = watchAt(9);

  it('follows the bottom four, last place first', () => {
    expect(watch.watched).toHaveLength(WATCHED_TEAMS);
    const order = watch.table.map((entry) => entry.id);
    expect(watch.watched.map((team) => team.id)).toEqual(order.slice(-4).reverse());
    expect(watch.watched[0].place).toBe(14);
    expect(watch.asOfWeek).toBe(10);
    expect(watch.scoredWeek).toBe(9);
  });

  it('hands the punishment to exactly one team per season', () => {
    const total = watch.table.reduce((sum, entry) => sum + entry.share, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('is deterministic', () => {
    expect(watchAt(9)).toEqual(watch);
  });

  it('is most likely to punish the team at the bottom', () => {
    const [last, ...rest] = watch.watched;
    for (const team of rest) expect(last.share).toBeGreaterThanOrEqual(team.share);
  });

  it('says how far the team is behind the one above', () => {
    const [last] = watch.watched;
    const above = watch.table.find((entry) => entry.id === last.aboveId);
    expect(above.place).toBe(13);
    expect(last.gamesBack).toBe(above.wins + above.ties / 2 - (last.wins + last.ties / 2));
  });

  it('lists every game left, with a win chance', () => {
    for (const team of watch.watched) {
      expect(team.schedule).toHaveLength(team.gamesLeft);
      for (const game of team.schedule) {
        expect(game.winShare).toBeGreaterThanOrEqual(0);
        expect(game.winShare).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives a path that plays every game left, and how often it ends in punishment', () => {
    const [last] = watch.watched;
    expect(last.path.results).toHaveLength(last.gamesLeft);
    expect(last.path.wins + last.path.losses).toBe(last.gamesLeft);
    expect(last.path.ofPunishments).toBeGreaterThan(0);
    expect(last.path.punishedIfSo).toBeGreaterThan(0);
    expect(last.path.punishedIfSo).toBeLessThanOrEqual(1);
    expect(last.path.results.filter((game) => game.won)).toHaveLength(last.path.wins);
    expect(last.path.runShare).toBeGreaterThan(0);
  });

  it('takes the record that ends in punishment most often, not one exact run', () => {
    for (const team of watch.watched.filter((candidate) => candidate.path)) {
      const weight = (outcome) => outcome.share * outcome.punished;
      const likeliest = team.byWins.reduce((best, outcome) => (weight(outcome) > weight(best) ? outcome : best));
      expect(team.path.wins).toBe(likeliest.wins);
      expect(team.path.punishedIfSo).toBeCloseTo(likeliest.punished, 10);
    }
  });

  it('reads each number of wins left, and they add up', () => {
    const [last] = watch.watched;
    const total = last.byWins.reduce((sum, outcome) => sum + outcome.share, 0);
    expect(total).toBeCloseTo(1, 5);
    for (const outcome of last.byWins) expect(outcome.wins + outcome.losses).toBe(last.gamesLeft);
    // More wins is never worse.
    const first = last.byWins[0];
    const best = last.byWins.at(-1);
    expect(best.punished).toBeLessThanOrEqual(first.punished);
  });

  it('roots for the team in its own games, and names a side in the others', () => {
    for (const team of watch.watched) {
      for (const game of team.keyGames) {
        if (game.involves) expect(game.rootFor).toBe(team.id);
        else expect([game.team1Id, game.team2Id]).toContain(game.rootFor);
        expect(game.swing).toBeGreaterThan(0);
      }
    }
  });

  it('names the team that finishes just above in the seasons it is punished', () => {
    const [last] = watch.watched;
    expect(last.rivals.length).toBeGreaterThan(0);
    expect(last.rivals.every((rival) => rival.id !== last.id)).toBe(true);
    expect(last.rivals.reduce((sum, rival) => sum + rival.share, 0)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('reads 100 and 0 once the regular season is over', () => {
    const final = watchAt(14);
    expect(final.decided).toBe(true);
    expect(final.simulations).toBe(0);
    const [last, ...rest] = final.watched;
    expect(last.id).toBe('t14');
    expect(last).toMatchObject({ odds: 100, status: 'locked', path: null, winsToBeSafe: null });
    for (const team of rest) expect(team).toMatchObject({ odds: 0, status: 'safe' });
    expect(final.others).toEqual([]);
  });

  it('holds an open race to 1-99', () => {
    for (const entry of watch.table.filter((candidate) => candidate.status === 'open')) {
      expect(entry.odds).toBeGreaterThanOrEqual(1);
      expect(entry.odds).toBeLessThanOrEqual(99);
    }
  });

  it('is nothing without a league', () => {
    expect(buildPunishmentWatch({ teams: [], games: [] })).toBe(null);
  });
});
