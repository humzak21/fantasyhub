import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Link2, RotateCcw, Route, Swords, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

import { BracketView } from '../BracketView';
import { GameChoice } from './GameChoice';
import { FirstRoundOpponents, RecordsNeeded, SeedChances } from './PathCharts';
import { formatDelta, formatProjectedRecord, formatShare } from './pathFormat';
import { PointsToGetIn } from './PointsToGetIn';
import { ScenarioStandings } from './ScenarioStandings';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { EmptyState } from '../../ui/empty-state';
import { FieldBackdrop } from '../../ui/field-backdrop';
import { RecordText } from '../../ui/number-text';
import { ResponsiveDataTable } from '../../ui/responsive-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { TeamAvatar } from '../../ui/team-identity';
import { TeamLink } from '../../ui/team-link';
import { cn } from '../../../lib/utils';
import { formatOrdinal } from '../../../utils/format';
import { getMaskedOwnerName, getMaskedTeamName } from '../../../utils/displayNameUtils';
import { sortRows } from '../../../utils/tableSort';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { useViewerTeam } from '../../../hooks/use-viewer-team.js';
import {
  applyScenario,
  buildPath,
  decodeScenario,
  decodeScenarioScores,
  encodeScenario,
  pointsToGetIn,
  presetResults,
  projectedGameScore,
  scenarioStandings,
  scoresNeeded,
  simulatePath
} from '../../../../services/playoffPathCalculator.js';
import { toSeasonConfig } from '../../../../utils/seasonConfig.js';
import { flattenStandings, mergeStandings, resolveUpperBracket } from '../../../../utils/projectedBracket.js';
import { computeStandings } from '../../../../utils/standings/computeStandings.js';
import { withMovement } from '../../../../utils/standings/standingsView.js';

/** Games shown under "matter most" before the full list takes over. */
const LEVERAGE_GAMES = 6;

/** Above this the playoffs are not in question, and the bye is what is at stake. */
const SAFE_SHARE = 0.99;

/** A figure and its label: the summary's three numbers. */
function Stat({ label, value, delta = null, large = false }) {
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;
  const moved = delta == null ? '' : formatDelta(delta);
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span
          className={cn(
            'font-display font-semibold leading-none tracking-[-0.01em] tabular',
            large ? 'text-[56px] lg:text-[68px]' : 'text-[32px]'
          )}
        >
          {value}
        </span>
        {moved && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-sm font-medium tabular',
              up && 'text-success',
              down && 'text-destructive'
            )}
          >
            {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
            {moved}
            <span className="sr-only"> percentage points in this scenario</span>
          </span>
        )}
      </p>
    </div>
  );
}

/** Where the team stands now, or on the scenario's table once a game is decided. */
function standingLine(team, row, scenarioStanding) {
  if (row.clinched) return 'Clinched a playoff spot in this scenario';
  if (row.eliminated) return 'Eliminated in this scenario';
  if (scenarioStanding) {
    const scenarioSeed = scenarioStanding.playoffSeed;
    return scenarioSeed ? `Seed ${scenarioSeed} on these results` : 'Outside the field on these results';
  }
  const seed = team.playoffSeed;
  return seed ? `Seed ${seed} as it stands` : `${formatOrdinal(team.leagueRank)} as it stands, outside the field`;
}

/**
 * Path to the Playoffs: pick a team, decide any of the games left, and watch
 * what it does to them.
 *
 * The model is `services/playoffPathCalculator.js`; this renders its output.
 * The scenario is the URL (`team`, and `s` for the decided games and any points
 * typed for them), which is the whole of the state: there is nothing to save, a
 * link is the share button, and reloading the page keeps what was on it.
 *
 * Two readings of a scenario sit side by side, and they answer different things.
 * The odds, charts and bracket are simulated seasons, so an undecided game is
 * played out. The standings table is `computeStandings` over the games with the
 * scenario written on, so an undecided game does not count. That is what lets a
 * member see the exact table a set of results gives, and read points off it.
 *
 * Runs on the main thread, deferred so a press lands before the five thousand
 * seasons behind it do. The table is a sum and is not deferred.
 */
export default function PathToPlayoffs({ season, standingsRows = [], divisions = [] }) {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const { team: viewerTeam } = useViewerTeam();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAllGames, setShowAllGames] = useState(false);
  const [tableSort, setTableSort] = useState(null);

  const schedule = useMemo(() => season?.schedule ?? [], [season?.schedule]);
  const config = useMemo(() => toSeasonConfig(season), [season]);
  const regularSeasonWeeks = config?.regularSeasonWeeks || 14;
  const firstRoundWeek = config?.playoffStartWeek ?? regularSeasonWeeks + 1;

  const teams = useMemo(
    () =>
      [...mergeStandings(standingsRows, season?.teams)]
        .sort((a, b) => (a.playoffSeed ?? 99) - (b.playoffSeed ?? 99) || b.winPercentage - a.winPercentage || b.pointsFor - a.pointsFor)
        .map((team, index) => ({ ...team, leagueRank: index + 1 })),
    [standingsRows, season?.teams]
  );
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);

  const path = useMemo(
    () => (teams.length > 0 ? buildPath({ teams, games: schedule, regularSeasonWeeks }) : null),
    [teams, schedule, regularSeasonWeeks]
  );

  const requestedId = searchParams.get('team');
  const focusId = teamsById.has(requestedId) ? requestedId : viewerTeam?.id ?? teams[0]?.id ?? null;
  const focusTeam = teamsById.get(focusId) ?? null;

  const scenarioParam = searchParams.get('s');
  const scenario = useMemo(
    () => ({
      results: decodeScenario(scenarioParam, schedule),
      scores: decodeScenarioScores(scenarioParam, schedule)
    }),
    [scenarioParam, schedule]
  );
  const { results, scores } = scenario;
  const deferred = useDeferredValue(scenario);

  const baseline = useMemo(
    () => (path && focusId ? simulatePath(path, { focusId }) : null),
    [path, focusId]
  );
  const simulation = useMemo(
    () => (path && focusId && deferred.results.size > 0 ? simulatePath(path, { ...deferred, focusId }) : baseline),
    [path, focusId, deferred, baseline]
  );

  const scenarioGames = useMemo(
    () => (path ? applyScenario(path, schedule, results, scores) : schedule),
    [path, schedule, results, scores]
  );
  const officialTable = useMemo(
    () => computeStandings({ teams, games: schedule, divisions, year: season?.year }),
    [teams, schedule, divisions, season?.year]
  );
  const table = useMemo(
    () =>
      results.size > 0
        ? withMovement(computeStandings({ teams, games: scenarioGames, divisions, year: season?.year }), officialTable)
        : officialTable,
    [teams, scenarioGames, divisions, season?.year, officialTable, results]
  );

  const nameOf = useCallback(
    (team) => (team ? getMaskedTeamName(team, user, isAdmin, teamOwnerNames) : 'Unknown team'),
    [user, isAdmin, teamOwnerNames]
  );

  const update = useCallback(
    (change) =>
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('tab', 'path');
          change(next);
          return next;
        },
        { replace: true }
      ),
    [setSearchParams]
  );

  const setScenario = useCallback(
    (nextResults, nextScores) =>
      update((next) => {
        const encoded = encodeScenario(nextResults, schedule, nextScores);
        if (encoded) next.set('s', encoded);
        else next.delete('s');
      }),
    [update, schedule]
  );
  // A preset can change a winner under typed points; the encoding drops those.
  const setResults = (nextResults) => setScenario(nextResults, scores);

  const chooseWinner = (gameId, teamId) => {
    const nextResults = new Map(results);
    const nextScores = new Map(scores);
    nextScores.delete(gameId);
    if (nextResults.get(gameId) === teamId) nextResults.delete(gameId);
    else nextResults.set(gameId, teamId);
    setScenario(nextResults, nextScores);
  };

  // Points decide the game; clearing them leaves whoever was winning it.
  const setPoints = (gameId, score) => {
    const nextResults = new Map(results);
    const nextScores = new Map(scores);
    if (score) {
      const game = path.games.find((candidate) => candidate.id === gameId);
      nextScores.set(gameId, score);
      nextResults.set(gameId, score.team1Score > score.team2Score ? game.team1Id : game.team2Id);
    } else {
      nextScores.delete(gameId);
    }
    setScenario(nextResults, nextScores);
  };

  // The team's own games are replaced; "favorites" only fills what is undecided.
  const applyPreset = (preset) => {
    const chosen = presetResults(path, preset, focusId);
    setResults(preset === 'favorites' ? new Map([...chosen, ...results]) : new Map([...results, ...chosen]));
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied');
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  if (!path || !focusTeam || !simulation) {
    return (
      <Card>
        <EmptyState icon={Route} title="No standings yet" description="The path opens once the season has teams." />
      </Card>
    );
  }

  if (path.games.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Route}
          title="The regular season is over"
          description="Every game is played, so the field is set. The bracket tab has it."
        />
      </Card>
    );
  }

  const rowOf = (sim, id) => sim.teams.find((team) => team.id === id);
  const focusRow = rowOf(simulation, focusId);
  const baseRow = rowOf(baseline, focusId);
  const { focus } = simulation;
  const scenarioActive = results.size > 0;

  // The figure on each side of a game: what that result leaves the team on.
  const metric = focusRow.made > SAFE_SHARE ? 'bye' : 'made';
  const figuresFor = (impact) =>
    impact && !impact.decided ? [formatShare(impact.ifTeam1[metric]), formatShare(impact.ifTeam2[metric])] : null;
  const impactOf = (gameId) => focus.games.find((game) => game.id === gameId);

  const gameRow = (game, label) => (
    <GameChoice
      key={game.id}
      game={game}
      label={label}
      teamsById={teamsById}
      nameOf={nameOf}
      winnerId={results.get(game.id) ?? null}
      figures={figuresFor(impactOf(game.id))}
      score={scores.get(game.id) ?? null}
      projection={projectedGameScore(path, game, results.get(game.id) ?? null)}
      onChoose={chooseWinner}
      onScore={setPoints}
    />
  );

  const ownGames = path.games.filter((game) => game.team1Id === focusId || game.team2Id === focusId);
  const biggestGames = path.games
    .filter((game) => !impactOf(game.id).involvesFocus && !results.has(game.id))
    .sort((a, b) => impactOf(b.id).swing - impactOf(a.id).swing)
    .slice(0, LEVERAGE_GAMES);
  const weeks = [...new Set(path.games.map((game) => game.week))];

  const bracket = resolveUpperBracket({
    games: [],
    teams: scenarioStandings(path, simulation, teams),
    firstRoundWeek
  });

  const standing = flattenStandings(table);
  const focusStanding = standing.find((row) => row.id === focusId);
  const getIn = pointsToGetIn(standing, focusId);
  const needed = getIn?.status === 'points'
    ? scoresNeeded(path, scenarioGames, results, focusId, getIn.rivalId, getIn.points)
    : [];
  const undecidedInvolved = path.games.filter(
    (game) =>
      !results.has(game.id) &&
      [focusId, getIn?.rivalId].some((id) => id != null && (game.team1Id === id || game.team2Id === id))
  ).length;

  const undecidedCount = path.games.length - results.size;
  let tableNote = "Today's table. Decide a game and it moves.";
  if (undecidedCount === 0) tableNote = 'Every game left is decided, so this is how the season ends.';
  else if (scenarioActive) {
    tableNote = `Today's table with the ${results.size} ${results.size === 1 ? 'game' : 'games'} decided here. The ${undecidedCount} undecided don't count yet.`;
  }

  const tableColumns = [
    {
      key: 'team',
      header: 'Team',
      priority: 'primary',
      sortValue: (row) => nameOf(row.team),
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <TeamAvatar team={row.team} size="xs" />
          <TeamLink team={row.team} className="truncate font-medium">{nameOf(row.team)}</TeamLink>
        </span>
      )
    },
    {
      key: 'finish',
      header: 'Avg finish',
      headerClassName: 'text-right',
      className: 'text-right tabular',
      sortValue: (row) => row.sim.meanWins,
      cell: (row) => formatProjectedRecord(row.sim.meanWins, path.finalPlayed[path.state.ids.indexOf(row.id)] - row.sim.meanWins)
    },
    {
      key: 'odds',
      header: 'Playoffs',
      headerClassName: 'text-right',
      className: 'text-right font-medium tabular',
      sortValue: (row) => row.sim.made,
      cell: (row) => `${row.sim.odds}%`
    },
    {
      key: 'bye',
      header: 'Bye',
      headerClassName: 'text-right',
      className: 'text-right tabular',
      sortValue: (row) => row.sim.bye,
      cell: (row) => formatShare(row.sim.bye)
    },
    // Against the season as it stands, so it says nothing until a game is decided.
    scenarioActive && {
      key: 'change',
      header: 'Change',
      headerClassName: 'text-right',
      className: 'text-right tabular',
      sortValue: (row) => row.sim.odds - row.base.odds,
      cell: (row) => {
        const change = row.sim.odds - row.base.odds;
        return (
          <span className={cn(change > 0 && 'text-success', change < 0 && 'text-destructive')}>
            {formatDelta(change) || '—'}
          </span>
        );
      }
    }
  ].filter(Boolean);
  const tableRows = teams
    .map((team) => ({ id: team.id, team, sim: rowOf(simulation, team.id), base: rowOf(baseline, team.id) }))
    .sort((a, b) => b.sim.made - a.sim.made || b.sim.meanWins - a.sim.meanWins);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" aria-hidden="true" />
            Path to the Playoffs
          </CardTitle>
          <CardDescription>
            Pick a team, decide any game left, and see what it does. Every number is {simulation.simulations.toLocaleString()} simulated
            seasons from week {path.asOfWeek}, on each team&apos;s scoring so far.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select value={focusId} onValueChange={(id) => update((next) => next.set('team', id))}>
            <SelectTrigger aria-label="Team" className="sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {nameOf(team)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div role="group" aria-label="Quick scenarios" className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('win')}>Win out</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('lose')}>Lose out</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('favorites')}>Favorites win</Button>
            <Button type="button" variant="ghost" size="sm" disabled={!scenarioActive} onClick={() => setResults(new Map())}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Button>
          </div>

          <Button type="button" variant="ghost" size="sm" onClick={copyLink} className="sm:ml-auto">
            <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Copy link
          </Button>
        </CardContent>
      </Card>

      {/* The answer, in the page's one lit object. */}
      <section
        aria-label={`${nameOf(focusTeam)} in this scenario`}
        className="relative overflow-hidden rounded-xl border border-border bg-card px-4 py-4 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)] sm:px-6 sm:py-5"
      >
        <FieldBackdrop left={focusTeam} />
        <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <TeamAvatar team={focusTeam} size="lg" className="h-12 w-12" />
            <div className="min-w-0">
              <TeamLink team={focusTeam} className="block truncate text-base font-semibold leading-tight">
                {nameOf(focusTeam)}
              </TeamLink>
              <p className="truncate text-xs text-muted-foreground">
                {getMaskedOwnerName(focusTeam, user, isAdmin, teamOwnerNames)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular">
                <RecordText wins={focusTeam.wins} losses={focusTeam.losses} ties={focusTeam.ties} />
              </p>
              <p className="mt-1.5 text-[13px] font-medium">{standingLine(focusTeam, focusRow, scenarioActive ? focusStanding : null)}</p>
              {scenarioActive && (
                <Badge variant="secondary" className="mt-1.5">
                  {results.size} {results.size === 1 ? 'game' : 'games'} decided
                </Badge>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[auto_auto] items-end gap-x-8 gap-y-3 md:grid-cols-[auto_auto_auto]">
            <div className="col-span-2 md:col-span-1">
              <Stat label="Playoff odds" value={`${focusRow.odds}%`} delta={focusRow.odds - baseRow.odds} large />
            </div>
            <Stat label="Bye" value={formatShare(focusRow.bye)} delta={(focusRow.bye - baseRow.bye) * 100} />
            <Stat
              label="Average finish"
              value={formatProjectedRecord(focusRow.meanWins, path.finalPlayed[path.state.ids.indexOf(focusId)] - focusRow.meanWins)}
            />
          </div>
        </div>
      </section>

      {/* On a phone the table is a screen away from any game, so this is what
          stays in view while they are decided. */}
      {scenarioActive && focusStanding && (
        <div className="sticky top-[calc(3.5rem+1px)] z-20 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)] sm:top-[calc(4rem+1px)] lg:hidden">
          <TeamAvatar team={focusTeam} size="xs" />
          <span className="min-w-0 flex-1 truncate font-medium">{nameOf(focusTeam)}</span>
          <span className="text-muted-foreground tabular">
            <RecordText wins={focusStanding.wins} losses={focusStanding.losses} ties={focusStanding.ties} />
          </span>
          <span className="tabular">{focusStanding.playoffSeed ? `Seed ${focusStanding.playoffSeed}` : 'Out'}</span>
          <span className="font-semibold tabular">{focusRow.odds}%</span>
        </div>
      )}

      {/* Below `lg` the columns dissolve and `order` reads the cards in turn, so
          the table comes straight after the games a member decides first. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="contents lg:block lg:min-w-0 lg:space-y-4">
          <Card className="max-lg:order-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ownGames.length > 0 ? 'Remaining schedule' : 'No games left'}</CardTitle>
              {ownGames.length > 0 && (
                <CardDescription>
                  {metric === 'bye' ? 'Bye chance' : 'Playoff odds'} after each result. Tap a team to decide the game, tap again to undo.
                </CardDescription>
              )}
            </CardHeader>
            {ownGames.length > 0 && (
              <CardContent className="space-y-2.5">
                {ownGames.map((game) => gameRow(game, `Week ${game.week}`))}
              </CardContent>
            )}
          </Card>

          {biggestGames.length > 0 && (
            <Card className="max-lg:order-3">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Swords className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Games to watch
                </CardTitle>
                <CardDescription>
                  The other games that move {nameOf(focusTeam)} the most, with {metric === 'bye' ? 'the bye chance' : 'the playoff odds'} after each result.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {biggestGames.map((game) => gameRow(game, `Week ${game.week}`))}
              </CardContent>
            </Card>
          )}

          <Card className="max-lg:order-4">
            <button
              type="button"
              aria-expanded={showAllGames}
              onClick={() => setShowAllGames((open) => !open)}
              className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-4 text-left text-base font-semibold outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring sm:px-6"
            >
              Every game left
              <span className="flex items-center gap-2 text-[13px] font-normal text-muted-foreground tabular">
                {path.games.length}
                <ChevronDown className={cn('h-4 w-4 transition-transform', showAllGames && 'rotate-180')} aria-hidden="true" />
              </span>
            </button>
            {showAllGames && (
              <CardContent className="space-y-5 pt-1">
                {weeks.map((week) => (
                  <section key={week} aria-labelledby={`path-week-${week}`}>
                    <h3 id={`path-week-${week}`} className="mb-2 text-sm font-semibold">Week {week}</h3>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {path.games.filter((game) => game.week === week).map((game) => gameRow(game, null))}
                    </div>
                  </section>
                ))}
              </CardContent>
            )}
          </Card>
        </div>

        {/* Pinned beside the games from `lg`, so a press is seen landing. It
            scrolls itself when it is taller than the window. */}
        <div className="contents lg:sticky lg:top-[calc(4rem+1rem)] lg:block lg:max-h-[calc(100dvh-4rem-2rem)] lg:min-w-0 lg:space-y-4 lg:overflow-y-auto">
          <Card className="max-lg:order-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Standings in this scenario</CardTitle>
              <CardDescription>
                {tableNote}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScenarioStandings
                standings={table}
                divisions={divisions}
                teamsById={teamsById}
                nameOf={nameOf}
                focusId={focusId}
              />
            </CardContent>
          </Card>

          <Card className="max-lg:order-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Points to get in</CardTitle>
              <CardDescription>Off the table above. Set points on any game to change it.</CardDescription>
            </CardHeader>
            <CardContent>
              <PointsToGetIn
                answer={getIn}
                needed={needed}
                undecided={undecidedInvolved}
                teamsById={teamsById}
                nameOf={nameOf}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Where they finish</CardTitle>
          </CardHeader>
          <CardContent>
            <SeedChances team={focusTeam} row={focusRow} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What it takes</CardTitle>
            <CardDescription>How often each final record is enough, and how often they get there.</CardDescription>
          </CardHeader>
          <CardContent>
            <RecordsNeeded team={focusTeam} records={focus.records} />
          </CardContent>
        </Card>

        {focus.opponents.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">First-round opponent</CardTitle>
              <CardDescription>Most likely, in the seasons they play round 1.</CardDescription>
            </CardHeader>
            <CardContent>
              <FirstRoundOpponents opponents={focus.opponents} teamsById={teamsById} nameOf={nameOf} />
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">The league in this scenario</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveDataTable
            columns={tableColumns}
            data={sortRows(tableRows, tableSort, tableColumns)}
            sort={tableSort}
            onSortChange={setTableSort}
            rowClassName={(row) => (row.id === focusId ? 'ff-viewer-row' : '')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Bracket in this scenario
            <Badge variant="secondary">Projected</Badge>
          </CardTitle>
          <CardDescription>Seeded on each team&apos;s average finish, not one simulated season.</CardDescription>
        </CardHeader>
        <CardContent>
          {bracket && (
            <BracketView
              bracket={bracket}
              viewerTeamId={focusId}
              nameOf={nameOf}
              detailOf={(team) => `${Math.round(team.projectedWins)}-${Math.round(team.projectedLosses)}`}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
