import { useMemo, useState } from 'react';
import { ListOrdered } from 'lucide-react';

import { buildOpponentMap, useNflSeasonSchedule } from '../../../../hooks/queries/index.js';
import { rankTier } from '../../../../utils/franchiseWeeks.js';
import { OpponentChip } from '../../ui/opponent-chip.jsx';
import { PlayerPoints } from '../../ui/player-points.jsx';
import { ResponsiveDataTable } from '../../ui/responsive-table.jsx';
import { cn } from '../../../lib/utils';
import { EMPTY, formatPoints, formatScore } from '../../../utils/format';
import { getPositionColor } from '../../../utils/positionColors';
import { sortRows } from '../../../utils/tableSort';
import { FranchiseLink, SectionCard, SectionEmpty } from './SectionCard.jsx';
import { GAME_LOG_STATS, shortPhase, statCell } from './gameLogColumns.js';
import { RANK_HEAT, formatCount, resultTone } from './sectionFormat.js';

function WeekCell({ line }) {
  const phase = shortPhase(line.phase);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap tabular" title={line.phase ? `${line.label} · ${line.phase}` : line.label}>
      <span className="font-medium text-foreground">Wk {line.week}</span>
      {phase && (
        <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {phase}
        </span>
      )}
    </span>
  );
}

function SlotCell({ line }) {
  if (!line.started) {
    return <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{line.slot === 'IR' ? 'IR' : 'BE'}</span>;
  }
  return (
    <span className={cn('inline-flex rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]', getPositionColor(line.slot))}>
      {line.slot ?? EMPTY}
    </span>
  );
}

function PointsCell({ line }) {
  // A settled zero with no stat line is a week he did not play, not a dud game.
  if (line.actualPoints != null && !line.appeared) {
    return <span className="text-xs text-muted-foreground" title="Did not play: no stat line that week">DNP</span>;
  }
  return <PlayerPoints actualPoints={line.actualPoints} projectedPoints={line.projectedPoints} />;
}

function RankCell({ line }) {
  const rank = line.rank;
  if (!rank || rank.positional == null) return <span className="text-muted-foreground">{EMPTY}</span>;
  const tier = rankTier(rank);
  return (
    <span
      className={cn('inline-block rounded px-1 py-0.5 text-center text-xs font-medium tabular', RANK_HEAT[tier] ?? 'text-muted-foreground')}
      title={`${line.position}${rank.positional} of ${rank.positionalOf} that week · #${rank.overall} overall`}
    >
      {line.position}{rank.positional}
    </span>
  );
}

function ResultCell({ line }) {
  const game = line.game;
  if (!game || game.isBye) return <span className="text-xs text-muted-foreground">{game?.isBye ? 'Bye' : EMPTY}</span>;
  if (!game.result) return <span className="text-muted-foreground">{EMPTY}</span>;
  return (
    <span
      className={cn('text-xs font-semibold tabular', resultTone(game.result))}
      title={`${formatScore(game.teamScore)}–${formatScore(game.opponentScore)}`}
    >
      {game.result}
    </span>
  );
}

function columnsFor({ position, opponents, viewer, onClose }) {
  const stats = (GAME_LOG_STATS[position] ?? []).map((spec) => ({
    key: spec.key,
    header: <span title={spec.title}>{spec.header}</span>,
    cardLabel: spec.header,
    priority: 'detail',
    className: 'text-right tabular',
    headerClassName: 'text-right',
    cell: (line) => {
      const value = statCell(line, spec);
      return value == null ? <span className="text-muted-foreground">{EMPTY}</span> : typeof value === 'string' ? value : formatCount(value);
    },
    scroll: { width: spec.pair ? 4.5 : 3.75, title: spec.title, className: 'text-right' }
  }));

  return [
    {
      key: 'week',
      header: 'Week',
      priority: 'primary',
      cell: (line) => <WeekCell line={line} />,
      sortValue: (line) => line.week,
      scroll: { pin: true, width: 5 }
    },
    {
      key: 'team',
      header: 'Team',
      priority: 'primary',
      cell: (line) => <FranchiseLink franchise={line.franchise} viewer={viewer} onClose={onClose} className="block max-w-40" />,
      scroll: { fluid: '9ch + 0.75rem', cell: (line) => <FranchiseLink franchise={line.franchise} viewer={viewer} onClose={onClose} className="block" /> }
    },
    {
      key: 'opp',
      header: 'Opp',
      cell: (line) => <OpponentChip entry={opponents.get(line.week)?.[line.proTeamId]} />,
      scroll: { width: 3.75 }
    },
    {
      key: 'slot',
      header: 'Slot',
      cell: (line) => <SlotCell line={line} />,
      scroll: { width: 3.25 }
    },
    {
      key: 'pts',
      header: 'Pts',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (line) => <PointsCell line={line} />,
      sortValue: (line) => (line.appeared ? line.actualPoints : null),
      scroll: { width: 4.5, shown: true, className: 'text-right' }
    },
    {
      key: 'proj',
      header: 'Proj',
      className: 'text-right tabular text-muted-foreground',
      headerClassName: 'text-right',
      cell: (line) => formatPoints(line.projectedPoints),
      scroll: { width: 3.75, className: 'text-right' }
    },
    {
      key: 'rank',
      header: 'Rank',
      cell: (line) => <RankCell line={line} />,
      scroll: { width: 3.75 }
    },
    {
      key: 'result',
      header: 'Result',
      cell: (line) => <ResultCell line={line} />,
      scroll: { header: 'Res', title: 'His team’s result', width: 3 }
    },
    ...stats
  ];
}

const SCROLL_ORDER = ['week', 'team', 'pts', 'rank', 'result', 'slot', 'opp', 'proj'];

/**
 * One season's weeks. Its own component so the calendar read is one hook per
 * season, whatever the mode, and hooks never run conditionally.
 */
function SeasonGameLog({ season, position, viewer, onClose, showYear }) {
  const [sort, setSort] = useState(null);
  const { data: schedule } = useNflSeasonSchedule(season.nflSeasonYear);
  // One calendar fetch per season; each week's opponents projected from it once.
  const opponents = useMemo(() => {
    const map = new Map();
    for (const line of season.weeks) {
      if (!map.has(line.week)) map.set(line.week, buildOpponentMap(schedule ?? [], line.week));
    }
    return map;
  }, [schedule, season.weeks]);

  const columns = useMemo(() => columnsFor({ position, opponents, viewer, onClose }), [position, opponents, viewer, onClose]);
  const rows = useMemo(() => sortRows(season.weeks, sort, columns), [season.weeks, sort, columns]);

  return (
    <div className="min-w-0 space-y-2" data-season={season.year}>
      {showYear && <h4 className="text-sm font-semibold text-foreground">{season.year}</h4>}
      <ResponsiveDataTable
        columns={columns}
        data={rows}
        rowKey={(line) => `${line.seasonId}-${line.week}`}
        sort={sort}
        onSortChange={setSort}
        empty="No lineup data for this season"
        tableClassName="text-[13px]"
        // On a phone the default view is Week, Team and Pts: the points are
        // what a reader came for, so they sit beside the team rather than
        // behind Opp and Slot, a swipe away.
        scroll={{ label: `${season.year} game log`, order: SCROLL_ORDER }}
      />
    </div>
  );
}

/**
 * Every week he was rostered: where, against whom, what he scored and how it
 * ranked. In "All seasons" a table per season, newest first.
 */
export default function GameLog({ profile, season, viewer, onClose }) {
  const position = profile.player.position;
  const seasons = season ? [season] : profile.seasons ?? [];
  return (
    <SectionCard title="Game log" icon={ListOrdered}>
      {seasons.length === 0 ? (
        <SectionEmpty>No lineup data for this season</SectionEmpty>
      ) : (
        <div className="space-y-4">
          {seasons.map((s) => (
            <SeasonGameLog
              key={s.seasonId}
              season={s}
              position={position}
              viewer={viewer}
              onClose={onClose}
              showYear={!season}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
