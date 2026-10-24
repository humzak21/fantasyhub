/**
 * Where a pick'em week's window stands, from its own `pick_em_weeks` times.
 *
 * Lifted out of `PickEmsSubmission`, where it was an inline function, because
 * the home page's pick'ems widget asks the same question and a second copy is
 * how the two would come to disagree about whether picks are open. The form,
 * the parlay section under it and the widget all read this.
 *
 * The deadline itself is the database's: `submit_pick_em_picks` and
 * `submit_td_parlay_pick` raise outside the window. This only decides which
 * controls to show, so a button whose only outcome is an error is not drawn.
 */

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/**
 * Time to a deadline as "1d 4h", "3h 12m" or "45m"; null once it has passed
 * or for no deadline at all.
 *
 * @param {string|Date|null} deadline
 * @param {Date} [now]
 */
export function formatCountdown(deadline, now = new Date()) {
  if (!deadline) return null;
  const end = new Date(deadline);
  if (Number.isNaN(end.getTime())) return null;

  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return null;

  const hours = Math.floor(diff / MS_PER_HOUR);
  const minutes = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE);

  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * The form's long form: "1d 4h remaining", "Expired" once passed.
 *
 * @param {string|Date|null} deadline
 * @param {Date} [now]
 */
export function formatTimeRemaining(deadline, now = new Date()) {
  if (!deadline) return null;
  if (Number.isNaN(new Date(deadline).getTime())) return 'Invalid time';
  const countdown = formatCountdown(deadline, now);
  return countdown ? `${countdown} remaining` : 'Expired';
}

/**
 * @typedef {Object} PickEmWindowState
 * @property {'no-week'|'upcoming'|'open'|'closed'|'completed'} status
 * @property {string} message
 * @property {string} [timeInfo]
 * @property {Date} [opensAt]
 * @property {Date} [closesAt]
 * @property {Date} [revealsAt]
 */

/**
 * @param {Object|null} pickEmWeek - a `pick_em_weeks` row (camelCase)
 * @param {Date} [now]
 * @returns {PickEmWindowState}
 */
export function pickEmWindowState(pickEmWeek, now = new Date()) {
  if (!pickEmWeek) return { status: 'no-week', message: "No pick'em week configured" };

  const opensAt = new Date(pickEmWeek.submissionOpensAt);
  const closesAt = new Date(pickEmWeek.submissionClosesAt);
  const revealsAt = new Date(pickEmWeek.resultsRevealAt);
  const times = { opensAt, closesAt, revealsAt };

  if (now < opensAt) {
    return {
      status: 'upcoming',
      message: 'Submissions not yet open',
      timeInfo: `Opens ${opensAt.toLocaleDateString()} at ${opensAt.toLocaleTimeString()}`,
      ...times
    };
  }
  if (now <= closesAt) {
    return {
      status: 'open',
      message: 'Submissions are open!',
      timeInfo: formatTimeRemaining(pickEmWeek.submissionClosesAt, now),
      ...times
    };
  }
  if (now < revealsAt) {
    return {
      status: 'closed',
      message: 'Submissions are closed',
      timeInfo: `Results reveal ${revealsAt.toLocaleDateString()} at ${revealsAt.toLocaleTimeString()}`,
      ...times
    };
  }
  return {
    status: 'completed',
    message: 'Results are available',
    timeInfo: 'Check the results tab',
    ...times
  };
}

/**
 * Picks are locked: the test `LeaguePickSplit` and the parlay's `isRevealed`
 * make over the same state.
 *
 * @param {PickEmWindowState} state
 */
export const isWindowClosed = (state) =>
  state?.status === 'closed' || state?.status === 'completed';

export default pickEmWindowState;
