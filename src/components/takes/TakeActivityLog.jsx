import {
  ArrowRight,
  Flame,
  Gavel,
  History,
  Pencil,
  RotateCcw,
  ThumbsDown,
  Undo2
} from 'lucide-react';

import { cn, formatDateTime } from '../../lib/utils';
import { getMaskedUserName } from '../../utils/displayNameUtils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { describeTakeEvent, sortEventsNewestFirst } from './activity.js';

/**
 * Icon and tint per kind of act. Colour here is doing the job CLAUDE.md
 * reserves it for — direction, not decoration: a grade and a fade are the two
 * entries that change what a take is *worth* to somebody, and they are the two
 * that carry a hue. Posting, editing and reopening are neutral events and are
 * drawn neutral.
 */
const EVENT_STYLE = {
  posted: { Icon: Flame, tint: 'text-primary' },
  edited: { Icon: Pencil, tint: 'text-muted-foreground' },
  graded: { Icon: Gavel, tint: 'text-success' },
  reopened: { Icon: RotateCcw, tint: 'text-muted-foreground' },
  faded: { Icon: ThumbsDown, tint: 'text-destructive' },
  unfaded: { Icon: Undo2, tint: 'text-muted-foreground' },
  unknown: { Icon: History, tint: 'text-muted-foreground' }
};

/**
 * One before/after row.
 *
 * A `from` of null means "this is what it was set to", not "this replaced
 * nothing" — the posted event and the reopened event both use that shape — so
 * the arrow and the struck-through half are absent rather than empty.
 *
 * Long values stack; short ones sit on one line. A wording change is two
 * paragraphs and cannot share a line with anything, while a stake going from
 * $20 to $50 reads worse broken across three.
 */
function ChangeRow({ field }) {
  const showsPrevious = field.from !== null && field.from !== undefined;

  if (field.multiline) {
    return (
      <div className="mt-2">
        <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          {field.label}
        </span>
        {showsPrevious && (
          <p className="mt-1 whitespace-pre-wrap break-words rounded border border-border/70 bg-muted/30 p-2 text-xs leading-relaxed text-muted-foreground line-through decoration-muted-foreground/50">
            {field.from}
          </p>
        )}
        <p className="mt-1 whitespace-pre-wrap break-words rounded border border-border/70 bg-muted/40 p-2 text-xs leading-relaxed text-foreground">
          {field.to}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
      <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        {field.label}
      </span>
      {showsPrevious && (
        <>
          <span className="text-muted-foreground line-through decoration-muted-foreground/50">
            {field.from}
          </span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </>
      )}
      <span className="break-words text-foreground">{field.to}</span>
    </div>
  );
}

/** Three grey bars on the rail, so the section keeps its height while the log
 *  loads. Never `return null` here: the sheet is already open and a section
 *  that appears a beat later shoves everything under it down the page. */
function ActivitySkeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex gap-3">
          <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5 py-1">
            <span className="block h-3 w-1/2 animate-pulse rounded bg-muted" />
            <span className="block h-2.5 w-1/3 animate-pulse rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Everything that has happened to one take, newest first.
 *
 * The log is the answer to the argument this board exists to have: a take that
 * has been reworded once and restaked twice is three different bets, and until
 * now the row held only the last of them. `takes.edited_at` said a take had
 * moved without saying what moved, which is the least useful half of that fact.
 *
 * It renders from `take_events`, which is written by triggers on the same
 * statement as the change — so this is the database's account of what happened,
 * not the client's. Nothing here can be missing because a caller forgot to log
 * it, and nothing can be here that did not happen.
 *
 * Newest first, because the question a reader has open in front of them is
 * "what changed since I last looked", not "how did this begin".
 */
export function TakeActivityLog({ events = [], displayNames = {}, seasonConfig, loading }) {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  const nameOf = (userId) =>
    userId ? getMaskedUserName(displayNames[userId], userId, user, isAdmin, teamOwnerNames) : null;

  const ordered = sortEventsNewestFirst(events);

  return (
    <div className="border-t border-border pt-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <History className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
        Activity
      </h3>

      {loading ? (
        <ActivitySkeleton />
      ) : ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing has happened to this take yet.
        </p>
      ) : (
        <ol className="space-y-0">
          {ordered.map((event, index) => {
            const described = describeTakeEvent(event, {
              actorName: nameOf(event.actorId),
              subjectName: nameOf(event.subjectId),
              seasonConfig
            });
            const { Icon, tint } = EVENT_STYLE[described.kind] ?? EVENT_STYLE.unknown;
            const isLast = index === ordered.length - 1;

            return (
              <li key={event.id ?? `${event.eventType}-${event.seq}`} className="flex gap-3">
                {/* The rail: a dot per event and a hairline joining it to the
                    next. The line is inside the flex column rather than an
                    absolutely-positioned pseudo-element so it stops at the last
                    entry on its own, whatever the entry's height. */}
                <div className="flex flex-col items-center">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.035)]">
                    <Icon className={cn('h-3.5 w-3.5', tint)} aria-hidden="true" />
                  </span>
                  {!isLast && <span className="my-1 w-px flex-1 bg-border" aria-hidden="true" />}
                </div>

                <div className={cn('min-w-0 flex-1 pt-1', isLast ? 'pb-0' : 'pb-4')}>
                  <p className="break-words text-sm text-foreground">{described.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </p>

                  {described.fields.map((field) => (
                    <ChangeRow key={field.key} field={field} />
                  ))}

                  {described.note && (
                    <p className="mt-1.5 text-[11px] italic text-muted-foreground">
                      {described.note}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default TakeActivityLog;
