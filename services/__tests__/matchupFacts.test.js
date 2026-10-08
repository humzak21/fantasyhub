import { describe, it, expect } from 'vitest';

import {
  DAY_ORDER,
  MATCHUP_FACTS_TOPIC,
  buildMatchupFacts,
  factForDay,
  indexLeague,
  matchupDay,
  ordinal,
  planMatchupFactNotifications,
  pts
} from '../matchupFacts.js';

// Four franchises over three seasons. Anna (fa) is the recipient, Ben (fb)
// the opponent. 2024 and 2025 are complete; 2026 is in progress.
const SEASONS = [
  { id: 's24', year: 2024, isCompleted: true },
  { id: 's25', year: 2025, isCompleted: true },
  { id: 's26', year: 2026, isCompleted: false }
];
const OWNERS = { fa: 'Anna Alpha', fb: 'Ben Bravo', fc: 'Cara Charlie', fd: 'Dev Delta' };
const FINISH = {
  s24: { fa: ['champion', 1, true], fb: ['2nd', 2, true], fc: ['none', 3, false], fd: ['none', 4, false] },
  s25: { fa: ['3rd', 2, true], fb: ['none', 4, false], fc: ['champion', 1, true], fd: ['2nd', 3, true] }
};
const TEAMS = SEASONS.flatMap((season) => Object.keys(OWNERS).map((fr) => {
  const [playoffFinish, finalRank, madePlayoffs] = FINISH[season.id]?.[fr] ?? [null, null, null];
  return {
    id: `${season.id}-${fr}`,
    seasonId: season.id,
    franchiseId: fr,
    owner: OWNERS[fr],
    playoffFinish,
    finalRank,
    madePlayoffs
  };
}));

const rows = [];
function game(seasonId, week, a, aScore, b, bScore, type = 'regular') {
  const isPlayoff = type.startsWith('playoff') && !type.startsWith('playoff_consolation');
  const base = { seasonId, week, type, isRegular: type === 'regular', isPlayoff, isConsolation: type.startsWith('playoff_consolation') };
  const result = (x, y) => (x == null ? null : x > y ? 'W' : x < y ? 'L' : 'T');
  rows.push({ ...base, teamId: `${seasonId}-${a}`, opponentId: `${seasonId}-${b}`, pointsFor: aScore, pointsAgainst: bScore, result: result(aScore, bScore) });
  rows.push({ ...base, teamId: `${seasonId}-${b}`, opponentId: `${seasonId}-${a}`, pointsFor: bScore, pointsAgainst: aScore, result: result(bScore, aScore) });
}

// 2024: Anna beats Ben twice, including the championship.
game('s24', 1, 'fa', 120, 'fb', 90); game('s24', 1, 'fc', 100, 'fd', 95);
game('s24', 2, 'fa', 110, 'fc', 105); game('s24', 2, 'fb', 112, 'fd', 80);
game('s24', 3, 'fa', 140, 'fb', 100, 'playoff_championship');
// 2025: Ben beats Anna once, then Anna blows Ben out.
game('s25', 1, 'fb', 101, 'fa', 99); game('s25', 1, 'fc', 130, 'fd', 60);
game('s25', 2, 'fa', 150, 'fb', 70); game('s25', 2, 'fc', 90, 'fd', 89);
game('s25', 3, 'fb', 85, 'fc', 120, 'playoff_first_round');
// 2026: Ben is 2-0 on the lowest scores in the league. Week 3 is this week, unplayed.
game('s26', 1, 'fb', 80, 'fc', 79); game('s26', 1, 'fa', 130, 'fd', 125);
game('s26', 2, 'fb', 75, 'fd', 74); game('s26', 2, 'fa', 140, 'fc', 135);
game('s26', 3, 'fa', null, 'fb', null); game('s26', 3, 'fc', null, 'fd', null);

const index = indexLeague({ seasons: SEASONS, teams: TEAMS, results: rows, currentSeasonId: 's26' });
const keys = (facts) => facts.map((fact) => fact.key);

describe('buildMatchupFacts', () => {
  const annaOnBen = buildMatchupFacts(index, 'fa', 'fb');
  const benOnAnna = buildMatchupFacts(index, 'fb', 'fa');

  it('offers head-to-head facts only to the side they flatter', () => {
    expect(annaOnBen.find((f) => f.key === 'h2h-record').text).toBe("You're 3-1 all-time against Ben.");
    expect(keys(benOnAnna).filter((k) => k.startsWith('h2h'))).toEqual([]);
  });

  it('remembers a title won over the opponent', () => {
    expect(annaOnBen.find((f) => f.key === 'h2h-playoff-2024').text).toBe('You beat Ben in the 2024 championship.');
  });

  it("names the opponent's lost final, missed playoffs and playoff record", () => {
    const text = Object.fromEntries(annaOnBen.map((f) => [f.key, f.text]));
    expect(text['finals-lost']).toBe('Ben lost the 2024 championship game.');
    expect(text['playoff-record']).toBe('Ben is 0-2 in playoff games.');
    expect(text['titles-none']).toBe('Ben has played 2 seasons in this league and won zero championships.');
  });

  it("reaches back to the opponent's worst beating, by the recipient", () => {
    expect(annaOnBen.find((f) => f.key === 'worst-loss').text)
      .toBe("Ben's worst beating ever: lost by 80.0 to you in 2025 week 2.");
  });

  it('calls a winning record built on low scores luck', () => {
    const luck = annaOnBen.find((f) => f.key === 'season-luck');
    expect(luck.text).toBe("Ben is 2-0, but scored like a 0.7-1.3 team. That's luck.");
  });

  it('says one thing about one game', () => {
    // Ben's worst beating was Anna's biggest win over Ben: one fact, the stronger.
    expect(keys(annaOnBen)).toContain('worst-loss');
    expect(keys(annaOnBen)).not.toContain('h2h-biggest-win');
    const games = annaOnBen.map((f) => f.game).filter(Boolean);
    expect(new Set(games).size).toBe(games.length);
  });

  it('ranks by how hard each fact lands, strongest first', () => {
    const scores = annaOnBen.map((f) => f.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(annaOnBen[0].key).toBe('h2h-playoff-2024');
  });

  it('never invents a fact for a franchise with no history', () => {
    const empty = indexLeague({ seasons: SEASONS, teams: TEAMS, results: [], currentSeasonId: 's26' });
    expect(buildMatchupFacts(empty, 'fa', 'fb').filter((f) => !f.key.startsWith('titles') && !f.key.startsWith('finals')
      && !f.key.startsWith('playoffs') && f.key !== 'last-place')).toEqual([]);
  });

  it('calls out the lowest score in league history', () => {
    const low = buildMatchupFacts(index, 'fc', 'fd').find((f) => f.key === 'career-low');
    expect(low.text).toBe("Dev owns the lowest score in league history: 60.0 in 2025 week 1.");
  });
});

describe('formatting', () => {
  it('keeps a sub-point margin to the hundredth', () => {
    expect(pts(0.04)).toBe('0.04');
    expect(pts(12.345)).toBe('12.3');
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

const SEASON = { id: 's26', startDate: '2026-09-08', weekCount: 17, timeZone: 'America/New_York' };

describe('matchupDay', () => {
  it('counts Tuesday as day 0 of the week', () => {
    expect(matchupDay(SEASON, new Date('2026-09-22T16:00:00Z'))).toEqual({ week: 3, dayIndex: 0, dayKey: 'tue' });
    expect(matchupDay(SEASON, new Date('2026-09-27T16:00:00Z'))).toEqual({ week: 3, dayIndex: 5, dayKey: 'sun' });
    expect(matchupDay(SEASON, new Date('2026-09-28T16:00:00Z'))).toEqual({ week: 3, dayIndex: 6, dayKey: 'mon' });
  });

  it('reads the local date, across the end of daylight time', () => {
    // Daylight time ends Sunday 1 Nov 2026; Tuesday 3 Nov noon EST is 17:00 UTC.
    expect(matchupDay(SEASON, new Date('2026-11-03T17:00:00Z'))).toMatchObject({ week: 9, dayKey: 'tue' });
    // 11:30 PM Monday in New York is already Tuesday in UTC.
    expect(matchupDay(SEASON, new Date('2026-11-03T04:30:00Z'))).toMatchObject({ week: 8, dayKey: 'mon' });
  });

  it('is null before the season and after its last week', () => {
    expect(matchupDay(SEASON, new Date('2026-09-01T16:00:00Z'))).toBeNull();
    expect(matchupDay(SEASON, new Date('2027-01-05T17:00:00Z'))).toBeNull();
  });
});

describe('factForDay', () => {
  const facts = ['a', 'b', 'c'].map((key) => ({ key }));

  it('saves the strongest fact for Sunday and fills from Tuesday', () => {
    expect(factForDay(facts, 5).key).toBe('a');
    expect(factForDay(facts, 0).key).toBe('b');
    expect(factForDay(facts, 1).key).toBe('c');
  });

  it('skips a day rather than repeating a fact', () => {
    expect(factForDay(facts, 2)).toBeNull();
    expect(DAY_ORDER).toHaveLength(7);
  });
});

describe('planMatchupFactNotifications', () => {
  const sub = (userId, topics = [MATCHUP_FACTS_TOPIC]) => ({ userId, endpoint: `https://push.example/${userId}`, topics });
  const pairings = [
    { teamId: 's26-fa', opponentId: 's26-fb' },
    { teamId: 's26-fb', opponentId: 's26-fa' },
    { teamId: 's26-fc', opponentId: 's26-fd' },
    { teamId: 's26-fd', opponentId: 's26-fc' }
  ];
  const memberTeams = new Map([['anna', 's26-fa'], ['ben', 's26-fb'], ['cara', 's26-fc']]);
  const SUNDAY_NOON = new Date('2026-09-27T16:00:00Z');
  const base = { season: SEASON, index, pairings, memberTeams };

  it('sends each member a fact about their own opponent', () => {
    const [plan] = planMatchupFactNotifications({
      ...base,
      now: SUNDAY_NOON,
      atNoon: true,
      subscriptions: [sub('anna'), sub('ben')]
    });
    expect(plan.kind).toBe('matchup_facts:sun');
    expect(plan.week).toBe(3);
    const [anna, ben] = plan.recipients;
    expect(anna.payload).toMatchObject({ title: 'Week 3: you vs Ben', body: 'You beat Ben in the 2024 championship.', url: '/schedule' });
    expect(ben.payload.title).toBe('Week 3: you vs Anna');
    expect(ben.payload.body).not.toMatch(/^You/);
  });

  it('waits for noon when the cron runs it', () => {
    const plan = (now) => planMatchupFactNotifications({ ...base, now, atNoon: true, subscriptions: [sub('anna')] });
    expect(plan(SUNDAY_NOON)).toHaveLength(1); // 16:00 UTC is noon EDT
    expect(plan(new Date('2026-09-27T17:00:00Z'))).toEqual([]); // 1 PM EDT
    // After daylight time ends the other slot is noon.
    expect(plan(new Date('2026-11-03T16:00:00Z'))).toEqual([]); // 11 AM EST
    expect(plan(new Date('2026-11-03T17:00:00Z'))).toHaveLength(1);
  });

  it('sends a day once', () => {
    expect(planMatchupFactNotifications({
      ...base, now: SUNDAY_NOON, sent: new Set(['matchup_facts:sun']), subscriptions: [sub('anna')]
    })).toEqual([]);
  });

  it('skips devices without the topic, unapproved accounts and members with no team', () => {
    const plans = planMatchupFactNotifications({
      ...base,
      now: SUNDAY_NOON,
      excludedUserIds: new Set(['ben']),
      subscriptions: [sub('anna', ['pickems_open']), sub('ben'), sub('stranger'), sub('cara')]
    });
    expect(plans[0].recipients.map((r) => r.userId)).toEqual(['cara']);
  });

  it('gives a member with two devices the same fact on both', () => {
    const [plan] = planMatchupFactNotifications({
      ...base,
      now: SUNDAY_NOON,
      subscriptions: [sub('anna'), { ...sub('anna'), endpoint: 'https://push.example/anna-ipad' }]
    });
    expect(plan.recipients).toHaveLength(2);
    expect(plan.recipients[0].payload).toEqual(plan.recipients[1].payload);
  });

  it('sends nothing outside the season', () => {
    expect(planMatchupFactNotifications({
      ...base, now: new Date('2026-08-30T16:00:00Z'), subscriptions: [sub('anna')]
    })).toEqual([]);
  });
});
