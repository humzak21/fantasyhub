import { describe, it, expect } from 'vitest';

import {
  FAMILY_COOLDOWN_DAYS,
  MATCHUP_FACTS_TOPIC,
  buildMatchupFacts,
  indexLeague,
  matchupDay,
  ordinal,
  pickFact,
  planMatchupFactNotifications,
  pts
} from '../matchupFacts.js';

// Four franchises over three seasons. Anna (fa) is the recipient, Ben (fb)
// the opponent. 2024 and 2025 are complete; 2026 is three weeks in.
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
  return { id: `${season.id}-${fr}`, seasonId: season.id, franchiseId: fr, owner: OWNERS[fr], playoffFinish, finalRank, madePlayoffs };
}));

const rows = [];
function game(seasonId, week, a, aScore, b, bScore, type = 'regular') {
  const isPlayoff = type.startsWith('playoff') && !type.startsWith('playoff_consolation');
  const base = { seasonId, week, type, isPlayoff, isConsolation: type.startsWith('playoff_consolation') };
  const result = (x, y) => (x == null ? null : x > y ? 'W' : x < y ? 'L' : 'T');
  rows.push({ ...base, teamId: `${seasonId}-${a}`, opponentId: `${seasonId}-${b}`, pointsFor: aScore, pointsAgainst: bScore, result: result(aScore, bScore) });
  rows.push({ ...base, teamId: `${seasonId}-${b}`, opponentId: `${seasonId}-${a}`, pointsFor: bScore, pointsAgainst: aScore, result: result(bScore, aScore) });
}

// 2024: Anna beats Ben twice, including the championship.
game('s24', 1, 'fa', 120, 'fb', 90); game('s24', 1, 'fc', 100, 'fd', 95);
game('s24', 2, 'fa', 110, 'fc', 105); game('s24', 2, 'fb', 112, 'fd', 80);
game('s24', 3, 'fa', 125, 'fd', 100); game('s24', 3, 'fb', 95, 'fc', 99);
game('s24', 4, 'fa', 140, 'fb', 100, 'playoff_championship');
// 2025: Ben beats Anna once, then Anna blows Ben out.
game('s25', 1, 'fb', 101, 'fa', 99); game('s25', 1, 'fc', 130, 'fd', 60);
game('s25', 2, 'fa', 150, 'fb', 70); game('s25', 2, 'fc', 90, 'fd', 89);
game('s25', 3, 'fa', 118, 'fc', 117); game('s25', 3, 'fb', 88, 'fd', 92);
game('s25', 4, 'fb', 85, 'fc', 120, 'playoff_first_round');
// 2026: Anna is scoring like never before; Ben is 3-0 on scraps. Week 4 is this week.
game('s26', 1, 'fb', 80, 'fc', 79); game('s26', 1, 'fa', 130, 'fd', 125);
game('s26', 2, 'fb', 75, 'fd', 74); game('s26', 2, 'fa', 140, 'fc', 135);
game('s26', 3, 'fb', 78, 'fc', 77); game('s26', 3, 'fa', 150, 'fd', 100);
game('s26', 4, 'fa', null, 'fb', null); game('s26', 4, 'fc', null, 'fd', null);

const index = indexLeague({ seasons: SEASONS, teams: TEAMS, results: rows, currentSeasonId: 's26' });
const byFamily = (facts) => Object.fromEntries(facts.map((f) => [f.family, f]));

describe('buildMatchupFacts', () => {
  const anna = buildMatchupFacts(index, 'fa', 'fb');
  const ben = buildMatchupFacts(index, 'fb', 'fa');
  const a = byFamily(anna);

  it('says honest things about you, good ones included', () => {
    expect(a['self:start-own'].text)
      .toBe('Your 420.0 points through 3 weeks are your best start in 3 seasons (previous best: 367.0 in 2025).');
    expect(a['self:vs-average'].text).toBe("You've beaten the league average 3 weeks running.");
    expect(a['self:week-high'].text).toBe('Your 150.0 in week 3 was the highest score in the league that week.');
  });

  it('says only unflattering things about the opponent', () => {
    expect(a['opponent:luck'].text).toBe("Ben is 3-0, but scored like a 1.0-2.0 team. That's luck.");
    expect(a['opponent:finals-lost'].text).toBe('Ben lost the 2024 championship game.');
    expect(anna.filter((f) => f.subject === 'opponent').map((f) => f.family)).not.toContain('opponent:week-high');
  });

  it('offers head-to-head facts only to the side they flatter', () => {
    expect(a['rivalry:h2h-record'].text).toBe("You're 3-1 all-time against Ben.");
    expect(a['rivalry:h2h-playoff'].text).toBe('You beat Ben in the 2024 championship.');
    // Ben's one win over Anna is still Ben's to hear about; the record is not.
    expect(ben.filter((f) => f.subject === 'rivalry').map((f) => f.text))
      .toEqual(["Anna's lowest score against you: 99.0 (2025 week 1)."]);
  });

  it("calls your own luck what it is", () => {
    expect(byFamily(ben)['self:luck'].text).toBe("You're 3-0, but scored like a 1.0-2.0 team. That's luck.");
  });

  it('says one thing about one game, and never the same sentence twice', () => {
    const games = anna.map((f) => f.game).filter(Boolean);
    expect(new Set(games).size).toBe(games.length);
    expect(new Set(anna.map((f) => f.key)).size).toBe(anna.length);
  });

  it('ranks by how hard each fact lands', () => {
    const scores = anna.map((f) => f.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });

  it('with no game this week, talks about you alone', () => {
    const solo = buildMatchupFacts(index, 'fa', null);
    expect(solo.length).toBeGreaterThan(0);
    expect(solo.every((f) => f.subject === 'self')).toBe(true);
  });

  it('never invents a fact without the data for it', () => {
    const empty = indexLeague({ seasons: SEASONS, teams: TEAMS, results: [], currentSeasonId: 's26' });
    const facts = buildMatchupFacts(empty, 'fa', 'fb');
    expect(facts.every((f) => f.subject === 'opponent')).toBe(true);
    expect(facts.map((f) => f.family).sort()).toEqual(['opponent:finals-lost', 'opponent:last-place', 'opponent:titles']);
  });
});

describe('lineups, players and pickups', () => {
  const lineups = ['fa', 'fb', 'fc', 'fd'].flatMap((fr) => [1, 2, 3].map((week) => ({
    seasonId: 's26',
    week,
    teamId: `s26-${fr}`,
    starterPoints: 100,
    optimalPoints: fr === 'fb' ? 140 : 105,
    benchPoints: fr === 'fb' ? (week === 2 ? 48 : 30) : 20
  })));
  const playerWeeks = [1, 2, 3].flatMap((week) => [
    { week, teamId: 's26-fa', espnPlayerId: 1, name: 'Star Back', started: true, points: week === 3 ? 41 : 30 },
    { week, teamId: 's26-fa', espnPlayerId: 2, name: 'Waiver Wire', started: true, points: 12 },
    { week, teamId: 's26-fa', espnPlayerId: 3, name: 'Bench Guy', started: false, points: 25 },
    { week, teamId: 's26-fb', espnPlayerId: 4, name: 'Other', started: true, points: 20 },
    { week, teamId: 's26-fc', espnPlayerId: 5, name: 'Cara Guy', started: true, points: 20 },
    { week, teamId: 's26-fd', espnPlayerId: 6, name: 'Dev Guy', started: true, points: 20 }
  ]);
  const pickups = [{ type: 'WAIVER', week: 2, espnPlayerIds: [2], from: [null], to: ['fa'] }];
  const rich = indexLeague({ seasons: SEASONS, teams: TEAMS, results: rows, lineups, playerWeeks, pickups, currentSeasonId: 's26' });
  const anna = byFamily(buildMatchupFacts(rich, 'fa', 'fb'));

  it("finds the opponent's worst lineups and benchiest week", () => {
    expect(anna['opponent:efficiency'].text)
      .toBe("Ben's lineups have left 29% of Ben's possible points on the bench this season, worst in the league.");
    expect(anna['opponent:bench-week'].text)
      .toBe('Ben has left 48.0 points on the bench in week 2, the most in the league that week.');
  });

  it("finds your star's share and best game", () => {
    expect(anna['self:star-share'].text).toBe("Star Back has scored 74% of your starters' points this season.");
    expect(anna['self:player-game'].text)
      .toBe("Star Back's 41.0 in week 3 for you is the best game by any starter in the league this season.");
  });

  it('credits pickups only for the weeks after they were added, and only when started', () => {
    expect(anna['self:pickups'].text)
      .toBe('Your waiver and free-agent pickups have scored 24.0 points in your lineup, the most in the league.');
  });
});

describe('pickFact', () => {
  const facts = [
    { key: 'A', family: 'opponent:titles', subject: 'opponent', score: 90, text: 'A' },
    { key: 'B', family: 'opponent:luck', subject: 'opponent', score: 85, text: 'B' },
    { key: 'C', family: 'self:luck', subject: 'self', score: 80, text: 'C' },
    { key: 'D', family: 'rivalry:h2h-record', subject: 'rivalry', score: 50, text: 'D' }
  ];
  const now = new Date('2026-10-08T16:00:00Z');
  const daysAgo = (n) => new Date(now.getTime() - n * 864e5);

  it('sends the strongest fact first', () => {
    expect(pickFact(facts, [], now).key).toBe('A');
  });

  it('never sends a sentence twice, however long ago', () => {
    const history = [{ factKey: 'A', family: 'x', subject: 'rivalry', sentAt: daysAgo(400) }];
    expect(pickFact(facts, history, now).key).toBe('B');
  });

  it('rests a family for three weeks', () => {
    const history = [{ factKey: 'old', family: 'opponent:titles', subject: 'rivalry', sentAt: daysAgo(FAMILY_COOLDOWN_DAYS - 1) }];
    expect(pickFact(facts, history, now).key).toBe('B');
    const later = [{ ...history[0], sentAt: daysAgo(FAMILY_COOLDOWN_DAYS + 1) }];
    expect(pickFact(facts, later, now).key).toBe('A');
  });

  it('mixes subjects: a run of opponent facts makes room for you', () => {
    const history = [1, 2].map((n) => ({ factKey: `o${n}`, family: `opponent:f${n}`, subject: 'opponent', sentAt: daysAgo(n) }));
    expect(pickFact(facts, history, now).key).toBe('C');
  });

  it('falls back to a resting family before going silent', () => {
    const history = facts.map((f) => ({ factKey: `${f.key}-old`, family: f.family, subject: f.subject, sentAt: daysAgo(1) }));
    expect(pickFact(facts, history, now)).not.toBeNull();
    const all = facts.map((f) => ({ factKey: f.key, family: f.family, subject: f.subject, sentAt: daysAgo(1) }));
    expect(pickFact(facts, all, now)).toBeNull();
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

describe('planMatchupFactNotifications', () => {
  const sub = (userId, topics = [MATCHUP_FACTS_TOPIC]) => ({ userId, endpoint: `https://push.example/${userId}`, topics });
  const pairings = [
    { teamId: 's26-fa', opponentId: 's26-fb' },
    { teamId: 's26-fb', opponentId: 's26-fa' },
    { teamId: 's26-fc', opponentId: 's26-fd' },
    { teamId: 's26-fd', opponentId: 's26-fc' }
  ];
  const memberTeams = new Map([['anna', 's26-fa'], ['ben', 's26-fb'], ['cara', 's26-fc']]);
  const THURSDAY_NOON = new Date('2026-10-01T16:00:00Z'); // week 4
  const base = { season: SEASON, index, pairings, memberTeams };

  it('sends each member their own fact', () => {
    const [plan] = planMatchupFactNotifications({ ...base, now: THURSDAY_NOON, atNoon: true, subscriptions: [sub('anna'), sub('ben')] });
    expect(plan.kind).toBe('matchup_facts:thu');
    expect(plan.week).toBe(4);
    const [anna, ben] = plan.recipients;
    expect(anna.payload).toMatchObject({ title: 'Week 4: you vs Ben', url: '/schedule' });
    expect(ben.payload.title).toBe('Week 4: you vs Anna');
    expect(anna.payload.body).not.toBe(ben.payload.body);
    expect(anna.fact.text).toBe(anna.payload.body);
  });

  it("skips what the member has already been told", () => {
    const [first] = planMatchupFactNotifications({ ...base, now: THURSDAY_NOON, subscriptions: [sub('anna')] });
    const told = first.recipients[0].fact;
    const history = new Map([['anna', [{ factKey: told.key, family: told.family, subject: told.subject, sentAt: THURSDAY_NOON }]]]);
    const [next] = planMatchupFactNotifications({
      ...base, now: new Date('2026-10-02T16:00:00Z'), history, subscriptions: [sub('anna')]
    });
    expect(next.recipients[0].fact.key).not.toBe(told.key);
    expect(next.recipients[0].fact.family).not.toBe(told.family);
  });

  it('waits for noon when the cron runs it', () => {
    const plan = (now) => planMatchupFactNotifications({ ...base, now, atNoon: true, subscriptions: [sub('anna')] });
    expect(plan(THURSDAY_NOON)).toHaveLength(1); // 16:00 UTC is noon EDT
    expect(plan(new Date('2026-10-01T17:00:00Z'))).toEqual([]); // 1 PM EDT
    // After daylight time ends the other slot is noon.
    expect(plan(new Date('2026-11-03T16:00:00Z'))).toEqual([]); // 11 AM EST
    expect(plan(new Date('2026-11-03T17:00:00Z'))).toHaveLength(1);
  });

  it('sends a day once', () => {
    expect(planMatchupFactNotifications({
      ...base, now: THURSDAY_NOON, sent: new Set(['matchup_facts:thu']), subscriptions: [sub('anna')]
    })).toEqual([]);
  });

  it('skips devices without the topic, unapproved accounts and members with no team', () => {
    const plans = planMatchupFactNotifications({
      ...base,
      now: THURSDAY_NOON,
      excludedUserIds: new Set(['ben']),
      subscriptions: [sub('anna', ['pickems_open']), sub('ben'), sub('stranger'), sub('cara')]
    });
    expect(plans[0].recipients.map((r) => r.userId)).toEqual(['cara']);
  });

  it('gives a member with two devices the same fact on both', () => {
    const [plan] = planMatchupFactNotifications({
      ...base,
      now: THURSDAY_NOON,
      subscriptions: [sub('anna'), { ...sub('anna'), endpoint: 'https://push.example/anna-ipad' }]
    });
    expect(plan.recipients).toHaveLength(2);
    expect(plan.recipients[0].payload).toEqual(plan.recipients[1].payload);
  });

  it('sends nothing outside the season', () => {
    expect(planMatchupFactNotifications({ ...base, now: new Date('2026-08-30T16:00:00Z'), subscriptions: [sub('anna')] })).toEqual([]);
  });
});
