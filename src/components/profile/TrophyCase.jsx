import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Crown, Flag, Medal, Skull, Trophy } from 'lucide-react';

import { Button } from '../ui/button';
import { SectionHeading } from '../ui/section-heading';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';
import { useDivisionTitles, useRecordBook } from '../../../hooks/queries/index.js';
import { finalsOf, locksHeldBy, recordsHeldBy } from '../../../utils/profile/trophyCase.js';
import { formatRecord } from '../../utils/format';
import { describeRow } from '../history/records/describeRow';
import { formatRecordValue } from '../history/records/recordCatalog';
import { buildRecordIdentity } from '../history/records/recordIdentity';
import { recordPath } from '../history/records/recordLink';
import { getMaskedHistoricalTeamName } from '../history/utils/privacyHelpers';

/** Records shown before "Show all". A franchise can hold a dozen. */
const RECORDS_SHOWN = 6;

const SURFACE =
  'rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]';

/** One year on the shelf. Titles are the big thing here, and everything else steps down. */
function Plate({ icon: Icon, tone, year, label, detail, large = false }) {
  return (
    <li className={cn(SURFACE, 'flex items-center gap-3', large ? 'p-4' : 'p-3')}>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          large ? 'h-11 w-11' : 'h-8 w-8',
          tone
        )}
      >
        <Icon className={large ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={cn('font-display font-semibold leading-none tracking-[-0.01em]', large ? 'text-[28px]' : 'text-xl')}>
          {year}
        </p>
        <p className="mt-1 truncate text-sm font-medium">{label}</p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
    </li>
  );
}

/** A shelf of plates under a heading that counts them. */
function Shelf({ title, count, children }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        {title} <span className="tabular font-medium text-muted-foreground">{count}</span>
      </h3>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" aria-label={title}>
        {children}
      </ul>
    </div>
  );
}

const lockDetail = (lock) => `Locked week ${lock.week} · ${formatRecord(lock.record)}`;

/** One record held: a row, linked to its card in the book when the viewer can open it. */
function HeldRecord({ held, identity, linkable }) {
  const { record, rows, shared } = held;
  const [row] = rows;
  const { meta } = describeRow(record, row, identity);
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{record.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {record.scope === 'career' ? 'All-time' : 'Single season'}
          {meta ? ` · ${meta}` : ''}
          {rows.length > 1 ? ` · ${rows.length} times` : ''}
        </p>
      </div>
      {shared && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Shared
        </span>
      )}
      <p className="shrink-0 text-right">
        <span className="font-display text-xl font-semibold leading-none tracking-[-0.01em] tabular">
          {formatRecordValue(record, row.value)}
        </span>
        {record.unit && (
          <span className="ml-1 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{record.unit}</span>
        )}
      </p>
    </>
  );

  return (
    <li>
      {linkable ? (
        <Link
          to={recordPath(record.id)}
          className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
        >
          {body}
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2.5">{body}</div>
      )}
    </li>
  );
}

/**
 * What the franchise has won: championships, division titles, and every record
 * it holds. Each part comes off the same data its own tab reads, so opening the
 * Records tab afterwards is a cache hit.
 *
 * Division names and the team names beside a title are for viewers who see the
 * league unmasked; the shelf itself is not.
 */
export function TrophyCase({ franchiseId, franchises, seasonHistory, viewer, fullData, canOpenRecords }) {
  const { user, isAdmin, teamOwnerNames } = viewer;
  const { data: divisionTitles = [], isLoading: divisionsLoading } = useDivisionTitles();
  const { data: book, isLoading: bookLoading } = useRecordBook();
  const [showAll, setShowAll] = useState(false);

  const { titles, runnerUps } = useMemo(() => finalsOf(seasonHistory), [seasonHistory]);
  const wonDivisions = useMemo(
    () => divisionTitles.filter((title) => title.franchiseId === franchiseId),
    [divisionTitles, franchiseId]
  );
  const held = useMemo(() => recordsHeldBy(book, franchiseId), [book, franchiseId]);
  const oneSeeds = useMemo(() => locksHeldBy(book, 'oneSeedLock', franchiseId), [book, franchiseId]);
  const punishments = useMemo(() => locksHeldBy(book, 'punishmentLock', franchiseId), [book, franchiseId]);
  const identity = useMemo(
    () => buildRecordIdentity({ franchises, book, user, isAdmin, teamOwnerNames }),
    [franchises, book, user, isAdmin, teamOwnerNames]
  );

  const teamNameOf = (season) => getMaskedHistoricalTeamName(season, user, isAdmin, teamOwnerNames);
  const shownRecords = showAll ? held : held.slice(0, RECORDS_SHOWN);
  const shelfEmpty = titles.length + runnerUps.length + wonDivisions.length + oneSeeds.length + punishments.length === 0;

  return (
    <section className="space-y-4" aria-labelledby="trophy-case-heading">
      <SectionHeading id="trophy-case-heading" icon={Trophy}>
        Trophy case
      </SectionHeading>

      {divisionsLoading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : shelfEmpty ? (
        <p className="text-sm text-muted-foreground">No titles yet. The shelf is ready when they are.</p>
      ) : (
        <div className="space-y-3">
          {titles.length + runnerUps.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Championships">
              {titles.map((season) => (
                <Plate
                  key={season.team_id}
                  large
                  icon={Trophy}
                  tone="bg-warning/15 text-warning"
                  year={season.season.year}
                  label="League champion"
                  detail={teamNameOf(season)}
                />
              ))}
              {runnerUps.map((season) => (
                <Plate
                  key={season.team_id}
                  large
                  icon={Medal}
                  tone="bg-muted text-muted-foreground"
                  year={season.season.year}
                  label="Runner-up"
                  detail={teamNameOf(season)}
                />
              ))}
            </ul>
          )}

          {wonDivisions.length > 0 && (
            <Shelf title="Division titles" count={wonDivisions.length}>
              {wonDivisions.map((title) => (
                <Plate
                  key={`${title.year}-${title.divisionName}`}
                  icon={Crown}
                  tone="bg-primary/12 text-primary"
                  year={title.year}
                  label={fullData ? title.divisionName : 'Division title'}
                  detail={fullData ? `Division title · ${formatRecord(title)}` : formatRecord(title)}
                />
              ))}
            </Shelf>
          )}

          {oneSeeds.length > 0 && (
            <Shelf title="1 seeds" count={oneSeeds.length}>
              {oneSeeds.map((lock) => (
                <Plate
                  key={lock.year}
                  icon={Flag}
                  tone="bg-success/15 text-success"
                  year={lock.year}
                  label="1 seed"
                  detail={lockDetail(lock)}
                />
              ))}
            </Shelf>
          )}

          {punishments.length > 0 && (
            <Shelf title="Punishments" count={punishments.length}>
              {punishments.map((lock) => (
                <Plate
                  key={lock.year}
                  icon={Skull}
                  tone="bg-destructive/15 text-destructive"
                  year={lock.year}
                  label="Punishment"
                  detail={lockDetail(lock)}
                />
              ))}
            </Shelf>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Records held</h3>
        {bookLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : held.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing at #1 in the record book yet.</p>
        ) : (
          <>
            <ul className={cn(SURFACE, 'divide-y divide-border overflow-hidden')}>
              {shownRecords.map((entry) => (
                <HeldRecord key={entry.record.id} held={entry} identity={identity} linkable={canOpenRecords} />
              ))}
            </ul>
            {held.length > RECORDS_SHOWN && (
              <Button variant="ghost" size="sm" onClick={() => setShowAll((value) => !value)}>
                {showAll ? 'Show fewer' : `Show all ${held.length}`}
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default TrophyCase;
