import { describe, it, expect } from 'vitest';

import { currentSeasonStanding } from '../seasonStanding.js';

const RANKINGS = [{ teamId: 't9' }, { teamId: 't1' }, { id: 't5' }];

const STANDINGS = {
  divisions: [
    {
      divisionName: 'Assholes',
      teams: [
        { teamId: 't9', wins: 7, losses: 2, ties: 0, pointsFor: 1300.5 },
        { teamId: 't1', wins: 6, losses: 3, ties: 0, pointsFor: 1250.25, divisionRank: 2 }
      ]
    },
    { divisionName: 'Ninjas', teams: [{ teamId: 't5', wins: 0, losses: 0, ties: 0, pointsFor: 0 }] }
  ]
};

describe('currentSeasonStanding', () => {
  it('reads the power rank from its position and the rest from the division', () => {
    expect(currentSeasonStanding({ teamId: 't1', rankings: RANKINGS, standings: STANDINGS })).toEqual({
      powerRank: 2,
      divisionRank: 2,
      divisionName: 'Assholes',
      pointsFor: 1250.25
    });
  });

  it('falls back to the row position for the division rank', () => {
    expect(currentSeasonStanding({ teamId: 't9', rankings: RANKINGS, standings: STANDINGS }).divisionRank).toBe(1);
  });

  it('has no place and no points before a game is played', () => {
    expect(currentSeasonStanding({ teamId: 't5', rankings: RANKINGS, standings: STANDINGS })).toEqual({
      powerRank: 3,
      divisionRank: null,
      divisionName: 'Ninjas',
      pointsFor: null
    });
  });

  it('matches a numeric id against a string one', () => {
    expect(currentSeasonStanding({ teamId: 1, rankings: [{ teamId: '1' }] }).powerRank).toBe(1);
  });

  it('is unknown rather than zero when the rows have not arrived', () => {
    expect(currentSeasonStanding({ teamId: 't1' })).toEqual({
      powerRank: null,
      divisionRank: null,
      divisionName: null,
      pointsFor: null
    });
  });

  it('has nothing for a franchise with no team this season', () => {
    expect(currentSeasonStanding({ teamId: null, rankings: RANKINGS, standings: STANDINGS })).toBeNull();
  });
});
