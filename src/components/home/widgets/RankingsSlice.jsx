import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { NumberText, RecordText } from '../../ui/number-text';
import { SkeletonTable } from '../../ui/skeleton';
import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';
import { getUserTeamHighlightClasses } from '../../../utils/userTeamUtils';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { useRankingsForWeek } from '../../../../hooks/queries/index.js';
import { windowAround } from '../../../../utils/home/windowAround.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * The viewer's place in the power rankings: five rows, two above and two
 * below them (the top five for a member with no team).
 *
 * The one table on the page that stays a table below `md`. The five-row shape
 * *is* the content, and a card stack would lose it, so it is designed to fit
 * 375px instead: `table-fixed`, every numeric column a fixed width, the team
 * column the only one that flexes, and the team mark hidden in a card narrower
 * than `@md` to give the name room — a container query, because the card is
 * a third of the page at `lg`. The smoke test's overflow assertion is what holds it there.
 *
 * Reads `useRankingsForWeek(seasonId, actualWeek, actualWeek)` — the key the
 * Rankings tab holds when its viewed week is the actual week, and the entry
 * the matchup hero reads, so the three cannot disagree and opening Rankings
 * from here is a cache hit.
 */
export default function RankingsSlice({ ctx }) {
  const { seasonId, actualWeek, viewerTeam, openTab } = ctx;
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const { data, isPending, isError, refetch } = useRankingsForWeek(seasonId, actualWeek, actualWeek);

  const slice = useMemo(() => {
    const rows = data ?? [];
    const index = viewerTeam ? rows.findIndex((row) => sameId(row.teamId ?? row.id, viewerTeam.id)) : -1;
    return windowAround(rows, index);
  }, [data, viewerTeam]);

  return (
    <HomeWidget
      id="rankings"
      icon={Trophy}
      title="Power rankings"
      aside={actualWeek ? <span className="tabular">Week {actualWeek}</span> : null}
      to="/rankings"
      toLabel="Open power rankings"
      onNavigate={() => openTab?.()}
      loading={isPending}
      skeleton={<SkeletonTable rows={5} columns={6} label="Loading power rankings" className="p-4" />}
      error={isError}
      onRetry={() => refetch()}
      empty={
        !isPending &&
        slice.length === 0 && <p className="p-4 text-sm text-muted-foreground">No rankings yet this season.</p>
      }
      flush
    >
      {/* Sized by the card, not the viewport: the same slice is the full
          width of a phone, half a tablet and a third of a desktop, and only
          its own width says whether the team mark and the long headers fit.
          `@md` is a 28rem card. */}
      <div className="@container">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">
            {viewerTeam ? 'Your power ranking and the teams either side of you' : 'Top five power rankings'}
          </caption>
          <colgroup>
            <col className="w-12" />
            <col />
            <col className="w-11 @md:w-14" />
            <col className="w-12 @md:w-14" />
            <col className="w-12 @md:w-14" />
            <col className="w-14 @md:w-16" />
          </colgroup>
          <thead>
            <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
              <th scope="col" className="py-2 pl-3 font-medium">
                <span className="sr-only">Rank</span>#
              </th>
              <th scope="col" className="px-1.5 py-2 font-medium">Team</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">
                <abbr title="Power rating" className="no-underline @md:hidden">Rtg</abbr>
                <span className="hidden @md:inline">Rating</span>
              </th>
              <th scope="col" className="px-1 py-2 text-center font-medium">
                <abbr title="Record" className="no-underline @md:hidden">W-L</abbr>
                <span className="hidden @md:inline">Record</span>
              </th>
              <th scope="col" className="px-1 py-2 text-right font-medium">Luck</th>
              <th scope="col" className="py-2 pl-1 pr-3 text-right font-medium">Odds</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(({ row, rank }) => {
              const teamId = row.teamId ?? row.id;
              const isViewer = viewerTeam && sameId(teamId, viewerTeam.id);
              const name = getMaskedTeamName(row, user, isAdmin, teamOwnerNames);
              const luck = row.powerRatingComponents?.luckPercentage;
              return (
                <tr
                  key={teamId}
                  className={cn(
                    'relative h-11 border-b border-border/40 last:border-0 hover:bg-accent/30',
                    getUserTeamHighlightClasses(isViewer)
                  )}
                >
                  <td className="pl-3">
                    <RankCell rank={rank} delta={row.rankChange} />
                  </td>
                  <td className="px-1.5">
                    {/* The whole row is the link: the anchor's ::after covers
                        the `relative` row, so a 44px tap anywhere opens
                        Rankings, and a keyboard user still tabs to one link
                        per row. */}
                    <Link
                      to="/rankings"
                      onClick={() => openTab?.()}
                      title={name}
                      className="flex min-w-0 items-center gap-2 outline-none after:absolute after:inset-0 focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    >
                      <TeamAvatar team={row} size="xs" className="hidden @md:inline-flex" />
                      {/* No "You" tag: the warm tint and rail already mark the
                          row, and at 375px the tag cost the name its room. */}
                      <span className="truncate font-medium">{name}</span>
                      {isViewer && <span className="sr-only">(your team)</span>}
                    </Link>
                  </td>
                  <td className="px-1 text-right">
                    <NumberText value={row.powerRating} className="font-semibold" />
                  </td>
                  <td className="px-1 text-center text-[13px] text-muted-foreground">
                    <RecordText wins={row.wins} losses={row.losses} ties={row.ties} />
                  </td>
                  <td className="px-1 text-right text-[13px]">
                    {/* Unknown is the em dash, never +0.0%. */}
                    <NumberText
                      value={luck == null ? null : luck * 100}
                      variant="signedPercent"
                      emphasis="signed"
                    />
                  </td>
                  <td className="pl-1 pr-3 text-right text-[13px]">
                    <OddsCell odds={row.playoffOdds} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
