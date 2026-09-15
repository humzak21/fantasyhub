import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { RankBadge } from '../../ui/rank-badge';
import { TeamAvatar } from '../../ui/team-identity';
import { cn, formatDate } from '../../../lib/utils';
import { formatOrdinal, formatRecord, formatScore } from '../../../utils/format';
import { isRecentRecord, rankRows, recordRows, tradesForRow } from '../../../../utils/recordBook/index.js';
import { expandsTrades, formatRecordValue, hidesZero } from './recordCatalog';

/** Rows a card shows before it is opened. */
export const COLLAPSED_ROWS = 5;

const PHASES = [
  { id: 'regular', label: 'Regular' },
  { id: 'playoff', label: 'Playoffs' }
];

/**
 * Who a row is and the one line of context under the name.
 *
 * `identity` does the masking — franchise names, team names and avatars all
 * come through it — so nothing here can print an owner a signed-out viewer
 * should not see.
 */
function describeRow(record, row, identity) {
  const franchise = identity.franchiseName(row.franchiseId);

  switch (record.kind) {
    case 'franchise': {
      const parts = [];
      if (record.detail === 'record' && row.record) parts.push(formatRecord(row.record));
      if (row.seasons) parts.push(`${row.seasons} ${row.seasons === 1 ? 'season' : 'seasons'}`);
      return { name: franchise, meta: parts.join(' · ') };
    }
    case 'teamSeason': {
      const parts = [identity.teamName(row.teamId), row.year];
      if (record.detail === 'record' && row.record) parts.push(formatRecord(row.record));
      return { name: franchise, meta: parts.filter(Boolean).join(' · ') };
    }
    case 'game': {
      const [pf, pa] = row.score ?? [];
      return {
        name: franchise,
        meta: `${formatScore(pf)}–${formatScore(pa)} vs ${identity.franchiseName(row.opponentFranchiseId)} · Wk ${row.week}, ${row.year}`
      };
    }
    case 'streak': {
      const { start, end } = row;
      const span = start.year === end.year
        ? `${start.year} · wk ${start.week}–${end.week}`
        : `${start.year} wk ${start.week} – ${end.year} wk ${end.week}`;
      return { name: franchise, meta: span, active: row.active };
    }
    case 'seasonStreak':
      return { name: franchise, meta: `${row.startYear}–${row.endYear}`, active: row.active };
    case 'pair':
      return {
        name: `${franchise} & ${identity.franchiseName(row.partnerFranchiseId)}`,
        meta: row.year ? String(row.year) : null
      };
    case 'bid':
      return {
        name: franchise,
        meta: [row.playerName ?? 'Unknown player', row.week ? `Wk ${row.week}, ${row.year}` : row.year]
          .filter(Boolean)
          .join(' · ')
      };
    // The league as one team: the row is a week or a season, not a franchise.
    case 'leagueWeek': {
      let meta = null;
      if (row.franchiseIds?.length) meta = row.franchiseIds.map((id) => identity.franchiseName(id)).join(' & ');
      else if (row.average != null) meta = `${formatScore(row.average)} per team`;
      return { name: `Week ${row.week}, ${row.year}`, meta };
    }
    case 'leagueSeason':
      return { name: String(row.year), meta: `${row.weeks} weeks · ${row.games} games` };
    default:
      return { name: franchise, meta: null };
  }
}

const playerName = (player) => player.name ?? 'Unknown player';

/** "Wk 6 · Oct 14, 2021", or "Wk 6, 2021" for a trade with no processed date. */
function tradeWhen(trade) {
  const week = trade.week != null ? `Wk ${trade.week}` : null;
  if (trade.processedAt) return [week, formatDate(trade.processedAt)].filter(Boolean).join(' · ');
  return [week, trade.year].filter(Boolean).join(', ');
}

function PlayerLine({ player }) {
  return (
    <li className="flex min-w-0 items-baseline gap-1.5 text-xs">
      <span className="truncate text-foreground">{playerName(player)}</span>
      {player.position && (
        <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          {player.position}
        </span>
      )}
    </li>
  );
}

/**
 * The trades behind a trade record's row, newest first: when, and who received
 * which players. Franchise names come through `identity`, so they mask exactly
 * as the row does.
 *
 * `count` is the row's figure. For "Most trades" that is `transactions.trades`,
 * a different table from the trades listed; where it runs past them — a season
 * the sync has counted but not yet stored move by move — the difference is
 * stated rather than left to look like a missing trade.
 */
function TradeList({ id, trades, count, identity }) {
  const unlisted = Math.max(0, Math.round(count) - trades.length);

  return (
    <div id={id} className="mt-2 space-y-2">
      {trades.length > 0 && (
        <ol aria-label="Trades" className="space-y-2">
          {trades.map((trade, index) => (
            <li key={trade.id ?? index} className="rounded-md bg-muted/40 px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {tradeWhen(trade)}
              </p>

              {trade.directed ? (
                <div className="mt-2 space-y-2.5">
                  {trade.sides.map((side) => {
                    const name = identity.franchiseName(side.franchiseId);
                    return (
                      <div key={side.franchiseId} className="min-w-0">
                        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                          <TeamAvatar team={identity.avatar(side.franchiseId)} size="xs" />
                          <span className="truncate">{name}</span>
                          <span className="shrink-0 text-[10px] font-normal uppercase tracking-[0.06em] text-muted-foreground">
                            received
                          </span>
                        </p>
                        <ul aria-label={`${name} received`} className="mt-1 space-y-0.5 pl-7">
                          {side.received.length > 0 ? (
                            side.received.map((player, playerIndex) => (
                              <PlayerLine key={player.espnPlayerId ?? playerIndex} player={player} />
                            ))
                          ) : (
                            <li className="text-xs text-muted-foreground">No players</li>
                          )}
                        </ul>
                        {side.dropped.length > 0 && (
                          <p className="mt-1 pl-7 text-[11px] text-muted-foreground">
                            Dropped {side.dropped.map(playerName).join(', ')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Stored before direction was: the players, without guessing a side.
                <div className="mt-2 min-w-0">
                  <p className="truncate text-xs font-medium">
                    {trade.sides.map((side) => identity.franchiseName(side.franchiseId)).join(' & ')}
                  </p>
                  <ul aria-label="Players moved" className="mt-1 space-y-0.5">
                    {trade.players.map((player, playerIndex) => (
                      <PlayerLine key={player.espnPlayerId ?? playerIndex} player={player} />
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {unlisted > 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {unlisted} more counted {unlisted === 1 ? 'trade has' : 'trades have'} no detail on record.
        </p>
      )}
    </div>
  );
}

function RecordRow({ record, row, book, identity, onViewFranchise, detailId, recent = false }) {
  const { name, meta, active } = describeRow(record, row, identity);
  const opensTrades = expandsTrades(record);
  // A league-wide row is no franchise's: there is nothing for it to open.
  const interactive = opensTrades || Boolean(row.franchiseId);
  const Row = interactive ? 'button' : 'div';
  const [open, setOpen] = useState(false);

  const trades = useMemo(
    () => (opensTrades && open ? tradesForRow(book, row) : []),
    [opensTrades, open, book, row]
  );

  return (
    <li className={cn('py-2', recent && '-mx-2 rounded-md bg-warning/[0.06] px-2')}>
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
                onClick: opensTrades ? () => setOpen((isOpen) => !isOpen) : () => onViewFranchise(row.franchiseId),
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
            <span className="block truncate text-sm font-medium leading-tight">
              {name}
              {row.tied && <span className="sr-only"> (tied)</span>}
            </span>
            {(meta || active || recent) && (
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                {/* First, so a long meta line truncates rather than hiding it. */}
                {recent && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-warning/12 px-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-warning">
                    <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                    New record
                  </span>
                )}
                {meta && <span className="truncate">{meta}</span>}
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
 */
export function RecordCard({ record, book, year = null, identity, onViewFranchise = () => {} }) {
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState('regular');
  const expandedLimit = year == null ? 20 : 10;
  const titleId = `record-${record.id}`;

  const rows = useMemo(
    () => rankRows(
      recordRows(book, record.scope, record.data, { year, phase: record.phases ? phase : null }),
      { direction: record.direction, hideZero: hidesZero(record), limit: expandedLimit }
    ),
    [book, record, year, phase, expandedLimit]
  );

  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  // A recently broken record is a league record — the #1 across every season.
  // With one season picked, a card's #1 is only that season's best, so nothing
  // is marked.
  const recentYears = book?.recentYears ?? [];
  const isRecent = (row) => year == null && isRecentRecord(row, recentYears);
  const hasRecent = rows.some(isRecent);

  return (
    <Card role="region" aria-labelledby={titleId} className="flex flex-col">
      <CardHeader className="space-y-1 pb-3 sm:pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <CardTitle id={titleId} className="text-sm leading-snug">
              {record.title}
            </CardTitle>
            {hasRecent && (
              <span className="inline-flex shrink-0 text-warning" title="Broken in the last two seasons">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Broken recently</span>
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
                key={`${record.id}-${index}`}
                record={record}
                row={row}
                book={book}
                identity={identity}
                onViewFranchise={onViewFranchise}
                detailId={`${titleId}-row-${index}`}
                recent={isRecent(row)}
              />
            ))}
          </ol>
        )}

        {rows.length > COLLAPSED_ROWS && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={titleId}
            onClick={() => setExpanded((open) => !open)}
            className="mt-2 w-full text-xs text-muted-foreground"
          >
            {expanded ? `Show top ${COLLAPSED_ROWS}` : `Show top ${rows.length}`}
            {expanded ? (
              <ChevronUp className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default RecordCard;
