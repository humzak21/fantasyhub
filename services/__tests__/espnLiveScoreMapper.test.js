import { describe, it, expect } from 'vitest';

import {
  GAME_STATE,
  normalizeAbbrev,
  indexEventsByTeam,
  scoredTouchdownsFromSummary,
  relevantEventIds,
  anyGameLive,
  buildLiveStatus
} from '../espnLiveScoreMapper.js';

/** A scoreboard with one live game, one final, one not started. */
const scoreboard = {
  events: [
    {
      id: '1',
      status: { type: { state: 'in', shortDetail: '7:10 - 1st Quarter' } },
      competitions: [{ competitors: [{ team: { abbreviation: 'DEN' } }, { team: { abbreviation: 'JAX' } }] }]
    },
    {
      id: '2',
      status: { type: { state: 'post', shortDetail: 'Final' } },
      competitions: [{ competitors: [{ team: { abbreviation: 'GB' } }, { team: { abbreviation: 'NYJ' } }] }]
    },
    {
      id: '3',
      status: { type: { state: 'pre', shortDetail: 'Sun 1:00 PM' } },
      competitions: [{ competitors: [{ team: { abbreviation: 'KC' } }, { team: { abbreviation: 'BUF' } }] }]
    }
  ]
};

const rushing = (athletes) => ({ name: 'rushing', labels: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'], athletes });
const receiving = (athletes) => ({ name: 'receiving', labels: ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'], athletes });
const passing = (athletes) => ({ name: 'passing', labels: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'RTG'], athletes });

/** Player 100 scored one rushing and one receiving TD; player 200 threw three. */
const summary1 = {
  boxscore: {
    players: [
      {
        team: { abbreviation: 'DEN' },
        statistics: [
          rushing([{ athlete: { id: '100' }, stats: ['10', '50', '5.0', '1', '20'] }]),
          receiving([{ athlete: { id: '100' }, stats: ['3', '40', '13.3', '1', '20', '4'] }]),
          passing([{ athlete: { id: '200' }, stats: ['20/30', '250', '8.3', '3', '0', '1', '99'] }])
        ]
      }
    ]
  }
};

/** Player 300 played the whole (final) game and scored no rushing/receiving TD. */
const summary2 = {
  boxscore: {
    players: [
      { team: { abbreviation: 'GB' }, statistics: [rushing([{ athlete: { id: '300' }, stats: ['12', '44', '3.7', '0', '9'] }])] }
    ]
  }
};

describe('normalizeAbbrev', () => {
  it('aliases the spellings that differ between ESPN surfaces', () => {
    expect(normalizeAbbrev('WAS')).toBe('WSH');
    expect(normalizeAbbrev('JAC')).toBe('JAX');
    expect(normalizeAbbrev('la')).toBe('LAR');
  });

  it('passes a canonical abbreviation through and null through', () => {
    expect(normalizeAbbrev('DEN')).toBe('DEN');
    expect(normalizeAbbrev(null)).toBeNull();
  });
});

describe('indexEventsByTeam', () => {
  it('maps both teams of a game to the same event and state', () => {
    const byTeam = indexEventsByTeam(scoreboard);
    expect(byTeam.get('DEN')).toMatchObject({ eventId: '1', state: GAME_STATE.IN_PROGRESS });
    expect(byTeam.get('JAX')).toMatchObject({ eventId: '1', state: GAME_STATE.IN_PROGRESS });
    expect(byTeam.get('GB').state).toBe(GAME_STATE.FINAL);
    expect(byTeam.get('KC').state).toBe(GAME_STATE.NOT_STARTED);
  });
});

describe('scoredTouchdownsFromSummary', () => {
  it('sums rushing and receiving TDs and ignores passing', () => {
    expect(scoredTouchdownsFromSummary(summary1, '100')).toBe(2);
    expect(scoredTouchdownsFromSummary(summary1, '200')).toBe(0); // threw three, scored none
  });

  it('returns 0 for a player in the game who has not scored', () => {
    expect(scoredTouchdownsFromSummary(summary2, '300')).toBe(0);
  });

  it('returns null when there is no box score to read', () => {
    expect(scoredTouchdownsFromSummary({}, '100')).toBeNull();
    expect(scoredTouchdownsFromSummary(summary1, null)).toBeNull();
  });
});

describe('relevantEventIds', () => {
  it('returns only started games for the picked teams', () => {
    // DEN is live, GB is final, KC has not started, DAL is not in the slate.
    expect(relevantEventIds(scoreboard, ['DEN', 'GB', 'KC', 'DAL']).sort()).toEqual(['1', '2']);
  });
});

describe('anyGameLive', () => {
  it('is true only while a picked team is in progress', () => {
    expect(anyGameLive(scoreboard, ['DEN', 'KC'])).toBe(true);
    expect(anyGameLive(scoreboard, ['GB', 'KC'])).toBe(false); // final + not started
  });
});

describe('buildLiveStatus', () => {
  const picks = [
    { id: 'pA', espnPlayerId: '100', teamAbbreviation: 'DEN' }, // live, scored
    { id: 'pB', espnPlayerId: '300', teamAbbreviation: 'GB' },  // final, no TD
    { id: 'pC', espnPlayerId: '999', teamAbbreviation: 'KC' },  // not started
    { id: 'pD', espnPlayerId: '400', teamAbbreviation: 'DAL' }  // no game this week
  ];
  const status = buildLiveStatus({
    picks,
    scoreboard,
    summariesByEvent: { 1: summary1, 2: summary2 }
  });

  it('reports a live TD as scored, with the count and the game detail', () => {
    expect(status.pA).toMatchObject({ state: GAME_STATE.IN_PROGRESS, scored: true, tds: 2 });
    expect(status.pA.detail).toBe('7:10 - 1st Quarter');
  });

  it('reports a finished game with no TD as final, not scored, zero', () => {
    expect(status.pB).toMatchObject({ state: GAME_STATE.FINAL, scored: false, tds: 0 });
  });

  it('leaves a not-started game unknown, never zero', () => {
    expect(status.pC).toMatchObject({ state: GAME_STATE.NOT_STARTED, scored: false, tds: null });
  });

  it('marks a team with no game this week as no_game', () => {
    expect(status.pD).toMatchObject({ state: GAME_STATE.NO_GAME, tds: null });
  });
});
