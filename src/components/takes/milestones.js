/**
 * Milestones: when a take comes due, and who may still change it.
 *
 * The board is sorted by resolution order rather than by posting time, so the
 * next thing to be settled is at the top. That order is a pure function of the
 * milestone, computed here rather than stored as a generated column — it is a
 * league-sized dataset, and keeping it in JavaScript is what lets a future
 * `nfl_game` take sort by kickoff without a schema migration.
 *
 * `canEditTake` and `canDeleteTake` are **mirrors** of the RLS policies, not
 * the rules themselves. The database is what actually refuses a late edit; these
 * exist so the UI does not offer a button that is going to fail.
 */

import { getWeekLabel } from '../../../utils/weekLabelUtils.js';

export const TARGET_WEEK = 'week';
export const TARGET_END_OF_REGULAR_SEASON = 'end_of_regular_season';
export const TARGET_END_OF_SEASON = 'end_of_season';

/**
 * How long after posting an author may still reword their take. Mirrors the
 * `now() < created_at + interval '72 hours'` clause in the `takes author edit`
 * policy; changing one without the other gives the reader a button that fails.
 */
export const EDIT_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Sort position. Weeks sort by their own number; the two terminal milestones
 * sit beyond any possible week, in the order they actually arrive. The gap
 * between them is deliberate — a future kickoff-timed take needs somewhere to
 * land between "week 14" and "end of the regular season".
 */
export function milestoneSortKey(take) {
  if (take?.targetType === TARGET_WEEK) return take.targetWeek ?? 0;
  if (take?.targetType === TARGET_END_OF_REGULAR_SEASON) return 900;
  if (take?.targetType === TARGET_END_OF_SEASON) return 1000;
  return Number.MAX_SAFE_INTEGER;
}

/**
 * What the section header says.
 *
 * Week takes go through `getWeekLabel` so a playoff week reads "Semifinals"
 * rather than "Week 16" — the board and the week navigator must not disagree
 * about what week 16 is called.
 */
export function milestoneLabel(take, config = null) {
  if (take?.targetType === TARGET_END_OF_REGULAR_SEASON) return 'End of regular season';
  if (take?.targetType === TARGET_END_OF_SEASON) return 'End of season';

  if (take?.targetType === TARGET_WEEK) {
    return getWeekLabel(take.targetWeek, config?.regularSeasonWeeks, config?.weekCount);
  }

  return 'Unscheduled';
}

/** A stable identity for a milestone, so two takes about week 3 group together. */
export function milestoneKey(take) {
  return take?.targetType === TARGET_WEEK
    ? `week:${take.targetWeek}`
    : String(take?.targetType ?? 'unknown');
}

/**
 * The board, in resolve order.
 *
 * Returns `[{ key, label, sortKey, takes }]`. Takes keep the order they came in
 * within a section, which is newest-first from the query — so the section says
 * *when* and the order within it says *how recently somebody called it*.
 */
export function groupByMilestone(takes = [], config = null) {
  const sections = new Map();

  for (const take of takes) {
    const key = milestoneKey(take);
    if (!sections.has(key)) {
      sections.set(key, {
        key,
        label: milestoneLabel(take, config),
        sortKey: milestoneSortKey(take),
        takes: []
      });
    }
    sections.get(key).takes.push(take);
  }

  return [...sections.values()].sort((a, b) => a.sortKey - b.sortKey);
}

/** Is this take still ungraded? */
export function isPending(take) {
  return take?.status === 'pending';
}

/** Did this viewer post it? */
export function isAuthor(take, user) {
  return Boolean(user?.id && take?.userId === user.id);
}

/**
 * May the viewer reword this take right now? Yours, ungraded, and inside the
 * 72-hour window — the three clauses of the `takes author edit` policy.
 */
export function canEditTake(take, user, now = Date.now()) {
  if (!isAuthor(take, user) || !isPending(take)) return false;
  if (!take?.createdAt) return false;

  const createdAt = new Date(take.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;

  return now < createdAt + EDIT_WINDOW_MS;
}

/** May the viewer delete it? Yours and ungraded; no time limit. */
export function canDeleteTake(take, user) {
  return isAuthor(take, user) && isPending(take);
}

/**
 * May the viewer co-sign it? Signed in, not their own, still ungraded — the
 * `take_participants insert own` policy, restated for the button's benefit.
 */
export function canPlusOne(take, user) {
  return Boolean(user?.id) && !isAuthor(take, user) && isPending(take);
}

/** Has this viewer already co-signed? */
export function hasPlusOned(take, user) {
  if (!user?.id) return false;
  return (take?.takeParticipants || []).some((participant) => participant.userId === user.id);
}

/** How many people co-signed. */
export function plusOneCount(take) {
  return (take?.takeParticipants || []).length;
}

/**
 * Status → badge variant. `info` for pending because a take awaiting its
 * milestone is a statement of fact, not a warning; `warning` for a push, which
 * is the one outcome that is neither.
 */
export const STATUS_BADGE = {
  pending: 'info',
  correct: 'success',
  incorrect: 'destructive',
  push: 'warning'
};

/** Status → what the badge says. */
export const STATUS_LABEL = {
  pending: 'Pending',
  correct: 'Correct',
  incorrect: 'Incorrect',
  push: 'Push'
};
