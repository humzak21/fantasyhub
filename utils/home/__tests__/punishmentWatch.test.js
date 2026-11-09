import { describe, it, expect } from 'vitest';

import {
  escapeLine,
  formatShare,
  gapLine,
  historyLines,
  keyGameLine,
  oddsLabel,
  pathLine,
  winsToGetUnder
} from '../punishmentWatch.js';

const nameOf = (id) => ({ a: 'Alpha', b: 'Bravo', c: 'Charlie' })[id] ?? id;

const team = (extra = {}) => ({
  id: 'a',
  wins: 2,
  losses: 7,
  ties: 0,
  gamesLeft: 5,
  status: 'open',
  odds: 41,
  fromBottom: 1,
  aboveId: 'b',
  gamesBack: 1,
  pointsBack: 30,
  winsToBeSafe: 4,
  byWins: [],
  path: null,
  ...extra
});

describe('formatShare', () => {
  it('never rounds a possibility to 0% or 100%', () => {
    expect(formatShare(0.004)).toBe('<1%');
    expect(formatShare(0.996)).toBe('>99%');
    expect(formatShare(0)).toBe('0%');
    expect(formatShare(1)).toBe('100%');
    expect(formatShare(0.415)).toBe('42%');
    expect(formatShare(null)).toBe('—');
  });
});

describe('oddsLabel', () => {
  it('says locked and safe rather than 100 and 0', () => {
    expect(oddsLabel(team())).toBe('41%');
    expect(oddsLabel(team({ status: 'locked', odds: 100 }))).toBe('Locked');
    expect(oddsLabel(team({ status: 'safe', odds: 0 }))).toBe('Safe');
  });
});

describe('gapLine', () => {
  it('counts games behind, then points when level', () => {
    expect(gapLine(team(), nameOf)).toBe('1 game behind Bravo');
    expect(gapLine(team({ gamesBack: 1.5 }), nameOf)).toBe('1.5 games behind Bravo');
    expect(gapLine(team({ gamesBack: 0, pointsBack: 12.34 }), nameOf)).toBe(
      'Level with Bravo on record, 12.3 points for behind'
    );
    expect(gapLine(team({ aboveId: null }), nameOf)).toBe(null);
  });
});

describe('escapeLine', () => {
  it('names the wins that rule last place out', () => {
    expect(escapeLine(team())).toBe('Win 4 of 5 left and no other result can put them last.');
    expect(escapeLine(team({ winsToBeSafe: 5 }))).toBe('Win all 5 left and no other result can put them last.');
    expect(escapeLine(team({ winsToBeSafe: null }))).toMatch(/does not rule it out on its own/);
  });

  it('says when the arithmetic has settled it', () => {
    expect(escapeLine(team({ status: 'locked' }))).toMatch(/^Locked in/);
    expect(escapeLine(team({ status: 'safe' }))).toMatch(/^Safe/);
    expect(escapeLine(team({ status: 'locked' }), { decided: true })).toMatch(/^Finished last/);
  });
});

describe('pathLine', () => {
  it('reads both halves of the path', () => {
    const line = pathLine(team({ path: { wins: 1, losses: 4, ofPunishments: 0.38, punishedIfSo: 0.71 } }));
    expect(line).toBe(
      'Going 1–4 is 38% of the seasons they are punished in, and 71% of the seasons they go 1–4 end in punishment.'
    );
    expect(pathLine(team())).toBe(null);
  });
});

describe('winsToGetUnder', () => {
  it('is the fewest wins that drop the chance under the line', () => {
    const byWins = [
      { wins: 0, punished: 0.9 },
      { wins: 1, punished: 0.5 },
      { wins: 2, punished: 0.08 },
      { wins: 3, punished: 0.01 }
    ];
    expect(winsToGetUnder(team({ byWins }))).toBe(2);
    expect(winsToGetUnder(team({ byWins: byWins.slice(0, 2) }))).toBe(null);
  });
});

describe('keyGameLine', () => {
  it('gives the team its own result both ways', () => {
    const game = { involves: true, team1Id: 'c', team2Id: 'a', ifTeam1: 0.6, ifTeam2: 0.2 };
    expect(keyGameLine(game, 'a', nameOf)).toBe('20% with a win, 60% with a loss');
  });

  it('names the side to root for in somebody else\'s game', () => {
    const game = { involves: false, team1Id: 'b', team2Id: 'c', ifTeam1: 0.5, ifTeam2: 0.3, rootFor: 'c' };
    expect(keyGameLine(game, 'a', nameOf)).toBe('Root for Charlie: 30% if they win, 50% if Bravo do');
  });
});

describe('historyLines', () => {
  const situations = {
    places: { 9: [{ fromBottom: 1, seasons: 6, punished: 4 }, { fromBottom: 2, seasons: 6, punished: 1 }] },
    starts: { 9: [{ key: '2-7', count: 3, punished: 2, madePlayoffs: 1 }, { key: '3-6', count: 5, punished: 0, madePlayoffs: 0 }] }
  };

  it('reads the place and the record', () => {
    expect(historyLines(team(), situations)).toEqual([
      'After 9 games, the team in last has taken the punishment in 4 of 6 seasons.',
      '3 teams have been 2–7 after 9 games before: 2 took the punishment, and 1 made the playoffs.'
    ]);
  });

  it('says a record is new to the league', () => {
    expect(historyLines(team({ wins: 0, losses: 9, fromBottom: 2 }), situations)).toEqual([
      'After 9 games, the team 2nd from the bottom has taken the punishment in 1 of 6 seasons.',
      'No team has been 0–9 after 9 games before.'
    ]);
  });

  it('is nothing before the history has loaded', () => {
    expect(historyLines(team(), undefined)).toEqual([]);
  });
});
