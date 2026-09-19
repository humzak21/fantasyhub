/**
 * Turning a `take_events` row into a sentence.
 *
 * The database records what moved; this decides what that reads as. It is a
 * pure function of the row so it can be tested without a renderer, and so the
 * sheet's timeline holds markup and nothing else — the same split as
 * `milestones.js`, which is next door because it owns the *other* thing a take
 * event needs said in English: which milestone a take resolves at.
 *
 * Two rules hold everywhere below:
 *
 *   * **"No stake" is a value, not a blank.** A wager cleared from `$50` to
 *     NULL is a change somebody should be able to see happen, so NULL renders
 *     as words rather than as an empty cell that looks like a rendering bug.
 *
 *   * **A backfilled event says so and shows no diff.** Those rows predate the
 *     log; their old values were never recorded. Showing the take's *current*
 *     wording as what was "posted" would be a fabrication the reader has no way
 *     to catch, so the entry carries a note instead.
 *
 *   * **An admin act is signed "Admin".** `acted_as_admin` is stamped by the
 *     log triggers when an act used the admin's privilege. The admin is also a
 *     member, so their own name on a reworded take cannot tell a reader whether
 *     the author changed their mind or the commissioner changed it for them.
 */

import { STATUS_LABEL, milestoneLabel } from './milestones.js';

/** How a missing stake reads. Not an empty string: see the note above. */
const NO_STAKE = 'No stake';

/** Who an admin act is attributed to. */
export const ADMIN_ACTOR_NAME = 'Admin';

/** `changes.milestone` carries the target type and week on either side; both
 *  go back through `milestoneLabel` so the log and the board agree that week 16
 *  is called "Semifinals". */
function milestoneText(targetType, targetWeek, config) {
  if (!targetType) return null;
  return milestoneLabel({ targetType, targetWeek }, config);
}

function wagerText(value) {
  return value ? String(value) : NO_STAKE;
}

/** Did this row come from the backfill rather than from a live trigger? */
export function isBackfilled(event) {
  return event?.changes?.backfilled === true;
}

/**
 * The fields an `edited` (or `posted`) event should show, in a fixed order.
 *
 * Fixed rather than however `jsonb` happened to serialize the object: an edit
 * that touched the wording and the stake must list them the same way every
 * time, or two entries describing the same kind of change read as different
 * kinds of change.
 */
function editedFields(changes, config, nameOf) {
  const fields = [];

  if (changes?.body) {
    fields.push({
      key: 'body',
      label: 'Wording',
      from: changes.body.from ?? null,
      to: changes.body.to ?? null,
      multiline: true
    });
  }

  if (changes?.wager) {
    fields.push({
      key: 'wager',
      label: 'Stake',
      from: wagerText(changes.wager.from),
      to: wagerText(changes.wager.to),
      multiline: false
    });
  }

  if (changes?.milestone) {
    fields.push({
      key: 'milestone',
      label: 'Resolves',
      from: milestoneText(changes.milestone.from, changes.milestone.fromWeek, config),
      to: milestoneText(changes.milestone.to, changes.milestone.week, config),
      multiline: false
    });
  }

  // Only the admin can reassign a take, and it moves who owes whom, so it is
  // named on both sides like the stake.
  if (changes?.author) {
    fields.push({
      key: 'author',
      label: 'Posted by',
      from: authorText(changes.author.from, nameOf),
      to: authorText(changes.author.to, nameOf),
      multiline: false
    });
  }

  return fields;
}

function authorText(userId, nameOf) {
  return (userId && nameOf?.(userId)) || 'Unknown member';
}

/**
 * One event, as a heading and a set of before/after rows.
 *
 * `actorName`, `subjectName` and `nameOf` (for a reassigned author's two ids)
 * are passed in rather than looked up: name masking needs the viewer, which is
 * context the component has and a pure function should not reach for.
 *
 * Returns `{ kind, title, fields, note }`. `fields` with a null `from` render
 * as a plain value — that is a statement of what something *is* (what a take
 * was posted as) rather than of what it became.
 */
export function describeTakeEvent(event, { actorName, subjectName, nameOf, seasonConfig } = {}) {
  const asAdmin = event?.actedAsAdmin === true;
  const who = asAdmin ? ADMIN_ACTOR_NAME : actorName || 'Someone';
  const changes = event?.changes || {};
  const backfilled = isBackfilled(event);

  const note = backfilled
    ? 'Recorded before the activity log existed, so the details were not kept.'
    : null;

  switch (event?.eventType) {
    case 'posted':
      return {
        kind: 'posted',
        title: `${who} posted this take`,
        // A backfilled `posted` has no snapshot to show; a real one carries the
        // take exactly as it was first written, which is the thing arguments
        // about an edited take are actually about.
        fields: backfilled
          ? []
          : [
              changes.body && {
                key: 'body',
                label: 'As posted',
                from: null,
                to: changes.body.to ?? null,
                multiline: true
              },
              changes.wager && {
                key: 'wager',
                label: 'Stake',
                from: null,
                to: wagerText(changes.wager.to),
                multiline: false
              },
              changes.milestone && {
                key: 'milestone',
                label: 'Resolves',
                from: null,
                to: milestoneText(changes.milestone.to, changes.milestone.week, seasonConfig),
                multiline: false
              }
            ].filter(Boolean),
        note
      };

    case 'edited':
      return {
        kind: 'edited',
        title: `${who} edited this take`,
        fields: backfilled ? [] : editedFields(changes, seasonConfig, nameOf),
        note
      };

    case 'graded': {
      const status = changes.status?.to;
      const label = STATUS_LABEL[status] ?? status ?? 'graded';
      const previous = changes.status?.from;
      return {
        kind: 'graded',
        title: `${who} graded it ${label}`,
        // A regrade — Correct to Incorrect, which the admin's editor can do in
        // one save — is only meaningful against the grade it replaced.
        fields:
          previous && previous !== 'pending'
            ? [
                {
                  key: 'status',
                  label: 'Was',
                  from: null,
                  to: STATUS_LABEL[previous] ?? previous,
                  multiline: false
                }
              ]
            : [],
        note: backfilled ? note : null
      };
    }

    case 'reopened': {
      const previous = changes.status?.from;
      return {
        kind: 'reopened',
        title: `${who} reopened it`,
        // Worth naming: reopening a take is only meaningful against the grade
        // it undoes.
        fields: previous
          ? [
              {
                key: 'status',
                label: 'Was',
                from: null,
                to: STATUS_LABEL[previous] ?? previous,
                multiline: false
              }
            ]
          : [],
        note
      };
    }

    // The admin holds a FOR ALL policy on take_participants, so a fade can be
    // placed or pulled by somebody other than its owner. When that happens the
    // log has to name both people, or it reads as the fader changing their own
    // mind.
    case 'faded': {
      const onBehalf = Boolean(
        subjectName && (asAdmin || (actorName && subjectName !== actorName))
      );
      return {
        kind: 'faded',
        title: onBehalf
          ? `${who} added a Hell Nah for ${subjectName}`
          : `${subjectName || who} said Hell Nah`,
        fields: [],
        note
      };
    }

    case 'unfaded': {
      const onBehalf = Boolean(
        subjectName && (asAdmin || (actorName && subjectName !== actorName))
      );
      return {
        kind: 'unfaded',
        title: onBehalf
          ? `${who} removed ${subjectName}'s Hell Nah`
          : `${subjectName || who} took back their Hell Nah`,
        fields: [],
        note
      };
    }

    // Hell Yeah, the same shape as Hell Nah. A backed row carries the stake
    // the backer added, if any — a show of confidence nobody owes — and the log
    // is the only record of what it was when they gave it.
    case 'backed': {
      const onBehalf = Boolean(
        subjectName && (asAdmin || (actorName && subjectName !== actorName))
      );
      return {
        kind: 'backed',
        title: onBehalf
          ? `${who} added a Hell Yeah for ${subjectName}`
          : `${subjectName || who} said Hell Yeah`,
        fields: changes.wager?.to
          ? [
              {
                key: 'wager',
                label: 'Stake',
                from: null,
                to: wagerText(changes.wager.to),
                multiline: false
              }
            ]
          : [],
        note
      };
    }

    case 'unbacked': {
      const onBehalf = Boolean(
        subjectName && (asAdmin || (actorName && subjectName !== actorName))
      );
      return {
        kind: 'unbacked',
        title: onBehalf
          ? `${who} removed ${subjectName}'s Hell Yeah`
          : `${subjectName || who} took back their Hell Yeah`,
        fields: [],
        note
      };
    }

    default:
      return {
        kind: 'unknown',
        title: `${who} changed this take`,
        fields: [],
        note
      };
  }
}

/**
 * The log, newest first.
 *
 * The server already returns this order; sorting again is what makes the
 * component correct regardless of how the rows reached it — a cached page, a
 * test fixture, a future embed on the board query. `seq` breaks the tie that
 * `created_at` alone cannot: `now()` is transaction time, so an update that
 * rewords *and* grades a take stamps both of its events identically.
 */
export function sortEventsNewestFirst(events = []) {
  return [...events].sort((a, b) => {
    const at = new Date(a?.createdAt ?? 0).getTime();
    const bt = new Date(b?.createdAt ?? 0).getTime();
    if (bt !== at) return bt - at;
    return (b?.seq ?? 0) - (a?.seq ?? 0);
  });
}
