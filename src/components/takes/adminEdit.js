/**
 * The admin's editor, as data: what the form starts from, and what a save sends.
 *
 * Pure, beside `milestones.js` and `activity.js`, so the one decision that
 * matters here — *which columns go up* — is tested without a renderer.
 *
 * **A save sends only what moved.** The log triggers compare with IS DISTINCT,
 * so resending an unchanged body would log nothing — but the grade is not like
 * that: resending `status: 'correct'` comes with a fresh `resolved_at` and
 * `resolved_by`, which re-dates the grade and re-attributes it. Diffing here is
 * what keeps "fixed a typo" from also quietly re-grading the take.
 */

import { milestoneKey, parseMilestoneValue } from './milestones.js';

/** The form's shape. Strings throughout, because they feed controlled inputs. */
export function draftFromTake(take) {
  return {
    body: take?.body ?? '',
    wager: take?.wager ?? '',
    milestone: take ? milestoneKey(take) : '',
    status: take?.status ?? 'pending',
    userId: take?.userId ?? ''
  };
}

/** Blank and absent are one fact for a stake: NULL. Same rule as `takes.js`. */
const normalizeWager = (wager) => {
  const trimmed = typeof wager === 'string' ? wager.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * The patch a save sends: `{ body?, wager?, targetType?, targetWeek?, status?,
 * userId? }`, holding only the fields that differ from the take.
 *
 * The milestone travels as a pair or not at all — `takes_target_week_check` is
 * a biconditional, so a type without its week (or a week without its type) is
 * rejected. An empty object means nothing changed, and the caller should not
 * write.
 */
export function buildAdminTakePatch(take, draft) {
  const patch = {};

  const body = (draft.body ?? '').trim();
  if (body !== (take.body ?? '')) patch.body = body;

  const wager = normalizeWager(draft.wager);
  if (wager !== (take.wager ?? null)) patch.wager = wager;

  const { targetType, targetWeek } = parseMilestoneValue(draft.milestone);
  if (targetType !== take.targetType || (targetWeek ?? null) !== (take.targetWeek ?? null)) {
    patch.targetType = targetType;
    patch.targetWeek = targetWeek;
  }

  if (draft.status !== take.status) patch.status = draft.status;

  if (draft.userId && draft.userId !== take.userId) patch.userId = draft.userId;

  return patch;
}
