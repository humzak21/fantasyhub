import { Link } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';

import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { formatOrdinal } from '../../../utils/format';
import { describeRow } from '../../history/records/describeRow';
import { formatRecordValue } from '../../history/records/recordCatalog';
import { recordPath } from '../../history/records/recordLink';
import { useCountUp } from '../../../hooks/use-count-up.js';

const KIND = {
  new: { label: (place) => `New · ${place}`, tone: 'bg-warning/12 text-warning' },
  day: { label: () => 'Record of the day', tone: 'bg-info/12 text-info' },
  yours: { label: (place) => `Yours · ${place}`, tone: 'bg-primary/12 text-primary' }
};

/**
 * One record, as a card: what kind of card it is, the record, who holds the
 * place, and the figure. Named through `describeRow` and the record book's
 * identity, so a row reads here exactly as it reads on Records.
 *
 * A link to the record when `linkable` — History is the admin's and the team
 * owners', and a card whose only outcome is a redirect is the bug the
 * directory rule exists to prevent.
 */
export function RecordCardMini({ card, identity, linkable = true }) {
  const { record, row, rank, kind } = card;
  const { name, meta } = describeRow(record, row, identity);
  const scope = record.scope === 'career' ? 'All-time' : 'Single season';
  const place = `${row.tied ? 'T-' : ''}${formatOrdinal(rank)}`;
  const kicker = KIND[kind] ?? KIND.day;
  // The figure counts up once, like the hero's totals.
  const shown = useCountUp(row.value);

  const body = (
    <>
      <span
        className={cn(
          'inline-flex max-w-full items-center gap-1 self-start whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
          kicker.tone
        )}
      >
        {kind === 'new' && <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />}
        <span className="truncate">{kicker.label(place)}</span>
      </span>

      <p className="mt-2.5 text-balance text-[15px] font-semibold leading-snug">{record.title}</p>
      <p className="text-[11px] text-muted-foreground">{scope}</p>

      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          {row.franchiseId && <TeamAvatar team={identity.avatar(row.franchiseId)} size="sm" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={name}>
              {name}
            </p>
            {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
          </div>
        </div>
        <p className="shrink-0 text-right">
          <span className="font-display text-[28px] font-semibold leading-none tracking-[-0.01em] tabular">
            {formatRecordValue(record, shown)}
          </span>
          {record.unit && (
            <span className="ml-1 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{record.unit}</span>
          )}
        </p>
      </div>
    </>
  );

  const surface =
    'flex h-full flex-col rounded-lg border border-border bg-muted/20 p-3.5 outline-none';

  if (!linkable) return <div className={surface}>{body}</div>;

  return (
    <Link
      to={recordPath(record.id)}
      className={cn(
        surface,
        'group relative pr-8 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {body}
      <ChevronRight
        className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export default RecordCardMini;
