import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { RankBadge } from '../../ui/rank-badge';
import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { formatOrdinal } from '../../../utils/format';
import { rankRows, recordRows, tradesForRow } from '../../../../utils/recordBook/index.js';
import { newRowIds, rowIdentity } from '../../../../utils/recordBook/newRecords.js';
import { expandsTrades, formatRecordValue, hidesZero } from './recordCatalog';
import { describeRow } from './describeRow';
import { TradeList } from './TradeList';
import { MatchupBoxScoreSheet } from '../../matchups/MatchupBoxScoreSheet';
import { boxScoreFromRecordRow } from '../../matchups/boxScoreGame';

/** Rows a card shows before it is opened. */
export const COLLAPSED_ROWS = 5;

const PHASES = [
  { id: 'regular', label: 'Regular' },
  { id: 'playoff', label: 'Playoffs' }
];

function RecordRow({ record, row, book, identity, onViewFranchise, onOpenBoxScore, detailId, isNew = false }) {
  const { name, meta, active } = describeRow(record, row, identity);
  const opensTrades = expandsTrades(record);
  // A game record's row is a game: it opens that game's box score, whose team
  // names link on to the franchises.
  const boxScore = record.kind === 'game' ? boxScoreFromRecordRow(row, identity) : null;
  // A league-wide row is no franchise's: there is nothing for it to open.
  const interactive = opensTrades || Boolean(boxScore) || Boolean(row.franchiseId);
  const Row = interactive ? 'button' : 'div';
  const [open, setOpen] = useState(false);

  const trades = useMemo(
    () => (opensTrades && open ? tradesForRow(book, row) : []),
    [opensTrades, open, book, row]
  );

  return (
    <li className={cn('py-2', isNew && '-mx-2 rounded-md bg-warning/15 px-2 ring-1 ring-inset ring-warning/30')}>
      <div className="flex items-center gap-3">
        <RankBadge
          rank={row.rank}
          size="sm"
          showDelta={false}
          title={row.tied ? `Tied for ${formatOrdinal(row.rank)}` : undefined}
        />
        <Row
          {...(interactive
            ? {
                type: 'button',
                onClick: opensTrades
                  ? () => setOpen((isOpen) => !isOpen)
                  : boxScore
                    ? () => onOpenBoxScore(boxScore)
                    : () => onViewFranchise(row.franchiseId),
                'aria-expanded': opensTrades ? open : undefined,
                'aria-controls': opensTrades && open ? detailId : undefined
              }
            : {})}
          className={cn(
            '-my-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left',
            interactive &&
              'transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          {row.franchiseId && <TeamAvatar team={identity.avatar(row.franchiseId)} size="xs" />}
          <span className="min-w-0 flex-1">
            {/* Every line wraps. A row is the record's evidence — who, against
                whom, the score, the week — so a narrow card takes another line
                rather than cutting any of it off. */}
            <span className="block break-words text-sm font-medium leading-tight">
              {name}
              {row.tied && <span className="sr-only"> (tied)</span>}
              {boxScore && <span className="sr-only">. Open the box score</span>}
            </span>
            {(meta || active || isNew) && (
              <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
                {isNew && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-warning/15 px-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-warning">
                    <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                    New record
                  </span>
                )}
                {meta && <span className="min-w-0 break-words">{meta}</span>}
                {active && (
                  <span className="shrink-0 rounded-full bg-info/12 px-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-info">
                    Active
                  </span>
                )}
              </span>
            )}
          </span>
          <span className="shrink-0 whitespace-nowrap text-right">
            <span className="tabular text-sm font-semibold text-foreground">
              {formatRecordValue(record, row.value)}
            </span>
            {record.unit && (
              <span className="ml-1 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                {record.unit}
              </span>
            )}
          </span>
          {opensTrades && (
            <ChevronDown
              className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          )}
        </Row>
      </div>

      {open && <TradeList id={detailId} trades={trades} count={row.value} identity={identity} />}
    </li>
  );
}

/**
 * One record as a leaderboard: the top five, opening to the top twenty — or
 * the top ten when a single season is selected, since a season has fourteen
 * teams in it.
 *
 * The rows are ranked here, from the book's raw rows, so one row set serves a
 * record and its opposite and the season filter costs no refetch. Game records
 * carry a Regular / Playoffs toggle; the record proper is the regular season.
 * A trade record's row opens to its trades rather than linking to the franchise.
 *
 * A row new to the record's top five (`newRowIds`) is highlighted, and is always
 * listed: within a tie the earlier achievement comes first, so the rows the
 * league most wants to see would otherwise sit below the fold, or past the top
 * twenty on a record where a lot of rows tie.
 */
export function RecordCard({ record, book, before = null, year = null, identity, onViewFranchise = () => {}, focused = false }) {
  // A card opened from a link starts expanded, and is ringed so the eye finds
  // the one the link was about.
  const [expanded, setExpanded] = useState(focused);
  const [phase, setPhase] = useState('regular');
  const [boxScore, setBoxScore] = useState(null);
  const expandedLimit = year == null ? 20 : 10;
  const titleId = `record-${record.id}`;

  const rows = useMemo(
    () => rankRows(
      recordRows(book, record.scope, record.data, { year, phase: record.phases ? phase : null }),
      { direction: record.direction, hideZero: hidesZero(record) }
    ),
    [book, record, year, phase]
  );

  const newIds = useMemo(() => newRowIds(record, { book, before, phase }), [record, book, before, phase]);
  const isNew = (row) => newIds.has(rowIdentity(record, row));
  const listed = (limit) => rows.filter((row, index) => index < limit || isNew(row));

  const shut = listed(COLLAPSED_ROWS);
  const opened = listed(expandedLimit);
  const visible = expanded ? opened : shut;
  const hasNew = rows.some(isNew);

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      className={cn('flex flex-col scroll-mt-24', focused && 'ring-2 ring-primary/60')}
    >
      <CardHeader className="space-y-1 pb-3 sm:pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <CardTitle id={titleId} className="text-base">
              {record.title}
            </CardTitle>
            {hasNew && (
              <span className="inline-flex shrink-0 text-warning" title="New to the top 5 in the last two seasons">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">New to the top 5</span>
              </span>
            )}
          </div>
          {record.phases && (
            <div role="group" aria-label="Games shown" className="flex shrink-0 rounded-md bg-muted p-0.5">
              {PHASES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={phase === option.id}
                  onClick={() => setPhase(option.id)}
                  className={cn(
                    'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                    phase === option.id
                      ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.4)]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{record.blurb}</p>
        {record.note && (
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0 text-info" aria-hidden="true" />
            <span>{record.note}</span>
          </p>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        {rows.length === 0 ? (
          <p className="flex flex-1 items-center justify-center py-6 text-center text-xs text-muted-foreground">
            {record.phases && phase === 'playoff' ? 'No playoff games in this view.' : 'Nothing qualifies yet.'}
          </p>
        ) : (
          <ol className="divide-y divide-border/60">
            {visible.map((row, index) => (
              <RecordRow
                // Its place in the full list, so opening the card does not hand
                // a row's open trades to the row that takes its index.
                key={rows.indexOf(row)}
                record={record}
                row={row}
                book={book}
                identity={identity}
                onViewFranchise={onViewFranchise}
                onOpenBoxScore={setBoxScore}
                detailId={`${titleId}-row-${index}`}
                isNew={isNew(row)}
              />
            ))}
          </ol>
        )}

        {opened.length > shut.length && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={titleId}
            onClick={() => setExpanded((open) => !open)}
            className="mt-2 w-full text-xs text-muted-foreground"
          >
            {expanded ? `Show top ${COLLAPSED_ROWS}` : `Show top ${Math.min(rows.length, expandedLimit)}`}
            {expanded ? (
              <ChevronUp className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        )}
      </CardContent>

      {record.kind === 'game' && (
        // The rows' names are the identity's, so the sheet's are too.
        <MatchupBoxScoreSheet game={boxScore} onClose={() => setBoxScore(null)} />
      )}
    </Card>
  );
}

export default RecordCard;
