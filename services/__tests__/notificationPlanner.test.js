import { describe, it, expect } from 'vitest';

import {
  CLOSING_LEAD_HOURS,
  TAKE_EVENT_MAX_AGE_HOURS,
  TOPICS,
  WIN_KINDS,
  formatDeadline,
  isGoneStatus,
  newestFinishedWeek,
  planPickemNotifications,
  planTakeNotifications,
  planWinnerNotifications,
  previewTake
} from '../notificationPlanner.js';
import { PICK_EM_TOURNEYS } from '../../src/components/pickems/tourneys.js';

// Week 5, 2026: opens Tuesday 06 Oct 04:00 EDT, closes Thursday 08 Oct 20:00 EDT.
const WEEK = {
  id: 'w5',
  seasonId: 's26',
  weekNumber: 5,
  opensAt: new Date('2026-10-06T08:00:00Z'),
  closesAt: new Date('2026-10-09T00:00:00Z')
};

const sub = (userId, topics = [TOPICS.pickemsOpen, TOPICS.pickemsClosing], endpoint = `https://push.example/${userId}`) =>
  ({ userId, endpoint, topics });

const TUESDAY_SLOT = new Date('2026-10-06T14:00:00Z'); // 10 AM EDT
const THURSDAY_SLOT = new Date('2026-10-08T21:30:00Z'); // 5:30 PM EDT

describe('planPickemNotifications', () => {
  it('sends "open" on Tuesday to every device that wants it', () => {
    const plans = planPickemNotifications({
      now: TUESDAY_SLOT,
      week: WEEK,
      subscriptions: [sub('a'), sub('b', [TOPICS.pickemsClosing]), sub('c', [TOPICS.pickemsOpen])]
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe(TOPICS.pickemsOpen);
    expect(plans[0].recipients.map((r) => r.userId)).toEqual(['a', 'c']);
    expect(plans[0].payload).toMatchObject({
      title: "Week 5 pick'ems are open",
      body: 'Make your picks and your TD parlay pick before Thursday 8 PM ET.',
      url: '/pickems'
    });
  });

  it('sends the reminder on Thursday only to members who have not picked', () => {
    const plans = planPickemNotifications({
      now: THURSDAY_SLOT,
      week: WEEK,
      sent: new Set([TOPICS.pickemsOpen]),
      subscriptions: [sub('a'), sub('b'), sub('b', undefined, 'https://push.example/b-laptop'), sub('c', [TOPICS.pickemsOpen])],
      submittedUserIds: new Set(['a'])
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe(TOPICS.pickemsClosing);
    // Both of b's devices; not a (picked), not c (opted out of reminders).
    expect(plans[0].recipients.map((r) => r.endpoint)).toEqual(['https://push.example/b', 'https://push.example/b-laptop']);
    expect(plans[0].payload.title).toBe("Pick'ems close at 8 PM ET");
    expect(plans[0].payload.body).toBe("You haven't made your week 5 picks yet.");
  });

  it('never sends a kind twice', () => {
    const sent = new Set([TOPICS.pickemsOpen, TOPICS.pickemsClosing]);
    expect(planPickemNotifications({ now: TUESDAY_SLOT, week: WEEK, sent, subscriptions: [sub('a')] })).toEqual([]);
    expect(planPickemNotifications({ now: THURSDAY_SLOT, week: WEEK, sent, subscriptions: [sub('a')] })).toEqual([]);
  });

  it('skips "open" once the reminder is due, rather than sending both', () => {
    const plans = planPickemNotifications({ now: THURSDAY_SLOT, week: WEEK, subscriptions: [sub('a')] });
    expect(plans.map((p) => p.kind)).toEqual([TOPICS.pickemsClosing]);
  });

  it('sends nothing outside the window', () => {
    const before = new Date('2026-10-06T07:00:00Z');
    const after = new Date('2026-10-09T00:00:00Z');
    expect(planPickemNotifications({ now: before, week: WEEK, subscriptions: [sub('a')] })).toEqual([]);
    expect(planPickemNotifications({ now: after, week: WEEK, subscriptions: [sub('a')] })).toEqual([]);
  });

  it('holds the reminder until the lead window, under standard time too', () => {
    const early = new Date(WEEK.closesAt.getTime() - (CLOSING_LEAD_HOURS + 1) * 3600e3);
    expect(planPickemNotifications({ now: early, week: WEEK, sent: new Set([TOPICS.pickemsOpen]), subscriptions: [sub('a')] }))
      .toEqual([]);

    // December: closes 20:00 EST = 01:00 UTC Friday; the 21:30 UTC slot is 3.5 h before.
    const december = { ...WEEK, opensAt: new Date('2026-12-08T09:00:00Z'), closesAt: new Date('2026-12-11T01:00:00Z') };
    const plans = planPickemNotifications({ now: new Date('2026-12-10T21:30:00Z'), week: december, subscriptions: [sub('a')] });
    expect(plans.map((p) => p.kind)).toEqual([TOPICS.pickemsClosing]);
    expect(plans[0].payload.title).toBe("Pick'ems close at 8 PM ET");
  });

  it('sends nothing with no week or no subscribers', () => {
    expect(planPickemNotifications({ now: TUESDAY_SLOT, week: null, subscriptions: [sub('a')] })).toEqual([]);
    expect(planPickemNotifications({ now: TUESDAY_SLOT, week: WEEK, subscriptions: [] })).toEqual([]);
  });
});

describe('formatDeadline', () => {
  it('reads like the league says it', () => {
    expect(formatDeadline(new Date('2026-10-09T00:00:00Z'))).toBe('8 PM ET');
    expect(formatDeadline(new Date('2026-10-09T00:30:00Z'))).toBe('8:30 PM ET');
    expect(formatDeadline(new Date('2026-10-09T00:00:00Z'), 'America/Chicago')).toBe('7 PM CT');
  });
});

describe('isGoneStatus', () => {
  it('treats only 404 and 410 as a removed device', () => {
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(429)).toBe(false);
    expect(isGoneStatus(500)).toBe(false);
  });
});

describe('planTakeNotifications', () => {
  const NOW = new Date('2026-10-07T18:00:00Z');
  const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000);
  const TAKE = { id: 't1', authorId: 'author', body: 'Bijan finishes as the RB1.', wager: '$20' };
  const everything = [TOPICS.pickemsOpen, TOPICS.pickemsClosing, TOPICS.takesNew, TOPICS.takesReactions, TOPICS.takesStakes];
  const event = (eventType, subjectId, extra = {}) => ({
    id: `e-${eventType}-${subjectId}`,
    takeId: 't1',
    seasonId: 's26',
    eventType,
    subjectId,
    createdAt: minutesAgo(2),
    ...extra
  });
  const plan = (overrides) => planTakeNotifications({
    now: NOW,
    takes: new Map([['t1', TAKE]]),
    subscriptions: [sub('author', everything), sub('sam', everything), sub('lee', [TOPICS.pickemsOpen])],
    displayNames: { author: 'Humza', sam: 'Sam', lee: 'Lee' },
    ...overrides
  });

  it('announces a new take to everyone with it on, except the author', () => {
    const plans = plan({ events: [event('posted', 'author')] });
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: TOPICS.takesNew, eventId: 'e-posted-author', seasonId: 's26' });
    expect(plans[0].recipients.map((r) => r.userId)).toEqual(['sam']);
    expect(plans[0].payload).toEqual({
      title: 'New take from Humza',
      body: '“Bijan finishes as the RB1.” · $20 on it',
      url: '/takes?take=t1',
      tag: 'take-t1'
    });
  });

  it('tells only the author about a Hell Nah, with what it means for their stake', () => {
    const plans = plan({
      events: [event('faded', 'sam')],
      participants: [{ takeId: 't1', userId: 'sam', side: 'nah', wager: null }]
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe(TOPICS.takesReactions);
    expect(plans[0].recipients.map((r) => r.userId)).toEqual(['author']);
    expect(plans[0].payload.title).toBe('Sam said Hell Nah to your take');
    expect(plans[0].payload.body).toBe('“Bijan finishes as the RB1.” · If it hits, they owe you $20.');
  });

  it('names a Hell Yeah, and its stake when it has one', () => {
    const plain = plan({
      events: [event('backed', 'sam')],
      participants: [{ takeId: 't1', userId: 'sam', side: 'yeah', wager: null }]
    });
    expect(plain[0].payload.title).toBe('Sam said Hell Yeah to your take');
    expect(plain[0].payload.body).toBe('“Bijan finishes as the RB1.”');

    const staked = plan({
      events: [event('backed', 'sam')],
      participants: [{ takeId: 't1', userId: 'sam', side: 'yeah', wager: 'a beer' }]
    });
    expect(staked[0].payload.title).toBe('Sam said Hell Yeah to your take, with a beer on it');
  });

  it('says nothing about a Hell Nah withdrawn, or switched to a Hell Yeah, before the run', () => {
    expect(plan({ events: [event('faded', 'sam')], participants: [] })).toEqual([]);
    expect(plan({
      events: [event('faded', 'sam')],
      participants: [{ takeId: 't1', userId: 'sam', side: 'yeah', wager: null }]
    })).toEqual([]);
  });

  it('respects the author turning reactions off, and nobody else hears them', () => {
    const plans = plan({
      events: [event('faded', 'sam')],
      participants: [{ takeId: 't1', userId: 'sam', side: 'nah', wager: null }],
      subscriptions: [sub('author', [TOPICS.takesNew]), sub('sam', everything)]
    });
    expect(plans).toEqual([]);
  });

  it('skips stale events, deleted takes, withdrawals and grades', () => {
    expect(plan({ events: [event('posted', 'author', { createdAt: minutesAgo(TAKE_EVENT_MAX_AGE_HOURS * 60 + 1) })] })).toEqual([]);
    expect(plan({ events: [event('posted', 'author', { takeId: 'gone' })] })).toEqual([]);
    expect(plan({ events: [event('unfaded', 'sam'), event('graded', 'author')] })).toEqual([]);
  });

  it('keeps take wording away from accounts that may not read takes', () => {
    const plans = plan({ events: [event('posted', 'author')], excludedUserIds: new Set(['sam']) });
    expect(plans).toEqual([]);
  });

  it('gives each reaction its own tag so two Hell Nahs are two notifications', () => {
    const plans = plan({
      events: [event('faded', 'sam'), event('faded', 'lee', { createdAt: minutesAgo(1) })],
      participants: [
        { takeId: 't1', userId: 'sam', side: 'nah', wager: null },
        { takeId: 't1', userId: 'lee', side: 'nah', wager: null }
      ]
    });
    expect(plans.map((p) => p.payload.title)).toEqual(['Sam said Hell Nah to your take', 'Lee said Hell Nah to your take']);
    expect(new Set(plans.map((p) => p.payload.tag)).size).toBe(2);
  });
});

describe('planTakeNotifications, staked Hell Yeahs', () => {
  const NOW = new Date('2026-10-07T18:00:00Z');
  const TAKE = { id: 't1', authorId: 'author', body: 'Bijan finishes as the RB1.', wager: '$20' };
  const everything = [TOPICS.takesNew, TOPICS.takesReactions, TOPICS.takesStakes];
  const backed = { id: 'e-backed', takeId: 't1', seasonId: 's26', eventType: 'backed', subjectId: 'jo', createdAt: new Date(NOW.getTime() - 60_000) };
  const participants = [
    { id: 'y-jo', takeId: 't1', userId: 'jo', side: 'yeah', wager: '$10' },
    { id: 'n-sam', takeId: 't1', userId: 'sam', side: 'nah', wager: null },
    { id: 'n-lee', takeId: 't1', userId: 'lee', side: 'nah', wager: null }
  ];
  const plan = (overrides) => planTakeNotifications({
    now: NOW,
    events: [backed],
    takes: new Map([['t1', TAKE]]),
    participants,
    subscriptions: [sub('author', everything), sub('jo', everything), sub('sam', everything), sub('lee', everything)],
    displayNames: { author: 'Humza', jo: 'Jo', sam: 'Sam', lee: 'Lee' },
    ...overrides
  });
  const stakePlan = (plans) => plans.find((p) => p.kind === TOPICS.takesStakes);

  it('asks every Hell Nah whether they accept it, as well as telling the author', () => {
    const plans = plan();
    expect(plans.map((p) => p.kind)).toEqual([TOPICS.takesReactions, TOPICS.takesStakes]);

    const ask = stakePlan(plans);
    expect(ask.eventId).toBe('e-backed');
    expect(ask.recipients.map((r) => r.userId)).toEqual(['sam', 'lee']);
    expect(ask.payload).toEqual({
      title: "Do you accept Jo's Hell Yeah?",
      body: 'Jo put $10 on “Bijan finishes as the RB1.”. Accepting means you\'ll have to pay out to Jo as well if it hits. It\'s your call.',
      url: '/takes?take=t1',
      tag: 'take-stake-e-backed'
    });
  });

  it('asks nobody about a Hell Yeah without a stake', () => {
    const plain = participants.map((p) => (p.side === 'yeah' ? { ...p, wager: null } : p));
    expect(stakePlan(plan({ participants: plain }))).toBeUndefined();
  });

  it('skips a Hell Nah who has already answered, and nobody else: each answers for themselves', () => {
    expect(stakePlan(plan({
      stakeResponses: [{ hellYeahId: 'y-jo', userId: 'sam', response: 'accepted' }]
    })).recipients.map((r) => r.userId)).toEqual(['lee']);

    expect(stakePlan(plan({
      stakeResponses: [{ hellYeahId: 'y-jo', userId: 'sam', response: 'declined' }]
    })).recipients.map((r) => r.userId)).toEqual(['lee']);
  });

  it('respects the topic, and keeps the wording from accounts that may not read takes', () => {
    const ask = stakePlan(plan({
      subscriptions: [sub('sam', [TOPICS.takesReactions]), sub('lee', everything)],
      excludedUserIds: new Set(['lee'])
    }));
    expect(ask).toBeUndefined();
  });

  it('claims each audience separately, so one sent does not stop the other', () => {
    const plans = plan({ claimed: new Set([`e-backed:${TOPICS.takesReactions}`]) });
    expect(plans.map((p) => p.kind)).toEqual([TOPICS.takesStakes]);
    expect(plan({ claimed: new Set([`e-backed:${TOPICS.takesStakes}`]) }).map((p) => p.kind))
      .toEqual([TOPICS.takesReactions]);
  });
});

describe('previewTake', () => {
  it('collapses whitespace and trims a long take to the lock screen', () => {
    expect(previewTake('  two\n\nlines  ')).toBe('two lines');
    const long = 'x'.repeat(200);
    expect(previewTake(long)).toHaveLength(140);
    expect(previewTake(long).endsWith('…')).toBe(true);
  });
});

describe('planTakeNotifications · edits', () => {
  const NOW = new Date('2026-10-06T14:00:00Z');
  const minutesAgo = (minutes) => new Date(NOW.getTime() - minutes * 60_000);
  const edited = (id, minutes, extra = {}) => ({
    id, takeId: 't1', seasonId: 's26', eventType: 'edited', subjectId: null, createdAt: minutesAgo(minutes), ...extra
  });
  const posted = (minutes) => ({
    id: 'post', takeId: 't1', seasonId: 's26', eventType: 'posted', subjectId: null, createdAt: minutesAgo(minutes)
  });
  const takes = new Map([['t1', { id: 't1', authorId: 'author', body: 'Nobody goes 13-1 either', wager: '$20' }]]);
  const subscriptions = [sub('author', [TOPICS.takesNew]), sub('member', [TOPICS.takesNew]), sub('quiet', [TOPICS.takesReactions])];
  const base = { now: NOW, takes, subscriptions, displayNames: { author: 'Jo' } };

  it("tells everybody with new takes on but the author, in the take's new wording", () => {
    const [plan] = planTakeNotifications({ ...base, events: [edited('e1', 2)], claimed: new Set(['post:takes_new']) });

    expect(plan.recipients.map((r) => r.userId)).toEqual(['member']);
    expect(plan.payload.title).toBe('Jo edited a take');
    expect(plan.payload.body).toBe('“Nobody goes 13-1 either” · $20 on it');
  });

  it('shares the post\'s tag, so the new wording replaces the old on a device', () => {
    const [plan] = planTakeNotifications({ ...base, events: [edited('e1', 2)] });
    expect(plan.payload.tag).toBe('take-t1');
  });

  it('says nothing about an admin correcting a take', () => {
    expect(planTakeNotifications({ ...base, events: [edited('e1', 2, { actedAsAdmin: true })] })).toEqual([]);
  });

  it('sends one notification for several saves, and claims the rest with it', () => {
    const plans = planTakeNotifications({ ...base, events: [edited('e1', 4), edited('e2', 3), edited('e3', 2)] });

    expect(plans).toHaveLength(1);
    expect(plans[0].eventId).toBe('e3');
    expect(plans[0].absorbs).toEqual(['e1', 'e2']);
  });

  it('lets a post not yet announced speak for its edits', () => {
    const plans = planTakeNotifications({ ...base, events: [posted(5), edited('e1', 2)] });

    expect(plans).toHaveLength(1);
    expect(plans[0].eventId).toBe('post');
    expect(plans[0].absorbs).toEqual(['e1']);
  });

  it('still announces an edit once the post has gone out', () => {
    const plans = planTakeNotifications({
      ...base,
      events: [posted(30), edited('e1', 2)],
      claimed: new Set(['post:takes_new'])
    });

    expect(plans.map((plan) => plan.eventId)).toEqual(['e1']);
  });

  it('never repeats an edit already sent', () => {
    expect(planTakeNotifications({ ...base, events: [edited('e1', 2)], claimed: new Set(['e1:takes_new']) })).toEqual([]);
  });

  it('lets an old edit age out', () => {
    const stale = edited('e1', (TAKE_EVENT_MAX_AGE_HOURS + 1) * 60);
    expect(planTakeNotifications({ ...base, events: [stale] })).toEqual([]);
  });
});

describe('newestFinishedWeek', () => {
  const game = (week, isCompleted, extra = {}) => ({ week, isCompleted, team2Id: 'b', type: 'regular', ...extra });

  it('is the newest week every game of which is over', () => {
    expect(newestFinishedWeek([game(7, true), game(7, true), game(8, true), game(8, false)])).toBe(7);
  });

  it('is not held up by a bye row, which is nobody\'s game', () => {
    expect(newestFinishedWeek([game(15, true), game(15, false, { type: 'bye', team2Id: null })])).toBe(15);
  });

  it('is null before anything has finished', () => {
    expect(newestFinishedWeek([game(1, false)])).toBeNull();
    expect(newestFinishedWeek([])).toBeNull();
  });
});

describe('planWinnerNotifications', () => {
  const score = (userId, totalPoints, extra = {}) => ({
    userId, totalPoints, correctPicks: totalPoints, decidedPicks: 7, ...extra
  });
  const wants = (userId) => sub(userId, [TOPICS.pickemsWins]);
  const firstHalf = PICK_EM_TOURNEYS.find((tourney) => tourney.id === 'first-half');

  describe('a week', () => {
    const scores = [score('a', 6), score('b', 5)];

    it('goes to the winner and nobody else', () => {
      const [plan] = planWinnerNotifications({
        weekly: { week: 8, scores },
        subscriptions: [wants('a'), wants('b')]
      });

      expect(plan).toMatchObject({ kind: WIN_KINDS.week, week: 8, inbox: ['a'] });
      expect(plan.recipients.map((r) => r.userId)).toEqual(['a']);
      expect(plan.payload.title).toBe("You won week 8 pick'ems");
      expect(plan.payload.body).toBe('6 of 7 right.');
    });

    it('tells everybody tied for first, and that it was a tie', () => {
      const [plan] = planWinnerNotifications({
        weekly: { week: 8, scores: [score('a', 6), score('b', 6), score('c', 6), score('d', 2)] },
        subscriptions: [wants('a'), wants('b'), wants('c'), wants('d')]
      });

      expect(plan.inbox).toEqual(['a', 'b', 'c']);
      expect(plan.payload.title).toBe('You tied for 1st in week 8');
      expect(plan.payload.body).toBe('6 of 7 right. Tied with 2 others.');
    });

    it('has no winner when nobody scored', () => {
      expect(planWinnerNotifications({ weekly: { week: 8, scores: [score('a', 0)] } })).toEqual([]);
    });

    it('keeps it for a winner with no device, and pushes to none', () => {
      const [plan] = planWinnerNotifications({
        weekly: { week: 8, scores },
        subscriptions: [sub('a', [TOPICS.pickemsOpen])]
      });

      expect(plan.inbox).toEqual(['a']);
      expect(plan.recipients).toEqual([]);
    });

    it('never tells an account that is no longer approved', () => {
      const plans = planWinnerNotifications({
        weekly: { week: 8, scores },
        subscriptions: [wants('a')],
        excludedUserIds: new Set(['a'])
      });

      expect(plans).toEqual([]);
    });

    it('sends once', () => {
      const plans = planWinnerNotifications({
        weekly: { week: 8, scores },
        subscriptions: [wants('a')],
        sent: new Set([`${WIN_KINDS.week}:8`])
      });

      expect(plans).toEqual([]);
    });
  });

  describe('a tourney', () => {
    const weeklyScores = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8].map((week) => [week, [
        score('steady', 5),
        // The most points of anybody, in four weeks: under the five-week floor.
        ...(week <= 4 ? [score('sprinter', 12)] : []),
        // Exactly on the floor, and behind.
        ...(week <= 5 ? [score('floor', 7)] : [])
      ]])
    );

    it('goes to the top score over the participation floor', () => {
      const [plan] = planWinnerNotifications({
        tourney: { tourney: firstHalf, weeklyScores },
        subscriptions: [wants('steady'), wants('sprinter'), wants('floor')]
      });

      expect(plan).toMatchObject({ kind: 'pickems_tourney_won:first-half', week: 8, inbox: ['steady'] });
      expect(plan.payload.title).toBe('You won the weeks 1-8 tourney');
      expect(plan.payload.body).toBe('40 points across 8 weeks. The prize is $20 FAAB for this year.');
    });

    it('ignores weeks outside its span', () => {
      const [plan] = planWinnerNotifications({
        tourney: { tourney: firstHalf, weeklyScores: { ...weeklyScores, 9: [score('floor', 100)] } },
        subscriptions: [wants('steady')]
      });

      expect(plan.inbox).toEqual(['steady']);
    });

    it('ties for first like a week does', () => {
      const tied = Object.fromEntries(
        [1, 2, 3, 4, 5].map((week) => [week, [score('a', 5), score('b', 5)]])
      );
      const [plan] = planWinnerNotifications({ tourney: { tourney: firstHalf, weeklyScores: tied } });

      expect(plan.inbox).toEqual(['a', 'b']);
      expect(plan.payload.title).toBe('You tied for the 1-8 tourney');
      expect(plan.payload.body).toBe('25 points across 5 weeks. Tied with one other. The prize is $20 FAAB for this year.');
    });

    it('has no winner when nobody cleared the floor', () => {
      const plans = planWinnerNotifications({
        tourney: { tourney: firstHalf, weeklyScores: { 1: [score('a', 7)], 2: [score('a', 7)] } }
      });

      expect(plans).toEqual([]);
    });
  });

  describe('the playoff bracket', () => {
    it('goes to the top of the standings', () => {
      const [plan] = planWinnerNotifications({
        bracket: { week: 17, standings: [score('a', 9), score('b', 7)] },
        subscriptions: [wants('a'), wants('b')]
      });

      expect(plan).toMatchObject({ kind: WIN_KINDS.bracket, week: 17, inbox: ['a'] });
      expect(plan.payload).toMatchObject({ title: 'You won the playoff bracket', url: '/playoffs' });
    });

    it('ties for first too', () => {
      const [plan] = planWinnerNotifications({
        bracket: { week: 17, standings: [score('a', 9), score('b', 9)] }
      });

      expect(plan.inbox).toEqual(['a', 'b']);
      expect(plan.payload.title).toBe('You tied for the bracket win');
    });
  });

  it('tells a week and the tourney it ended separately', () => {
    const weeklyScores = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8].map((week) => [week, [score('a', 5)]])
    );
    const plans = planWinnerNotifications({
      weekly: { week: 8, scores: weeklyScores[8] },
      tourney: { tourney: firstHalf, weeklyScores },
      subscriptions: [wants('a')]
    });

    expect(plans.map((plan) => plan.kind)).toEqual([WIN_KINDS.week, 'pickems_tourney_won:first-half']);
  });
});
