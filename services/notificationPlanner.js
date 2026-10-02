/**
 * What push notifications are due, and to whom. Pure: the sender
 * (`scripts/send-notifications.js`) reads the inputs, calls this, and sends
 * what it returns — the same decide/execute split as `parlayGrader.js` and
 * `espnGameMapper.js`.
 *
 * The clock that runs the sender is two fixed pg_cron slots a week (see
 * 20261002120000_push_notifications.sql), so this module, not the slot, is
 * what decides whether something is due. A slot that lands when nothing is
 * due sends nothing; a re-run after a send sends nothing, because `sent`
 * carries what `notification_log` already holds.
 */

export const TOPICS = Object.freeze({
  pickemsOpen: 'pickems_open',
  pickemsClosing: 'pickems_closing'
});

export const ALL_TOPICS = Object.freeze([TOPICS.pickemsOpen, TOPICS.pickemsClosing]);

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
 * Whether a push service's answer means the subscription is gone for good —
 * the member turned notifications off, removed the app, or the subscription
 * expired. Those rows are deleted; anything else is a transient failure and
 * the row stays.
 */
export function isGoneStatus(statusCode) {
  return statusCode === 404 || statusCode === 410;
}
