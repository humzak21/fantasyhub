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
  takesNew: 'takes_new',
  takesReactions: 'takes_reactions',
  takesStakes: 'takes_stakes',
  // Planned by services/matchupFacts.js, which owns the topic's constant.
  matchupFacts: 'matchup_facts'
});

export const ALL_TOPICS = Object.freeze([
  TOPICS.pickemsOpen,
  TOPICS.pickemsClosing,
  TOPICS.takesNew,
  TOPICS.takesReactions,
  TOPICS.takesStakes,
  TOPICS.matchupFacts
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
 * - **faded** / **backed** go to the take's author's devices with
 *   `takes_reactions`, and to nobody else. Only while the Hell Nah or Hell
 *   Yeah still stands: one withdrawn before the sender ran is not news, and
 *   switching sides writes a fresh event for the new side.
 * - **backed with a stake** also goes, under `takes_stakes`, to every Hell
 *   Nah on the take who has not answered it yet: "Do you accept this Hell
 *   Yeah?" A staked Hell Yeah is a proposal they all have to agree to
 *   (20261010120000_take_stake_responses.sql), and this is how they hear of it.
 * - Withdrawals, edits, grades and answers are not announced.
 *
 * Each plan is one audience for one event, claimed by `(event id, kind)`, so
 * a staked Hell Yeah can tell the author and the Hell Nahs once each. A plan
 * with nobody to tell is left unclaimed, and ages out.
 *
 * @param {object} input
 * @param {Date} input.now
 * @param {Array<{ id: string, takeId: string, seasonId: string, eventType: string, subjectId: string|null, createdAt: Date }>} input.events
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
  const anyDeclined = new Set(stakeResponses.filter((r) => r.response === 'declined').map((r) => r.hellYeahId));

  const plans = [];
  const due = (event, kind) => !claimed.has(`${event.id}:${kind}`);
  const ordered = [...events].sort((a, b) => a.createdAt - b.createdAt);

  for (const event of ordered) {
    if (!(event.createdAt instanceof Date) || event.createdAt.getTime() < oldest) continue;
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
        payload: {
          title: `New take from ${nameOf(take.authorId)}`,
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

    // A staked Hell Yeah asks every Hell Nah on the take whether they accept
    // it. Only those still to answer: somebody who joined after it agreed by
    // joining, and once one of them has said no there is nothing to ask.
    if (side !== 'yeah' || !participant.wager || !due(event, TOPICS.takesStakes)) continue;
    if (participant.id && anyDeclined.has(participant.id)) continue;

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
        body: `${who} put ${participant.wager} on ${quoted}. Accepting means you'll have to pay out to ${who} as well if it hits. Every Hell Nah has to agree, or the stake is off.`,
        url,
        tag: `take-stake-${event.id}`
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
