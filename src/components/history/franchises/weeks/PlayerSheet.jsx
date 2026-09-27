import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../ui/sheet';
import { ChartContainer, useMobileAxis } from '../../../ui/chart';
import { OpponentChip } from '../../../ui/opponent-chip';
import { PlayerPoints } from '../../../ui/player-points';
import { cn } from '../../../../lib/utils';
import { getPositionColor } from '../../../../utils/positionColors';
import { EMPTY, formatPoints } from '../../../../utils/format';
import { getMaskedFranchiseName } from '../../utils/privacyHelpers';
import { useNflOpponentMap, usePlayerCareer } from '../../../../../hooks/queries/index.js';
import { buildPlayerCareer, buildPlayerSeason } from '../../../../../utils/franchiseWeeks.js';

const SERIES = 'var(--chart-1)';

/**
 * A player, as he stood in one week — and his season and league career around
 * it. Opens from any lineup row on any franchise's week.
 *
 * "Rank that week" is his finish among the players on a league roster that
 * week (the only players stored), overall and at his position. It is a
 * comparison of stored results, not a projection, and the sheet says which pool
 * it is.
 */
const PlayerSheet = ({ player, week, index, viewer, open, onOpenChange }) => {
  const playerId = player?.playerId ?? null;
  const season = useMemo(
    () => (index && playerId ? buildPlayerSeason(index, playerId) : { weeks: [], splits: null }),
    [index, playerId]
  );
  const { data: career } = usePlayerCareer(playerId, { enabled: open });
  const careerSeasons = useMemo(() => buildPlayerCareer(career), [career]);
  const { data: opponents = {} } = useNflOpponentMap(index?.season.nflSeasonYear, week, { enabled: open });

  const thisWeek = season.weeks.find((w) => w.week === week) ?? null;
  const rank = thisWeek?.rank ?? null;
  const position = player?.position ?? career?.player?.position ?? null;
  // A postseason week goes by its number: the calendar's "Championship" is a
  // consolation week for most of the league (see `gamePhaseLabel`).
  const weekMeta = index?.weeks.find((w) => w.week === week);
  const weekLabel = weekMeta && !weekMeta.isPostseason ? weekMeta.label : `Week ${week}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        {player && (
          <div className="space-y-5">
            <SheetHeader>
              <div className="flex items-center gap-2">
                {position && (
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]', getPositionColor(position))}>
                    {position}
                  </span>
                )}
                <SheetTitle className="font-display text-2xl leading-none">{player.name ?? 'Unknown player'}</SheetTitle>
              </div>
              <SheetDescription>
                {[player.proTeam, `${index?.season.year} · ${weekLabel}`].filter(Boolean).join(' · ')}
              </SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label="Points">
                <PlayerPoints actualPoints={thisWeek?.actualPoints ?? null} display />
              </Stat>
              <Stat label="TDs">{thisWeek?.touchdowns ?? EMPTY}</Stat>
              <Stat label="Opponent">
                <OpponentChip entry={opponents[thisWeek?.proTeamId ?? player.proTeamId]} className="text-sm" />
              </Stat>
              <Stat label="Slot">{thisWeek ? (thisWeek.started ? 'Started' : 'Bench') : EMPTY}</Stat>
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="text-[13px] font-medium text-muted-foreground">Rank that week</div>
              {rank ? (
                <>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <span className="rounded-md bg-primary/15 px-2 py-0.5 text-sm font-semibold text-primary">
                      {rank.position}{rank.positional} <span className="font-normal text-muted-foreground">of {rank.positionalOf}</span>
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-semibold">
                      #{rank.overall} overall <span className="font-normal text-muted-foreground">of {rank.overallOf}</span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">Among players on a league roster that week.</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {thisWeek && thisWeek.actualPoints != null && !thisWeek.appeared
                    ? 'Did not play — no stat line that week.'
                    : 'No result stored for this week.'}
                </p>
              )}
            </div>

            {season.weeks.length > 0 && (
              <PointsByWeek weeks={season.weeks} selectedWeek={week} average={season.splits?.average ?? null} year={index?.season.year} />
            )}

            {season.splits && <Splits splits={season.splits} />}

            {season.weeks.some((w) => w.rank) && position && (
              <RankByWeek weeks={season.weeks} selectedWeek={week} position={position} />
            )}

            <Career seasons={careerSeasons} loading={open && !career} viewer={viewer} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

const Stat = ({ label, children }) => (
  <div className="rounded-lg border border-border bg-muted/20 p-2">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-0.5 font-display text-lg leading-tight tabular">{children}</div>
  </div>
);

function WeekTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{row.label}</div>
      <div className="text-muted-foreground">
        {row.appeared ? `${formatPoints(row.actualPoints)} pts` : row.actualPoints != null ? 'Did not play' : 'No result'}
        {row.rank ? ` · ${row.rank.position}${row.rank.positional}, #${row.rank.overall} overall` : ''}
      </div>
    </div>
  );
}

function PointsByWeek({ weeks, selectedWeek, average, year }) {
  const axis = useMobileAxis();
  // A week he did not play draws no bar, rather than a zero-height one that
  // reads as a dud game.
  const data = weeks.map((w) => ({ ...w, points: w.appeared ? w.actualPoints : null }));
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold">Points by week · {year}</h4>
      <ChartContainer config={{}} className="h-[170px] w-full sm:h-[190px]">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tickLine={false} tick={{ fontSize: 11 }} {...axis.x} />
          <YAxis width={28} tickLine={false} allowDecimals={false} tick={{ fontSize: 11 }} {...axis.y} />
          <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.3 }} content={<WeekTooltip />} />
          {average != null && (
            <ReferenceLine y={average} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.7} />
          )}
          <Bar dataKey="points" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {weeks.map((w) => (
              <Cell key={w.week} fill={SERIES} fillOpacity={w.week === selectedWeek ? 1 : 0.4} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      {average != null && (
        <p className="text-xs text-muted-foreground">
          Dashed line: season average, {formatPoints(average)}, over the weeks he played.
        </p>
      )}
    </div>
  );
}

function Splits({ splits }) {
  const items = [
    ['Total', formatPoints(splits.total)],
    ['Average', formatPoints(splits.average)],
    ['Best', `${formatPoints(splits.best.points)} · W${splits.best.week}`],
    ['Worst', `${formatPoints(splits.worst.points)} · W${splits.worst.week}`],
    ['Played', `${splits.games} of ${splits.rostered}`],
    ['Started', `${splits.starts} of ${splits.rostered}`]
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium tabular">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RankByWeek({ weeks, selectedWeek, position }) {
  const axis = useMobileAxis();
  const data = weeks.map((w) => ({ ...w, positional: w.rank?.positional ?? null }));
  // Weeks he did not play have no rank, and the line breaks there.
  const worst = Math.max(...data.map((d) => d.positional ?? 1));
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold">
        Weekly {position} rank <span className="font-normal text-muted-foreground">(in-league)</span>
      </h4>
      <ChartContainer config={{}} className="h-[140px] w-full">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tickLine={false} tick={{ fontSize: 11 }} {...axis.x} />
          <YAxis
            reversed
            domain={[1, Math.max(worst, 2)]}
            allowDecimals={false}
            width={36}
            tickLine={false}
            tickFormatter={(v) => `#${v}`}
            tick={{ fontSize: 11 }}
            {...axis.y}
          />
          <Tooltip cursor={{ stroke: 'var(--border)' }} content={<WeekTooltip />} />
          <ReferenceLine x={selectedWeek} stroke="var(--border)" />
          <Line
            type="linear"
            dataKey="positional"
            stroke={SERIES}
            strokeWidth={2}
            dot={{ r: 3, fill: SERIES, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

function Career({ seasons, loading, viewer }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">In this league</h4>
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        </div>
      ) : seasons.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other rostered weeks stored.</p>
      ) : (
        <ul className="space-y-2">
          {seasons.map((s) => (
            <li key={s.year} className="rounded-lg border border-border p-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{s.year}</span>
                <span className="text-xs text-muted-foreground tabular">
                  {s.splits ? `${formatPoints(s.splits.total)} pts · ${formatPoints(s.splits.average)} avg · ${s.splits.games} games` : 'No results stored'}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {s.stints.map((stint) => (
                  <li key={`${stint.franchiseId}-${stint.fromWeek}`}>
                    {getMaskedFranchiseName(
                      { id: stint.franchiseId, owner_name: stint.owner, display_name: null },
                      viewer.user,
                      viewer.isAdmin,
                      viewer.teamOwnerNames
                    )}
                    {' · '}
                    {stint.fromWeek === stint.toWeek ? `week ${stint.fromWeek}` : `weeks ${stint.fromWeek}–${stint.toWeek}`}
                    {` · started ${stint.starts} of ${stint.weeks}`}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PlayerSheet;
