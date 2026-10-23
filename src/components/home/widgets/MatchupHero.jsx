import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronDown, Swords, Trophy } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { MatchupHistory } from './MatchupHistory';
import LineupPanel from '../../schedule/LineupPanel';
import { Badge } from '../../ui/badge';
import { PlayerPoints } from '../../ui/player-points';
import { RecordText } from '../../ui/number-text';
import { Skeleton } from '../../ui/skeleton';
import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { formatOrdinal, formatPoints } from '../../../utils/format';
import { getMaskedOwnerName, getMaskedTeamName } from '../../../utils/displayNameUtils';
import { teamRosterPath } from '../../teams/teamLink';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { useLineupsForWeek, useRankingsForWeek } from '../../../../hooks/queries/index.js';
import { isScoringStarter, starterTotal, totalAsPoints } from '../../../../utils/lineupTotals.js';
import { gamePhaseLabel } from '../../../../utils/franchiseWeeks.js';
import { franchiseIdOf } from '../../../../utils/viewerTeam.js';
import {
  findMatchup,
  matchupStatus,
  nextMatchup,
  orientScores
} from '../../../../utils/home/matchup.js';
import { getTeamColor } from '../../../utils/teamColors';
import { useCountUp } from '../../../hooks/use-count-up.js';
import { headToHeadPath } from '../../history/headtohead/headToHeadLink.js';

const FINISH_LABEL = {
  champion: 'Champion',
  '2nd': 'Runner-up',
  '3rd': 'Third place',
  '4th': 'Fourth place',
  '5th': 'Fifth place',
  '6th': 'Sixth place'
};

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * The page's one lit object: the viewer's game this week.
 *
 * It picks a shape and hands off — each shape is its own component so its
 * hooks run unconditionally:
 *
 * - a team and a game → `ViewerMatchup` (both sides, totals, history, rosters)
 * - a team and no opponent → `ByeWeek`, pointing at the next game
 * - no team (the admin without a franchise, a co-manager) → `WeekScoreboard`
 * - before week 1 / after the final → `Preseason` / `SeasonComplete`
 *
 * Present tense throughout: `ctx.actualWeek`, never the viewed week.
 */
export default function MatchupHero({ ctx }) {
  const { phase, viewerTeam, season, actualWeek } = ctx;

  if (phase === 'loading' || !season || actualWeek == null) {
    return (
      <HomeWidget id="matchup" icon={Swords} title="Your matchup" loading skeleton={<HeroSkeleton />} />
    );
  }

  if (phase === 'preseason') return <Preseason ctx={ctx} />;
  if (phase === 'complete') return <SeasonComplete ctx={ctx} />;
  if (!viewerTeam) return <WeekScoreboard ctx={ctx} />;

  const found = findMatchup(season.schedule, viewerTeam.id, actualWeek);
  if (found.bye) return <ByeWeek ctx={ctx} />;
  return <ViewerMatchup ctx={ctx} matchup={found} />;
}

/** `Week 8` as a chip — chips are the one place uppercase belongs. */
function WeekChip({ week }) {
  return (
    <Badge variant="secondary" className="tabular uppercase tracking-[0.06em]">
      Week {week}
    </Badge>
  );
}

function useMasked() {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  return useMemo(
    () => ({
      teamName: (team) => (team ? getMaskedTeamName(team, user, isAdmin, teamOwnerNames) : 'Unknown team'),
      ownerName: (team) => (team ? getMaskedOwnerName(team, user, isAdmin, teamOwnerNames) : null)
    }),
    [user, isAdmin, teamOwnerNames]
  );
}

function ViewerMatchup({ ctx, matchup }) {
  const { season, seasonId, actualWeek, viewerTeam, openTab, canOpenTab } = ctx;
  const { game, side, opponentId } = matchup;
  const masked = useMasked();

  const opponent = season.teams.find((t) => sameId(t.id, opponentId)) ?? null;

  // The same key the Rankings tab holds when its viewed week is the actual
  // week, and the same entry the rankings slice below reads.
  const rankings = useRankingsForWeek(seasonId, actualWeek, actualWeek);
  const lineups = useLineupsForWeek(seasonId, actualWeek, { actualWeek });

  const standingOf = (teamId) => {
    const rows = rankings.data ?? [];
    const index = rows.findIndex((row) => sameId(row.teamId ?? row.id, teamId));
    return index === -1 ? null : { ...rows[index], rank: index + 1 };
  };

  const scores = orientScores(game, side);
  const hasScores = scores.own != null && scores.opponent != null;
  const ownRows = lineups.data?.[viewerTeam.id] ?? [];
  const opponentRows = lineups.data?.[opponentId] ?? [];
  const totals = { own: starterTotal(ownRows), opponent: starterTotal(opponentRows) };

  // The imported score wins; until there is one, the starters' total stands in.
  const status = matchupStatus({
    completed: Boolean(game.isCompleted),
    own: hasScores ? scores.own : totals.own?.total ?? null,
    opponent: hasScores ? scores.opponent : totals.opponent?.total ?? null,
    anyActual: [...ownRows, ...opponentRows].some((row) => isScoringStarter(row) && row.actualPoints != null)
  });

  const phaseLabel = gamePhaseLabel(game.type);
  const viewerFranchiseId = franchiseIdOf(viewerTeam);
  const opponentFranchiseId = franchiseIdOf(opponent);
  const historyHref =
    viewerFranchiseId && opponentFranchiseId && (canOpenTab?.('history') ?? true)
      ? headToHeadPath(viewerFranchiseId, opponentFranchiseId)
      : null;

  return (
    <HomeWidget
      id="matchup"
      icon={Swords}
      title="Your matchup"
      aside={<WeekChip week={actualWeek} />}
      to="/schedule"
      toLabel="Open this week's schedule"
      onNavigate={() => openTab?.()}
      flush
    >
      {/* The scoreboard: the page's one lit object, on the page's one field. */}
      <div className="relative overflow-hidden px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
        <FieldBackdrop left={viewerTeam} right={opponent} />

        <div className="relative">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
            <MatchupSide
              team={viewerTeam}
              name={masked.teamName(viewerTeam)}
              owner={masked.ownerName(viewerTeam)}
              standing={standingOf(viewerTeam.id)}
              score={hasScores ? scores.own : null}
              total={totals.own}
              loading={!hasScores && lineups.isLoading}
              isViewer
            />
            <div className="flex flex-col items-center gap-1.5 self-center">
              <span
                aria-hidden="true"
                className="rounded-md border border-border bg-card/80 px-2 py-1 font-display text-sm font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground"
              >
                vs
              </span>
            </div>
            <MatchupSide
              team={opponent}
              name={masked.teamName(opponent)}
              owner={masked.ownerName(opponent)}
              standing={standingOf(opponentId)}
              score={hasScores ? scores.opponent : null}
              total={totals.opponent}
              loading={!hasScores && lineups.isLoading}
              align="end"
            />
          </div>

          <ShareBar share={status.share} left={viewerTeam} right={opponent} />

          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[13px]">
            <span className="font-medium uppercase tracking-[0.06em] text-[11px] text-muted-foreground">
              {status.phase}
            </span>
            {phaseLabel && (
              <>
                <span aria-hidden="true" className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{phaseLabel}</span>
              </>
            )}
            {status.text && (
              <>
                <span aria-hidden="true" className="text-muted-foreground">·</span>
                <span
                  className={cn(
                    'font-medium tabular',
                    status.lead > 0 && 'text-success',
                    status.lead < 0 && 'text-destructive'
                  )}
                >
                  {status.text}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-border/60 border-t border-border/60">
        <Disclosure label="Head to head" defaultOpenAtLg>
          <MatchupHistory
            viewerFranchiseId={viewerFranchiseId}
            opponentFranchiseId={opponentFranchiseId}
            historyHref={historyHref}
          />
        </Disclosure>
        <Disclosure label="Rosters" flush>
          <LineupPanel
            seasonId={seasonId}
            nflSeasonYear={season.espnSeasonYear ?? season.espn_season_year ?? season.year ?? null}
            week={actualWeek}
            actualWeek={actualWeek}
            sides={[
              { teamId: viewerTeam.id, teamName: masked.teamName(viewerTeam) },
              { teamId: opponentId, teamName: masked.teamName(opponent) }
            ]}
          />
        </Disclosure>
      </div>
    </HomeWidget>
  );
}

/**
 * The field behind the scoreboard: each side washed in its franchise colour,
 * brightest at the outer edge and gone by the centre, over faint yard lines
 * every tenth with a brighter midfield. The one decorative element on the
 * page, in the one place that is a field. Inline gradients over the team's
 * `var(--team-N)` — no class names built at runtime.
 */
function FieldBackdrop({ left, right }) {
  const wash = (team, direction) =>
    team
      ? `linear-gradient(${direction}, color-mix(in oklab, ${getTeamColor(team).value} 16%, transparent), transparent 48%)`
      : 'none';

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0" style={{ backgroundImage: `${wash(left, '90deg')}, ${wash(right, '270deg')}` }} />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(90deg, transparent calc(50% - 1px), color-mix(in oklab, var(--foreground) 14%, transparent) calc(50% - 1px), color-mix(in oklab, var(--foreground) 14%, transparent) calc(50% + 1px), transparent calc(50% + 1px)), repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), var(--border) calc(10% - 1px), var(--border) 10%)',
          maskImage: 'linear-gradient(180deg, transparent, black 25%, black 75%, transparent)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent, black 25%, black 75%, transparent)'
        }}
      />
    </div>
  );
}

/**
 * The two totals as one bar: each side's share of the combined points, in
 * its franchise colour. A tug of war, not a probability — it says who is
 * ahead and by how much at a glance, and the line under it says it in words.
 */
function ShareBar({ share, left, right }) {
  if (share == null) return <div className="mt-4 h-1.5 rounded-full bg-muted" aria-hidden="true" />;
  return (
    <div className="mt-4 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      <div
        className="h-full rounded-l-full transition-[width] duration-700 ease-out"
        style={{ width: `${share}%`, background: left ? getTeamColor(left).value : 'var(--muted)' }}
      />
      <div
        className="h-full flex-1 rounded-r-full opacity-70"
        style={{ background: right ? getTeamColor(right).value : 'var(--muted)' }}
      />
    </div>
  );
}

/**
 * One team's half. On a phone the identity sits over the score; from `md`
 * they share a row — identity at the outer edge, score toward the middle — so
 * the card has no dead centre. The identity links to the team's roster.
 */
function MatchupSide({ team, name, owner, standing, score, total, loading, isViewer = false, align = 'start' }) {
  const end = align === 'end';
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4',
        end ? 'items-end md:flex-row-reverse' : 'items-start'
      )}
    >
      {team ? (
        <Link
          to={teamRosterPath(team.id)}
          title={name}
          className={cn(
            'group -m-1.5 flex min-w-0 max-w-full flex-col gap-2 rounded-lg p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-row md:items-center md:gap-3',
            end ? 'items-end text-right md:flex-row-reverse' : 'items-start text-left'
          )}
        >
          <TeamAvatar team={team} size="lg" className="h-10 w-10 lg:h-12 lg:w-12" />
          <div className="min-w-0 max-w-full">
            <p className="truncate text-[15px] font-semibold leading-tight tracking-[-0.006em] underline-offset-2 decoration-foreground/40 group-hover:underline lg:text-base">
              {name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {owner}
              {isViewer && <span className="ml-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-primary">You</span>}
            </p>
            {standing && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground tabular">
                <RecordText wins={standing.wins} losses={standing.losses} ties={standing.ties} />
                <span aria-hidden="true"> · </span>
                Power #{standing.rank}
              </p>
            )}
          </div>
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">Unknown team</p>
      )}

      <Score score={score} total={total} loading={loading} label={name} align={align} />
    </div>
  );
}

/**
 * A side's number, counting up once on arrival. The imported score always
 * wins; until there is one the lineup's starter total stands in, labelled
 * "proj" by `PlayerPoints` while any starter is still a projection. No lineup
 * data is the em dash, never 0.
 */
function Score({ score, total, loading, label, align = 'start' }) {
  const isResult = score != null;
  const target = isResult ? score : total?.total ?? null;
  const shown = useCountUp(target);
  const className = cn(
    'block shrink-0 font-display text-[40px] font-semibold leading-none tracking-[-0.01em] tabular lg:text-[56px]',
    align === 'end' && 'text-right'
  );

  if (loading) return <Skeleton className="h-10 w-24 shrink-0 lg:h-14 lg:w-32" />;

  if (isResult) {
    return (
      <span className={className} aria-label={`${label}: ${formatPoints(score)}`}>
        {formatPoints(shown)}
      </span>
    );
  }

  return (
    <PlayerPoints
      {...totalAsPoints(total ? { ...total, total: shown } : total)}
      display
      className={cn(className, 'whitespace-nowrap')}
    />
  );
}

/**
 * A full-width row that opens a section beneath it. `defaultOpenAtLg` starts
 * it open on a wide screen, where there is room, and closed on a phone, where
 * the matchup itself should fit the first screen.
 */
function Disclosure({ label, defaultOpenAtLg = false, flush = false, children }) {
  const [open, setOpen] = useState(
    () =>
      defaultOpenAtLg &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 1024px)').matches
  );

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-sm font-medium transition-colors hover:bg-accent/40"
      >
        {label}
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {/* Rendered only while open, so the series and both lineups are not
          fetched for a reader who never looks at them. */}
      {open && <div className={cn(flush ? '' : 'px-4 pb-4')}>{children}</div>}
    </div>
  );
}

function ByeWeek({ ctx }) {
  const { season, actualWeek, viewerTeam, canOpenTab } = ctx;
  const masked = useMasked();
  const next = nextMatchup(season.schedule, viewerTeam.id, actualWeek);
  const opponent = next ? season.teams.find((t) => sameId(t.id, next.opponentId)) : null;

  return (
    <HomeWidget id="matchup" icon={Swords} title="Your matchup" aside={<WeekChip week={actualWeek} />}>
      <div className="space-y-4">
        <div>
          <p className="font-display text-[32px] font-semibold leading-none tracking-[-0.01em]">Bye week</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {opponent
              ? `Next up: ${masked.teamName(opponent)} in week ${next.week}.`
              : 'No game left on your schedule.'}
          </p>
        </div>
        {opponent && (
          <div className="-mx-4 border-t border-border/60">
            <Disclosure label={`History with ${masked.teamName(opponent)}`}>
              <MatchupHistory
                viewerFranchiseId={franchiseIdOf(viewerTeam)}
                opponentFranchiseId={franchiseIdOf(opponent)}
                historyHref={
                  franchiseIdOf(viewerTeam) && franchiseIdOf(opponent) && (canOpenTab?.('history') ?? true)
                    ? headToHeadPath(franchiseIdOf(viewerTeam), franchiseIdOf(opponent))
                    : null
                }
              />
            </Disclosure>
          </div>
        )}
      </div>
    </HomeWidget>
  );
}

/**
 * For a member with no team: every game this week, two lines each, with the
 * score or the projected starter total. One lineup fetch for the whole week.
 */
function WeekScoreboard({ ctx }) {
  const { season, seasonId, actualWeek, openTab } = ctx;
  const masked = useMasked();
  const lineups = useLineupsForWeek(seasonId, actualWeek, { actualWeek });
  const games = season.schedule.filter((g) => g.week === actualWeek);

  const line = (teamId, score) => {
    const team = season.teams.find((t) => sameId(t.id, teamId));
    return (
      <div className="flex min-h-9 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          {team && <TeamAvatar team={team} size="xs" />}
          <span className="truncate text-sm">{masked.teamName(team)}</span>
        </span>
        {score != null ? (
          <span className="font-display text-lg font-semibold tabular">{formatPoints(score)}</span>
        ) : lineups.isLoading ? (
          <Skeleton className="h-4 w-12" />
        ) : (
          <PlayerPoints
            {...totalAsPoints(starterTotal(lineups.data?.[teamId] ?? []))}
            display
            className="text-lg"
          />
        )}
      </div>
    );
  };

  return (
    <HomeWidget
      id="matchup"
      icon={Swords}
      title="This week"
      aside={<WeekChip week={actualWeek} />}
      to="/schedule"
      toLabel="Open this week's schedule"
      onNavigate={() => openTab?.()}
      empty={games.length === 0 && <p className="text-sm text-muted-foreground">No games this week.</p>}
    >
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => (
          <li key={game.id} className="rounded-lg border border-border bg-muted/20 px-3 py-1.5">
            {line(game.team1Id, game.team1Score)}
            {game.type === 'bye' || game.team2Id == null ? (
              <p className="min-h-9 py-2 text-sm text-muted-foreground">Bye</p>
            ) : (
              line(game.team2Id, game.team2Score)
            )}
          </li>
        ))}
      </ul>
    </HomeWidget>
  );
}

function Preseason({ ctx }) {
  const { season, viewerTeam, daysToStart } = ctx;
  const masked = useMasked();
  const first = viewerTeam ? findMatchup(season.schedule, viewerTeam.id, 1) : null;
  const opponent =
    first && !first.bye ? season.teams.find((t) => sameId(t.id, first.opponentId)) : null;

  return (
    <HomeWidget id="matchup" icon={CalendarClock} title="Kickoff">
      <p className="font-display text-[40px] font-semibold leading-none tracking-[-0.01em] tabular">
        {daysToStart === 1 ? '1 day' : `${daysToStart ?? '—'} days`}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        until week 1 of the {season.year} season
        {opponent ? `. You open against ${masked.teamName(opponent)}.` : '.'}
      </p>
    </HomeWidget>
  );
}

function SeasonComplete({ ctx }) {
  const { season, viewerTeam } = ctx;
  const masked = useMasked();
  const champion = season.teams.find((t) => (t.playoffFinish ?? t.playoff_finish) === 'champion');
  const finish = viewerTeam ? (viewerTeam.playoffFinish ?? viewerTeam.playoff_finish) : null;
  const finalRank = viewerTeam ? (viewerTeam.finalRank ?? viewerTeam.final_rank) : null;

  return (
    <HomeWidget id="matchup" icon={Trophy} title={`The ${season.year} season`}>
      <div className="space-y-2">
        {champion && (
          <p className="font-display text-[32px] font-semibold leading-tight tracking-[-0.01em]">
            {masked.teamName(champion)} are champions
          </p>
        )}
        {viewerTeam && (
          <p className="text-sm text-muted-foreground">
            You finished{' '}
            {FINISH_LABEL[finish] ?? (finalRank ? `${formatOrdinal(finalRank)} overall` : 'the season')}.
          </p>
        )}
      </div>
    </HomeWidget>
  );
}

/** The hero's shape: two identity blocks, two numerals, a bar. */
function HeroSkeleton() {
  return (
    <div role="status" aria-label="Loading your matchup" className="space-y-4">
      <div className="grid grid-cols-2 gap-6" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className={cn('flex flex-col gap-2', i === 1 && 'items-end')}>
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-10 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
