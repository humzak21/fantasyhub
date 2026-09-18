/**
 * Milestones: when a take comes due, and who may still change it.
 *
 * The board is sorted by resolution order rather than by posting time, so the
 * next thing to be settled is at the top. That order is a pure function of the
 * milestone, computed here rather than stored as a generated column — it is a
 * league-sized dataset, and keeping it in JavaScript is what lets a future
 * `nfl_game` take sort by kickoff without a schema migration.
 *
 * `canEditTake`, `canDeleteTake`, `canFade` and `canWithdrawFade` are
 * **mirrors** of the RLS policies, not the rules themselves. The database is
 * what actually refuses a late edit, a fade on an unstaked take, or either
 * side of a Hell Nah once the take's three-day window has run out; these exist
 * so the UI does not offer a button that is going to fail.
 */

import { formatDateTime } from '../../lib/utils';
import { listWeeks } from '../../../utils/seasonConfig.js';
import { getWeekLabel } from '../../../utils/weekLabelUtils.js';

export const TARGET_WEEK = 'week';
export const TARGET_END_OF_REGULAR_SEASON = 'end_of_regular_season';
export const TARGET_END_OF_SEASON = 'end_of_season';

/** Mirrors `takes_body_check`. */
export const MAX_BODY = 500;

/** Mirrors `takes_wager_check`. The stake is a phrase — "$20", "40 FAAB" — not
 *  an essay, and a length the database will refuse should not be typeable. */
export const MAX_WAGER = 200;

/**
 * How long after posting an author may still reword their take. Mirrors the
 * `now() < created_at + interval '72 hours'` clause in the `takes author edit`
 * policy; changing one without the other gives the reader a button that fails.
 */
export const EDIT_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * How long a take stays open to Hell Nahs, measured from the last time it
 * moved. Mirrors the `now() < coalesce(t.edited_at, t.created_at) + interval
 * '72 hours'` clause that the `take_participants insert own` **and**
 * `take_participants withdraw own` policies both carry.
 *
 * Two rules, one window, on purpose. A take whose wording is settled is a
 * fixed bet, and both sides of a fixed bet have to be settled with it: if
 * fading closed but withdrawing stayed open, somebody could watch three weeks
 * of football and then quietly step off a take that was going to hit. The
 * clock runs from the *edit* rather than the posting because rewording a take
 * changes what was agreed to — the people already on the other side of it are
 * now fading a different sentence, so they get the window back.
 */
export const FADE_WINDOW_MS = 72 * 60 * 60 * 1000;

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

/** The inverse of `milestoneKey`, for a `Select` whose values are those keys:
 *  `week:3` → `{ targetType: 'week', targetWeek: 3 }`, and a terminal milestone
 *  carries no week. */
export function parseMilestoneValue(value) {
  if (typeof value === 'string' && value.startsWith(`${TARGET_WEEK}:`)) {
    return { targetType: TARGET_WEEK, targetWeek: Number(value.slice(TARGET_WEEK.length + 1)) };
  }
  return { targetType: value, targetWeek: null };
}

/**
 * Every milestone a take can resolve at, as `{ value, label }` in resolve
 * order. One list for the composer and the admin's editor, so the two cannot
 * offer different calendars.
 */
export function milestoneOptions(config = null) {
  return [
    ...listWeeks(config).map((week) => {
      const take = { targetType: TARGET_WEEK, targetWeek: week };
      return { value: milestoneKey(take), label: milestoneLabel(take, config) };
    }),
    { value: TARGET_END_OF_REGULAR_SEASON, label: 'End of regular season' },
    { value: TARGET_END_OF_SEASON, label: 'End of season' }
  ];
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

/** Did the author put anything on the line? A stake is optional, and NULL is
 *  its only "no" — `takes_wager_check` forbids the empty-string spelling. */
export function hasWager(take) {
  return Boolean(take?.wager);
}

/**
 * When this take stops accepting Hell Nahs, as a timestamp — the last edit, or
 * the posting if it was never edited, plus the window. Returns null for a take
 * carrying no usable date, which `isFadeWindowOpen` reads as closed rather
 * than as forever.
 */
export function fadeDeadline(take) {
  const moved = take?.editedAt || take?.createdAt;
  if (!moved) return null;

  const at = new Date(moved).getTime();
  return Number.isNaN(at) ? null : at + FADE_WINDOW_MS;
}

/** Is this take still inside its Hell Nah window? */
export function isFadeWindowOpen(take, now = Date.now()) {
  const deadline = fadeDeadline(take);
  return deadline !== null && now < deadline;
}

/**
 * May the viewer say Hell Nah to it? Signed in, not their own, still ungraded,
 * there is a wager to fade, and the window is still open — the five clauses of
 * the `take_participants insert own` policy, restated for the button's benefit.
 *
 * The wager clause is the one that matters most here. Nothing is staked on a
 * bare take, so there is no side to take and no payout to owe; offering the
 * button anyway would produce a row the database now refuses.
 */
export function canFade(take, user, now = Date.now()) {
  return (
    Boolean(user?.id) &&
    !isAuthor(take, user) &&
    isPending(take) &&
    hasWager(take) &&
    isFadeWindowOpen(take, now)
  );
}

/**
 * May the viewer take their own Hell Nah back? The same window, which is the
 * whole point of it: a fade is withdrawable for three days and then it is a
 * position, not an opinion. Mirrors `take_participants withdraw own`.
 *
 * Deliberately not "the inverse of canFade" — this one does not care about the
 * wager. A take whose stake was cleared with fades still on it leaves rows
 * behind, and the people holding them must still be able to step off inside
 * the window.
 */
export function canWithdrawFade(take, user, now = Date.now()) {
  return (
    Boolean(user?.id) && hasFaded(take, user) && isPending(take) && isFadeWindowOpen(take, now)
  );
}

/** Is this viewer already on the other side of it? */
export function hasFaded(take, user) {
  if (!user?.id) return false;
  return (take?.takeParticipants || []).some((participant) => participant.userId === user.id);
}

/** How many people are fading it — and so how many the author owes if it misses. */
export function fadeCount(take) {
  return (take?.takeParticipants || []).length;
}

/**
 * What the fade costs, said once so the card, the sheet and the composer
 * cannot drift into three different promises about the same click.
 */
export function fadeTerms(take) {
  return `Say Hell Nah and you're taking the other side: if this take hits, you owe ${take?.wager}. If it misses, the author owes you.`;
}

/**
 * The deadline, in as few words as a card can spare: one muted line under the
 * Hell Nah row that every signed-in reader gets, whether or not there is a
 * button beside it. A take whose window has closed looks exactly like one
 * whose window is open minus a button, and "the button is missing" is not
 * something a reader should have to infer.
 */
export function fadeWindowNote(take, now = Date.now()) {
  const deadline = fadeDeadline(take);
  if (deadline === null) return null;

  return now < deadline
    ? `Hell Nahs close ${formatDateTime(deadline)}`
    : `Hell Nahs closed ${formatDateTime(deadline)}`;
}

/**
 * The window, in words, for wherever there is room for the reason as well as
 * the fact. Kept apart from `fadeTerms` because the deadline is a different
 * kind of fact — what it costs does not change, when you can still change your
 * mind does — and the closed phrasing has to read as final rather than as an
 * instruction.
 */
export function fadeWindowTerms(take, now = Date.now()) {
  return isFadeWindowOpen(take, now)
    ? 'Hell Nahs close 3 days after the take was last edited. Until then you can take yours back; after that it is locked in either way.'
    : 'Hell Nahs are closed on this take — it has been more than 3 days since it was last edited, so nobody can join and nobody can back out.';
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
