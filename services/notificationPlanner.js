import { tourneyStandings, tourneyWinners } from '../src/components/pickems/tourneys.js';
import { weekWinners } from '../src/components/pickems/weekWinners.js';

/**
 * What push notifications are due, and to whom. Pure: the sender
 * (`scripts/send-notifications.js`) reads the inputs, calls this, and sends
 * what it returns — the same decide/execute split as `parlayGrader.js` and
 * `espnGameMapper.js`.
 *
 * Pick'ems run on a clock — two fixed pg_cron slots a week (see
 * 20261002120000_push_notifications.sql) — so this module, not the slot, is
 * what decides whether something is due. Takes run on events: a trigger on
 * `take_events` starts the sender (20261007120000_take_notifications.sql),
 * and `planTakeNotifications` decides which of the recent events to announce. A slot that lands when nothing is
 * due sends nothing; a re-run after a send sends nothing, because `sent`
 * carries what `notification_log` already holds.
 */

export const TOPICS = Object.freeze({
  pickemsOpen: 'pickems_open',
  pickemsClosing: 'pickems_closing',
  pickemsWins: 'pickems_wins',
  takesNew: 'takes_new',
  takesReactions: 'takes_reactions',
  takesStakes: 'takes_stakes',
  // Planned by services/matchupFacts.js, which owns the topic's constant.
  matchupFacts: 'matchup_facts',
  taunts: 'taunts'
});

export const ALL_TOPICS = Object.freeze([
  TOPICS.pickemsOpen,
  TOPICS.pickemsClosing,
  TOPICS.pickemsWins,
  TOPICS.takesNew,
  TOPICS.takesReactions,
  TOPICS.takesStakes,
  TOPICS.matchupFacts,
  TOPICS.taunts
]);

/**
 * A closing reminder is due inside this window before the deadline. Wide
 * enough that the Thursday 21:30 UTC slot lands in it under daylight time
 * (2.5 h before an 8 PM ET close) and standard time (3.5 h), narrow enough
 * that a reminder never arrives the day before.
 */
export const CLOSING_LEAD_HOURS = 6;

const HOUR_MS = 60 * 60 * 1000;

/** "8 PM" or "8:30 PM", in the season's zone, with the zone's short name. */
export function formatDeadline(date, timeZone = 'America/New_York') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  const minute = get('minute');
  const time = minute === '00' ? get('hour') : `${get('hour')}:${minute}`;
  // "EDT"/"EST" read as noise in a notification; "ET" is what the league says.
  const zone = get('timeZoneName').replace(/^E[DS]T$/, 'ET').replace(/^C[DS]T$/, 'CT')
    .replace(/^M[DS]T$/, 'MT').replace(/^P[DS]T$/, 'PT');
  return `${time} ${get('dayPeriod')} ${zone}`.replace(/\s+/g, ' ').trim();
}

/** The weekday a deadline falls on, in the season's zone ("Thursday"). */
function weekdayOf(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(date);
}

function isSameLocalDay(a, b, timeZone) {
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return day(a) === day(b);
}

/**
 * The notifications due for one pick'em week.
 *
 * @param {object} input
 * @param {Date} input.now
 * @param {{ id: string, seasonId: string, weekNumber: number, opensAt: Date, closesAt: Date } | null} input.week
 * @param {string} [input.timeZone] the season's IANA zone
 * @param {Set<string>} input.sent kinds already in notification_log for this week
 * @param {Array<{ endpoint: string, userId: string, topics: string[] }>} input.subscriptions
 * @param {Set<string>} input.submittedUserIds members with pick'em picks saved for this week
 * @param {string} [input.url] where tapping the notification goes
 * @returns {Array<{ kind: string, week: number, recipients: object[], payload: object }>}
 */
export function planPickemNotifications({
  now,
  week,
  timeZone = 'America/New_York',
  sent = new Set(),
  subscriptions = [],
  submittedUserIds = new Set(),
  url = '/pickems'
}) {
  if (!week || !(week.opensAt instanceof Date) || !(week.closesAt instanceof Date)) return [];

  const open = now >= week.opensAt && now < week.closesAt;
  if (!open) return [];

  const wants = (topic) => subscriptions.filter((sub) => Array.isArray(sub.topics) && sub.topics.includes(topic));
  const deadline = formatDeadline(week.closesAt, timeZone);
  // "before Thursday 8 PM ET", or just "before 8 PM ET" on the day itself.
  const when = isSameLocalDay(now, week.closesAt, timeZone)
    ? deadline
    : `${weekdayOf(week.closesAt, timeZone)} ${deadline}`;
  const plans = [];

  const closingDue = week.closesAt.getTime() - now.getTime() <= CLOSING_LEAD_HOURS * HOUR_MS;

  // "Open" is not sent once the closing reminder is due: a member hearing for
  // the first time that pick'ems exist three hours before they close is what
  // the reminder is for, and two notifications in one run is one too many.
  if (!sent.has(TOPICS.pickemsOpen) && !closingDue) {
    const recipients = wants(TOPICS.pickemsOpen);
    if (recipients.length) {
      plans.push({
        kind: TOPICS.pickemsOpen,
        week: week.weekNumber,
        recipients,
        payload: {
          title: `Week ${week.weekNumber} pick'ems are open`,
          body: `Make your picks and your TD parlay pick before ${when}.`,
          url,
          tag: `pickems-open-${week.seasonId}-${week.weekNumber}`
        }
      });
    }
  }

  if (!sent.has(TOPICS.pickemsClosing) && closingDue) {
    // Only the members who have not picked. A member with two devices hears
    // on both; one with picks in hears on neither.
    const recipients = wants(TOPICS.pickemsClosing).filter((sub) => !submittedUserIds.has(sub.userId));
    if (recipients.length) {
      plans.push({
        kind: TOPICS.pickemsClosing,
        week: week.weekNumber,
        recipients,
        payload: {
          title: `Pick'ems close at ${deadline}`,
          body: `You haven't made your week ${week.weekNumber} picks yet.`,
          url,
          tag: `pickems-closing-${week.seasonId}-${week.weekNumber}`
        }
      });
    }
  }

  return plans;
}

/**
 * How old a take event may be and still be announced. The sender is started
 * by the event itself and normally runs within a couple of minutes, so this is
 * not the expected delay: it is the cut-off that keeps a backlog — a lost
 * dispatch token, the first run after this shipped against months of history —
 * from arriving as a pile of stale news. An older event is never sent.
 */
export const TAKE_EVENT_MAX_AGE_HOURS = 6;

/** A take's wording, trimmed to what a lock screen shows. */
export const TAKE_PREVIEW_LENGTH = 140;

export function previewTake(body, max = TAKE_PREVIEW_LENGTH) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The take notifications due for the recent events nobody has been told about.
 *
 * - **posted** goes to every device with `takes_new`, except the author's.
 *   Whose take it is reads `takes.user_id`, not the event's actor, so a take
 *   the admin posts for somebody is not announced back to them.
 * - **edited** goes to the same audience, but only the author's own reword:
 *   `actedAsAdmin` is false exactly when it was made inside their 72 hours, and
 *   an admin correcting a take is not news. One save after another is one
 *   notification: a run reads the take as it stands, so the newest unsent edit
 *   speaks for the rest, and a post not yet announced speaks for all of them.
 *   They travel in the plan's `absorbs`, which the sender claims with it.
 * - **faded** / **backed** go to the take's author's devices with
 *   `takes_reactions`, and to nobody else. Only while the Hell Nah or Hell
 *   Yeah still stands: one withdrawn before the sender ran is not news, and
 *   switching sides writes a fresh event for the new side.
 * - **backed with a stake** also goes, under `takes_stakes`, to every Hell
 *   Nah on the take who has not answered it yet: "Do you accept this Hell
 *   Yeah?" A staked Hell Yeah is an offer each of them takes on or not
 *   (20261010120000_take_stake_responses.sql), and this is how they hear of it.
 * - Withdrawals, grades and answers are not announced.
 *
 * Each plan is one audience for one event, claimed by `(event id, kind)`, so
 * a staked Hell Yeah can tell the author and the Hell Nahs once each. A plan
 * with nobody to tell is left unclaimed, and ages out.
 *
 * @param {object} input
 * @param {Date} input.now
 * @param {Array<{ id: string, takeId: string, seasonId: string, eventType: string, subjectId: string|null, actedAsAdmin?: boolean, createdAt: Date }>} input.events
 *   recent announceable events
 * @param {Set<string>} [input.claimed] `${eventId}:${kind}` already in notification_log
 * @param {Map<string, { id: string, authorId: string, body: string, wager: string|null }>} input.takes by id
 * @param {Array<{ id?: string, takeId: string, userId: string, side: 'nah'|'yeah', wager: string|null }>} input.participants
 * @param {Array<{ hellYeahId: string, userId: string, response: 'accepted'|'declined' }>} [input.stakeResponses]
 * @param {Array<{ endpoint: string, userId: string, topics: string[] }>} input.subscriptions
 * @param {Record<string, string>} [input.displayNames] user id → name
 * @param {Set<string>} [input.excludedUserIds] accounts that may not read takes (not approved)
 */
export function planTakeNotifications({
  now,
  events = [],
  claimed = new Set(),
  takes = new Map(),
  participants = [],
  stakeResponses = [],
  subscriptions = [],
  displayNames = {},
  excludedUserIds = new Set()
}) {
  const oldest = now.getTime() - TAKE_EVENT_MAX_AGE_HOURS * HOUR_MS;
  const nameOf = (userId) => displayNames[userId] || 'Somebody';
  const standing = new Map(participants.map((p) => [`${p.takeId}:${p.userId}`, p]));
  // Takes are members-only; their wording is the notification.
  const readers = subscriptions.filter((sub) => !excludedUserIds.has(sub.userId) && Array.isArray(sub.topics));

  const answered = new Set(stakeResponses.map((r) => `${r.hellYeahId}:${r.userId}`));

  const plans = [];
  const due = (event, kind) => !claimed.has(`${event.id}:${kind}`);
  const ordered = [...events].sort((a, b) => a.createdAt - b.createdAt);
  const fresh = (event) => event.createdAt instanceof Date && event.createdAt.getTime() >= oldest;

  // What this run has yet to say about each take's wording.
  const unsentPosts = new Set();
  const unsentEdits = new Map();
  for (const event of ordered) {
    if (!fresh(event) || !due(event, TOPICS.takesNew)) continue;
    if (event.eventType === 'posted') unsentPosts.add(event.takeId);
    if (event.eventType === 'edited' && !event.actedAsAdmin) {
      unsentEdits.set(event.takeId, [...(unsentEdits.get(event.takeId) ?? []), event.id]);
    }
  }

  for (const event of ordered) {
    if (!fresh(event)) continue;
    const take = takes.get(event.takeId);
    if (!take) continue;

    const url = `/takes?take=${encodeURIComponent(take.id)}`;
    const quoted = `“${previewTake(take.body)}”`;

    if (event.eventType === 'posted') {
      if (!due(event, TOPICS.takesNew)) continue;
      const recipients = readers.filter((sub) => sub.topics.includes(TOPICS.takesNew) && sub.userId !== take.authorId);
      if (!recipients.length) continue;
      plans.push({
        kind: TOPICS.takesNew,
        eventId: event.id,
        seasonId: event.seasonId,
        recipients,
        absorbs: unsentEdits.get(take.id) ?? [],
        payload: {
          title: `New take from ${nameOf(take.authorId)}`,
          body: take.wager ? `${quoted} · ${take.wager} on it` : quoted,
          url,
          tag: `take-${take.id}`
        }
      });
      continue;
    }

    if (event.eventType === 'edited') {
      const edits = unsentEdits.get(take.id) ?? [];
      if (unsentPosts.has(take.id) || edits[edits.length - 1] !== event.id) continue;
      const recipients = readers.filter((sub) => sub.topics.includes(TOPICS.takesNew) && sub.userId !== take.authorId);
      if (!recipients.length) continue;
      plans.push({
        kind: TOPICS.takesNew,
        eventId: event.id,
        seasonId: event.seasonId,
        recipients,
        absorbs: edits.slice(0, -1),
        // The post's tag: on a device the new wording replaces the old.
        payload: {
          title: `${nameOf(take.authorId)} edited a take`,
          body: take.wager ? `${quoted} · ${take.wager} on it` : quoted,
          url,
          tag: `take-${take.id}`
        }
      });
      continue;
    }

    if (event.eventType !== 'faded' && event.eventType !== 'backed') continue;

    const side = event.eventType === 'faded' ? 'nah' : 'yeah';
    const participant = standing.get(`${take.id}:${event.subjectId}`);
    if (!participant || participant.side !== side) continue;
    if (event.subjectId === take.authorId) continue;

    const who = nameOf(event.subjectId);
    const authorRecipients = due(event, TOPICS.takesReactions)
      ? readers.filter((sub) => sub.topics.includes(TOPICS.takesReactions) && sub.userId === take.authorId)
      : [];

    if (authorRecipients.length) {
      let title;
      if (side === 'nah') {
        title = `${who} said Hell Nah to your take`;
      } else if (participant.wager) {
        title = `${who} said Hell Yeah to your take, with ${participant.wager} on it`;
      } else {
        title = `${who} said Hell Yeah to your take`;
      }
      // The Hell Nah is the one with consequences for the author: it is the
      // other side of their stake. fadeTerms in milestones.js is the rule.
      const body = side === 'nah' && take.wager
        ? `${quoted} · If it hits, they owe you ${take.wager}.`
        : quoted;

      plans.push({
        kind: TOPICS.takesReactions,
        eventId: event.id,
        seasonId: event.seasonId,
        recipients: authorRecipients,
        // One tag per event: two Hell Nahs are two notifications, not one
        // replacing the other.
        payload: { title, body, url, tag: `take-${side}-${event.id}` }
      });
    }

    // A staked Hell Yeah asks every Hell Nah on the take whether they'll
    // take it on. Each answers for themselves, so somebody else's no changes
    // nothing here; only those who have already answered are skipped.
    if (side !== 'yeah' || !participant.wager || !due(event, TOPICS.takesStakes)) continue;

    const askIds = new Set(participants
      .filter((p) => p.takeId === take.id && p.side === 'nah' && p.userId !== event.subjectId)
      .filter((p) => !participant.id || !answered.has(`${participant.id}:${p.userId}`))
      .map((p) => p.userId));
    const askRecipients = readers.filter((sub) => sub.topics.includes(TOPICS.takesStakes) && askIds.has(sub.userId));
    if (!askRecipients.length) continue;

    plans.push({
      kind: TOPICS.takesStakes,
      eventId: event.id,
      seasonId: event.seasonId,
      recipients: askRecipients,
      // stakeRequestTerms / STAKE_AGREEMENT_RULE in milestones.js say the
      // same thing on the take itself, where the answer is given.
      payload: {
        title: `Do you accept ${who}'s Hell Yeah?`,
        body: `${who} put ${participant.wager} on ${quoted}. Accepting means you'll have to pay out to ${who} as well if it hits. It's your call.`,
        url,
        tag: `take-stake-${event.id}`
      }
    });
  }

  return plans;
}

/** The `notification_log` kinds for winning, each claimed per (season, week). */
export const WIN_KINDS = Object.freeze({
  week: 'pickems_week_won',
  tourney: (id) => `pickems_tourney_won:${id}`,
  bracket: 'playoff_bracket_won'
});

/**
 * The newest week every game of which is over, or null. A bye row is nobody's
 * game. Scores land as a week on Tuesday, so a week with a game still to come
 * is not over, and the sender looks no further back than this: an older result
 * is old news, which is also what stops the first run after this shipped from
 * announcing every week of the season at once.
 *
 * @param {Array<{ week: number, type?: string, team2Id?: string|null, isCompleted: boolean }>} games
 */
export function newestFinishedWeek(games = []) {
  const weeks = new Map();
  for (const game of games) {
    if (game.type === 'bye' || game.team2Id == null) continue;
    weeks.set(game.week, (weeks.get(game.week) ?? true) && Boolean(game.isCompleted));
  }
  const finished = [...weeks].filter(([, done]) => done).map(([week]) => week);
  return finished.length ? Math.max(...finished) : null;
}

/**
 * The winners due. Each goes to the winners and nobody else, and a tie for
 * first is every member on it: each is told, and told it was a tie.
 *
 * - **week** — the top score of a pick'em week (`weekWinners`).
 * - **tourney** — the top score across a tourney's weeks among members over its
 *   participation floor (`tourneyWinners`).
 * - **bracket** — the top score in the playoff bracket challenge, once the
 *   admin has released the results.
 *
 * A plan's `inbox` is every winner, device or not, because a member with no
 * notifications on still won; `recipients` is the devices that asked to hear.
 * A week nobody scored in has no winner, and so no plan.
 *
 * @param {object} input
 * @param {{ week: number, scores: Array }} [input.weekly]
 * @param {{ tourney: object, weeklyScores: Record<number, Array> }} [input.tourney]
 * @param {{ week: number, standings: Array }} [input.bracket]
 * @param {Set<string>} [input.sent] `${kind}:${week}` already in notification_log
 * @param {Array<{ endpoint: string, userId: string, topics: string[] }>} input.subscriptions
 * @param {Set<string>} [input.excludedUserIds] accounts no longer approved
 */
export function planWinnerNotifications({
  weekly = null,
  tourney = null,
  bracket = null,
  sent = new Set(),
  subscriptions = [],
  excludedUserIds = new Set()
}) {
  const plans = [];

  const plan = ({ kind, week, winners, payload }) => {
    if (sent.has(`${kind}:${week}`)) return;
    const inbox = winners.map((winner) => winner.userId).filter((id) => !excludedUserIds.has(id));
    if (!inbox.length) return;
    plans.push({
      kind,
      week,
      inbox,
      recipients: subscriptions.filter((sub) =>
        inbox.includes(sub.userId) && Array.isArray(sub.topics) && sub.topics.includes(TOPICS.pickemsWins)),
      payload
    });
  };

  const withOthers = (winners) => {
    const others = winners.length - 1;
    return others === 1 ? ' Tied with one other.' : ` Tied with ${others} others.`;
  };

  if (weekly) {
    const winners = weekWinners(weekly.scores);
    const [top] = winners;
    const tied = winners.length > 1;
    plan({
      kind: WIN_KINDS.week,
      week: weekly.week,
      winners,
      payload: top && {
        title: tied ? `You tied for 1st in week ${weekly.week}` : `You won week ${weekly.week} pick'ems`,
        body: `${top.correctPicks} of ${top.decidedPicks} right.${tied ? withOthers(winners) : ''}`,
        url: '/pickems',
        tag: `pickems-won-${weekly.week}`
      }
    });
  }

  if (tourney) {
    const { tourney: rules, weeklyScores } = tourney;
    const winners = tourneyWinners(tourneyStandings(rules, weeklyScores));
    const [top] = winners;
    const tied = winners.length > 1;
    // Plain figures, and short: a lock screen shows one line of a title.
    const span = `${rules.startWeek}-${rules.endWeek}`;
    plan({
      kind: WIN_KINDS.tourney(rules.id),
      week: rules.endWeek,
      winners,
      payload: top && {
        title: tied ? `You tied for the ${span} tourney` : `You won the weeks ${span} tourney`,
        body: `${top.totalPoints} points across ${top.entered} weeks.${tied ? withOthers(winners) : ''} The prize is ${rules.prize}.`,
        url: '/pickems',
        tag: `pickems-tourney-won-${rules.id}`
      }
    });
  }

  if (bracket) {
    const winners = weekWinners(bracket.standings);
    const [top] = winners;
    const tied = winners.length > 1;
    plan({
      kind: WIN_KINDS.bracket,
      week: bracket.week,
      winners,
      payload: top && {
        title: tied ? 'You tied for the bracket win' : 'You won the playoff bracket',
        body: `${top.totalPoints} ${top.totalPoints === 1 ? 'point' : 'points'} in the bracket challenge.${tied ? withOthers(winners) : ''}`,
        url: '/playoffs',
        tag: 'playoff-bracket-won'
      }
    });
  }

  return plans;
}

/**
 * Whether a push service's answer means the subscription is gone for good —
 * the member turned notifications off, removed the app, or the subscription
 * expired. Those rows are deleted; anything else is a transient failure and
 * the row stays.
 */
export function isGoneStatus(statusCode) {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Deliver the taunts members have sent. Each goes to every device of every
 * approved account that owns the taunted team and wants `taunts`, and to all
 * of those accounts' Alerts whether or not they have a device — `inbox` lists
 * them. A taunt never reaches the member who sent it, even one who somehow
 * owns both teams.
 *
 *   taunts        `getPendingTaunts` rows
 *   teamAccounts  team id → approved user ids (`getTeamAccounts`)
 */
export function planTauntNotifications({ taunts = [], teamAccounts = new Map(), subscriptions = [] }) {
  return taunts.map((taunt) => {
    const inbox = (teamAccounts.get(taunt.toTeamId) ?? []).filter((userId) => userId !== taunt.fromUserId);
    const told = new Set(inbox);
    return {
      kind: TOPICS.taunts,
      tauntId: taunt.id,
      inbox,
      recipients: subscriptions.filter((sub) =>
        told.has(sub.userId) && Array.isArray(sub.topics) && sub.topics.includes(TOPICS.taunts)),
      payload: {
        title: `${taunt.senderName} taunted you`,
        body: taunt.taunt,
        url: '/alerts',
        tag: `taunt-${taunt.id}`
      }
    };
  });
}
