import { useLayoutEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { ScrollTable } from '../ScrollTable';
import { ROW_TONE, STICKY_CELL, STICKY_HEAD, VIEWER_RAIL } from '../tableTones';
import { NumberText, RecordText } from '../../ui/number-text';
import { SkeletonTable } from '../../ui/skeleton';
import { StreakChip } from '../../ui/streak-chip';
import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { useRankingsForWeek } from '../../../../hooks/queries/index.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const NONE = [];

/**
 * The columns past the team, in order. `shown` ones fill the card by default;
 * the rest are a swipe to the right. Widths are literal so Tailwind sees them,
 * and `TABLE_WIDTH` below is their sum.
 */
const COLUMNS = [
  { key: 'rating', label: 'Rtg', title: 'Power rating', width: 'w-[3.25rem]', align: 'text-right' },
  { key: 'record', label: 'W-L', title: 'Record', width: 'w-14', align: 'text-center' },
  { key: 'luck', label: 'Luck', width: 'w-[3.75rem]', align: 'text-right' },
  { key: 'odds', label: 'Playoff%', title: 'Playoff odds', width: 'w-[4.75rem]', align: 'text-right' },
  { key: 'winPct', label: 'Win%', width: 'w-[3.75rem]', align: 'text-right' },
  { key: 'pf', label: 'PF', title: 'Points for', width: 'w-[4.25rem]', align: 'text-right' },
  { key: 'pa', label: 'PA', title: 'Points against', width: 'w-[4.25rem]', align: 'text-right' },
  { key: 'diff', label: 'Diff', title: 'Point differential', width: 'w-[4.25rem]', align: 'text-right' },
  { key: 'streak', label: 'Streak', width: 'w-[3.75rem]', align: 'text-center' }
];

/**
 * The team column is whatever the card has after the rank (3rem) and the four
 * columns shown by default (15.25rem) — so the default view is exactly those
 * — but never less than twelve letters of name (13ch, plus the cell's
 * padding, plus the team mark once the card is wide enough to show it). The
 * table is that plus every other column: 18.25rem shown, 20.25rem to the right.
 */
const TEAM_WIDTH = 'w-[max(13ch_+_0.75rem,100cqw_-_18.25rem)] @md:w-[max(13ch_+_2.75rem,100cqw_-_18.25rem)]';
const TABLE_WIDTH =
  'w-[calc(max(13ch_+_0.75rem,100cqw_-_18.25rem)_+_38.5rem)] @md:w-[calc(max(13ch_+_2.75rem,100cqw_-_18.25rem)_+_38.5rem)]';

/**
 * The whole power ranking, with the viewer in view.
 *
 * Every team, in a table that scrolls both ways (`ScrollTable`): about five
 * rows tall, and on load it scrolls itself so the viewer's row sits in the
 * middle — the rows either side of you are what the card is for, and the
 * rest of the league is a flick away. Rating, record, luck and playoff odds
 * fill the card by default; win %, points, differential and streak are to the
 * right. The rank stays put as it scrolls sideways, and the header as it
 * scrolls down; the team scrolls with its figures.
 *
 * Reads `useRankingsForWeek(seasonId, actualWeek, actualWeek)` — the key the
 * Rankings tab holds when its viewed week is the actual week, and the entry
 * the matchup hero reads, so the three cannot disagree and opening Rankings
 * from here is a cache hit.
 */
export default function RankingsSlice({ ctx }) {
  const { seasonId, actualWeek, viewerTeam, openTab } = ctx;
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useRankingsForWeek(seasonId, actualWeek, actualWeek);
  const rows = data ?? NONE;

  // Centre the viewer's row, once per mount, as soon as the rows exist. A
  // layout effect, so the first frame the reader sees is already centred.
  const viewportRef = useRef(null);
  const centred = useRef(false);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (centred.current || !viewport || rows.length === 0) return;
    const row = viewport.querySelector('tr[data-viewer="true"]');
    centred.current = true;
    if (!row) return;
    const header = viewport.querySelector('thead')?.offsetHeight ?? 0;
    viewport.scrollTop = row.offsetTop + row.offsetHeight / 2 - (viewport.clientHeight + header) / 2;
  }, [rows]);

  const openRankings = () => {
    openTab?.();
    navigate('/rankings');
  };

  const cell = 'h-11 border-b border-border/40 group-last:border-0';

  return (
    <HomeWidget
      id="rankings"
      icon={Trophy}
      title="Power Rankings"
      aside={actualWeek ? <span className="tabular">Week {actualWeek}</span> : null}
      to="/rankings"
      toLabel="Open Power Rankings"
      onNavigate={() => openTab?.()}
      loading={isPending}
      skeleton={<SkeletonTable rows={5} columns={6} label="Loading power rankings" className="p-4" />}
      error={isError}
      onRetry={() => refetch()}
      empty={
        !isPending &&
        rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No rankings yet this season.</p>
      }
      flush
    >
      <ScrollTable ref={viewportRef} label="Power Rankings table" viewportClassName="max-h-[17rem] overflow-y-auto">
        <table className={cn('table-fixed border-separate border-spacing-0 text-sm', TABLE_WIDTH)}>
          <caption className="sr-only">Power Rankings, week {actualWeek}</caption>
          <colgroup>
            <col className="w-12" />
            <col className={TEAM_WIDTH} />
            {COLUMNS.map((column) => (
              <col key={column.key} className={column.width} />
            ))}
          </colgroup>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" className={cn(STICKY_HEAD, 'left-0 z-[3] border-b border-r border-border/60 py-2 pl-3 text-left font-medium')}>
                <span className="sr-only">Rank</span>#
              </th>
              <th scope="col" className={cn(STICKY_HEAD, 'border-b border-border/60 px-1.5 py-2 text-left font-medium')}>
                Team
              </th>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  title={column.title}
                  className={cn(STICKY_HEAD, 'border-b border-border/60 px-1.5 py-2 font-medium', column.align)}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const teamId = row.teamId ?? row.id;
              const isViewer = Boolean(viewerTeam && sameId(teamId, viewerTeam.id));
              const name = getMaskedTeamName(row, user, isAdmin, teamOwnerNames);
              const luck = row.powerRatingComponents?.luckPercentage;
              return (
                <tr
                  key={teamId}
                  data-viewer={isViewer}
                  onClick={openRankings}
                  className={cn('group cursor-pointer', isViewer ? ROW_TONE.viewer : ROW_TONE.base)}
                >
                  <td className={cn(cell, STICKY_CELL, 'left-0 pl-3', isViewer && VIEWER_RAIL)}>
                    <RankCell rank={index + 1} delta={row.rankChange} />
                  </td>
                  <td className={cn(cell, 'px-1.5')}>
                    <Link
                      to="/rankings"
                      onClick={(event) => {
                        event.stopPropagation();
                        openTab?.();
                      }}
                      title={name}
                      className="flex min-w-0 items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <TeamAvatar team={row} size="xs" className="hidden @md:inline-flex" />
                      <span className="truncate font-medium">{name}</span>
                      {isViewer && <span className="sr-only">(your team)</span>}
                    </Link>
                  </td>
                  <td className={cn(cell, 'px-1.5 text-right')}>
                    <NumberText value={row.powerRating} className="font-semibold" />
                  </td>
                  <td className={cn(cell, 'px-1.5 text-center text-[13px] text-muted-foreground')}>
                    <RecordText wins={row.wins} losses={row.losses} ties={row.ties} />
                  </td>
                  <td className={cn(cell, 'px-1.5 text-right text-[13px]')}>
                    {/* Unknown is the em dash, never +0.0%. */}
                    <NumberText value={luck == null ? null : luck * 100} variant="signedPercent" emphasis="signed" />
                  </td>
                  <td className={cn(cell, 'px-1.5 text-right text-[13px]')}>
                    <OddsCell odds={row.playoffOdds} />
                  </td>
                  <td className={cn(cell, 'px-1.5 text-right text-[13px] text-muted-foreground')}>
                    <NumberText value={row.winPercentage == null ? null : row.winPercentage * 100} variant="percent" />
                  </td>
                  <td className={cn(cell, 'px-1.5 text-right text-[13px]')}>
                    <NumberText value={row.pointsFor} />
                  </td>
                  <td className={cn(cell, 'px-1.5 text-right text-[13px] text-muted-foreground')}>
                    <NumberText value={row.pointsAgainst} />
                  </td>
                  <td className={cn(cell, 'px-1.5 text-right text-[13px]')}>
                    <NumberText value={row.pointDifferential} variant="delta" emphasis="signed" />
                  </td>
                  <td className={cn(cell, 'px-1.5 text-center')}>
                    <StreakChip streak={row.currentStreak} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollTable>
    </HomeWidget>
  );
}

/**
 * Rank and the week's move in 48px. `RankBadge`'s circle plus its delta is
 * wider than the column a 375px row can spare, so this is the same two facts
 * — the number, and an up/down arrow coloured by direction — set inline.
 */
function RankCell({ rank, delta }) {
  const move = Number(delta);
  const moved = delta != null && Number.isFinite(move) && move !== 0;
  return (
    <span className="flex items-center gap-0.5 font-semibold tabular">
      {rank}
      {moved && (
        <span
          className={cn('inline-flex items-center text-[10px] font-medium', move > 0 ? 'text-success' : 'text-destructive')}
          title={`${Math.abs(move)} ${Math.abs(move) === 1 ? 'place' : 'places'} ${move > 0 ? 'up' : 'down'} from last week`}
        >
          {move > 0 ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
          <span className="sr-only">{move > 0 ? 'up' : 'down'}</span>
          {Math.abs(move)}
        </span>
      )}
    </span>
  );
}

/**
 * Playoff odds, whole percent. The calculator reads 100 only when clinched
 * and 0 only when eliminated, so those two are words.
 */
function OddsCell({ odds }) {
  if (odds === null || odds === undefined || odds === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  const value = Number(odds);
  if (value >= 100) return <span className="font-medium text-success">Clinched</span>;
  if (value <= 0) return <span className="text-muted-foreground">Out</span>;
  return <NumberText value={value} variant="percent" decimals={0} />;
}
