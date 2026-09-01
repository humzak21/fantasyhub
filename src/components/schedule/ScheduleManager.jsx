import React, { useState } from 'react';
import { Calendar, Users, Edit3, Trash2, ChevronDown, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EmptyState } from '../ui/empty-state';
import { OpponentChip } from '../ui/opponent-chip';
import { PlayerPoints } from '../ui/player-points';
import { TeamIdentity } from '../ui/team-identity';
import { IndependentColumns } from '../ui/independent-columns';
import PageHeader from '../layout/PageHeader';
import { isUserTeam, getUserTeamHighlightClasses } from '../../utils/userTeamUtils';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import { getPositionColor } from '../../utils/positionColors';
import { formatPoints } from '../../utils/format';
import { cn } from '../../lib/utils';
import SeasonProgressBar from '../season/SeasonProgressBar';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  useActualWeek,
  useCurrentLineups,
  useNflOpponentMap,
  useWeekPlayerStats
} from '../../../hooks/queries/index.js';

/** The slots this league starts, in lineup order. Matches OPTIMAL_LINEUP_TEMPLATE. */
const STARTER_SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K'];

const ScheduleManager = ({
  season = null,
  schedule = [],
  currentWeek = 1, // Added currentWeek prop to sync with week navigator
  onUpdateGame,
  onDeleteGame,
  onWeekChange, // Added to handle week navigation from progress bar
  loading = false,
  isAuthenticated = false, // This now represents isAdmin from parent
  powerRankings = [],
  rosters = {},
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const [viewMode, setViewMode] = useState('week'); // 'week' or 'full'

  // The week the league is actually in, which is what decides whether a viewed
  // week is history or now. `currentWeek` is the *viewed* week and cannot
  // answer that: navigating to week 3 in November must still read week 3 as a
  // finished week. See the week-state split in `hooks/queries/useWeek.jsx`.
  const actualWeek = useActualWeek();

  // Hooks first: `season` is null on the empty state below, and a conditional
  // hook would change the call order between renders.
  const seasonId = season?.id ?? null;
  // The NFL season the opponent chips are keyed on. `espn_season_year` is the
  // year ESPN's calendar endpoint is keyed by; `year` is the same value today
  // and is the fallback for a season row created before that column existed.
  const nflSeasonYear =
    season?.espnSeasonYear ?? season?.espn_season_year ?? season?.year ?? null;

  if (!season) {
    return (
      <>
        <PageHeader icon={Calendar} title="Schedule" />
        <EmptyState
          icon={Calendar}
          title="No active season"
          description="Create a season, or make one active, to see its schedule."
        />
      </>
    );
  }

  const getGamesForWeek = (week) => {
    return schedule.filter(game => game.week === week);
  };

  const getTeamName = (teamId, game = null) => {
    // Handle bye weeks
    if (game && game.type === 'bye' && teamId === game.team2Id) {
      return 'BYE';
    }
    const team = season.teams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  };

  const getWeekStatus = (week) => {
    const weekGames = getGamesForWeek(week);
    if (weekGames.length === 0) return 'empty';
    if (weekGames.every(game => game.isCompleted)) return 'completed';
    if (weekGames.some(game => game.isCompleted)) return 'partial';
    return 'scheduled';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-success" aria-hidden="true" />;
      case 'partial':
        return <Clock size={16} className="text-warning" aria-hidden="true" />;
      default:
        return <Calendar size={16} className="text-muted-foreground" aria-hidden="true" />;
    }
  };

  // `text-foreground/50/50` — two opacity modifiers on one utility, which
  // Tailwind does not parse, so the "scheduled" and default weeks had no text
  // colour at all. Statuses read from the tokens now.
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'border-success/30 bg-success/10 text-success';
      case 'partial':
        return 'border-warning/30 bg-warning/10 text-warning';
      default:
        return 'border-border bg-muted text-muted-foreground';
    }
  };

  return (
    <div>
      <PageHeader
        icon={Calendar}
        title="Schedule"
        description={`Week ${currentWeek} of ${season.totalWeeks || '—'}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'week' ? 'full' : 'week')}>
            <Users className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {viewMode === 'week' ? 'Full season' : 'This week'}
          </Button>
        }
      />

      {/* Season Progress Bar */}
      <div className="mb-6">
        <SeasonProgressBar
          season={season}
          schedule={schedule}
          currentWeek={currentWeek}
          onWeekChange={onWeekChange}
        />
      </div>

      {season.teams.length < 2 ? (
        <EmptyState
          icon={Users}
          title="Not enough teams"
          description="A schedule needs at least two teams in the season."
        />
      ) : (
        <>
          {/* View Mode: Week */}
          {viewMode === 'week' && (
            <div className="space-y-4">
              {/* Week games */}
              <WeekScheduleView
                week={currentWeek}
                games={getGamesForWeek(currentWeek)}
                teams={season.teams}
                seasonId={seasonId}
                nflSeasonYear={nflSeasonYear}
                actualWeek={actualWeek}
                onUpdateGame={onUpdateGame}
                onDeleteGame={onDeleteGame}
                isAuthenticated={isAuthenticated}
                user={user}
                powerRankings={powerRankings}
                rosters={rosters}
                isAdmin={isAdmin}
                teamOwnerNames={teamOwnerNames}
              />
            </div>
          )}

          {/* View Mode: Full Schedule */}
          {viewMode === 'full' && (
            <FullScheduleView
              schedule={schedule}
              teams={season.teams}
              totalWeeks={season.totalWeeks}
              regularSeasonWeeks={season.regularSeasonWeeks}
              getWeekStatus={getWeekStatus}
              getStatusIcon={getStatusIcon}
              getStatusColor={getStatusColor}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          )}
        </>
      )}

    </div>
  );
};

// Week Schedule View Component
const WeekScheduleView = ({
  week,
  games,
  teams,
  seasonId = null,
  nflSeasonYear = null,
  actualWeek = 1,
  onUpdateGame,
  onDeleteGame,
  isAuthenticated = false,
  user = null,
  powerRankings = [],
  rosters = {},
  isAdmin = false,
  teamOwnerNames = []
}) => {
  const [openLineupId, setOpenLineupId] = useState(null);

  if (games.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calendar size={48} className="mx-auto mb-4 text-muted-foreground" />
        <p>No games scheduled for Week {week}</p>
      </div>
    );
  }

  return (
    /*
      Independent columns, and one open lineup at a time.
      Three things went wrong here. Grid cells stretch to their row's height,
      so opening one card's lineups made the card beside it grow to match and
      look "open but blank". Grid *rows* then pushed everything below down,
      so expanding on the left moved the right-hand column too. And each card
      owned its own `<details>`, so several could sit open at once and the
      week became a wall of squad lists. Columns are their own block flow now,
      the open card is state here, and opening one closes the rest.
    */
    <IndependentColumns
      items={games}
      itemKey={(game) => game.id}
      columns={2}
    >
      {(game) => (
        <GameCard
          game={game}
          seasonId={seasonId}
          nflSeasonYear={nflSeasonYear}
          actualWeek={actualWeek}
          onUpdateGame={onUpdateGame}
          onDeleteGame={onDeleteGame}
          isAuthenticated={isAuthenticated}
          teams={teams}
          user={user}
          powerRankings={powerRankings}
          rosters={rosters}
          isAdmin={isAdmin}
          teamOwnerNames={teamOwnerNames}
          isLineupOpen={openLineupId === game.id}
          onToggleLineup={() =>
            setOpenLineupId((current) => (current === game.id ? null : game.id))
          }
        />
      )}
    </IndependentColumns>
  );
};

// Full Schedule View Component
const FullScheduleView = ({
  schedule,
  teams,
  totalWeeks,
  regularSeasonWeeks,
  getWeekStatus,
  getStatusIcon,
  getStatusColor,
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  const getTeamName = (teamId, game = null) => {
    // Handle bye weeks
    if (game && game.type === 'bye' && teamId === game.team2Id) {
      return 'BYE';
    }
    const team = teams.find(t => t.id === teamId);
    return team ? getMaskedTeamName(team, user, isAdmin, teamOwnerNames) : 'Unknown Team';
  };

  const getGamesForWeek = (week) => {
    return schedule.filter(game => game.week === week);
  };

  return (
    <div className="space-y-6">
      {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(week => {
        const weekGames = getGamesForWeek(week);
        const status = getWeekStatus(week);
        const isPlayoff = week > regularSeasonWeeks;
        
        return (
          <div key={week} className={`border rounded-lg p-4 ${getStatusColor(status)}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {getStatusIcon(status)}
                Week {week}
                {isPlayoff && <span className="text-sm font-normal">(Playoffs)</span>}
              </h3>
              <div className="text-sm">
                {weekGames.filter(g => g.isCompleted).length}/{weekGames.length} completed
              </div>
            </div>
            
            {weekGames.length === 0 ? (
              <p className="text-sm opacity-75">No games scheduled</p>
            ) : (
              <div className="grid gap-3">
                {weekGames.map(game => {
                  const team1 = teams.find(t => t.id === game.team1Id);
                  const team2 = teams.find(t => t.id === game.team2Id);
                  const isUserGame = isUserTeam(team1, user) || isUserTeam(team2, user);
                  const baseClasses = "bg-card bg-opacity-50 rounded p-3 border";
                  const highlightClasses = getUserTeamHighlightClasses(isUserGame);
                  const borderClasses = game.isCompleted
                    ? "border-green-200 dark:border-green-700/30"
                    : "border-border";

                  const isTeam1Winner = game.isCompleted && game.winnerTeamId === game.team1Id;
                  const isTeam2Winner = game.isCompleted && game.winnerTeamId === game.team2Id;

                  return (
                    <div key={game.id} className={`${baseClasses} ${highlightClasses} ${borderClasses}`}>
                      <div className="flex items-center justify-between gap-4">
                        {/* Team 1 */}
                        <div className={`flex-1 flex items-center gap-2 ${isTeam1Winner ? 'font-bold' : 'font-medium'}`}>
                          <span className="flex-1 truncate">
                            {getTeamName(game.team1Id, game)}
                          </span>
                          {game.isCompleted && (
                            <span className={`text-lg font-bold min-w-[3rem] text-right ${
                              isTeam1Winner
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-muted-foreground'
                            }`}>
                              {game.team1Score}
                            </span>
                          )}
                        </div>

                        {/* VS or Score Separator */}
                        <div className="flex-shrink-0 px-2">
                          {game.isCompleted ? (
                            <span className="text-muted-foreground font-medium">-</span>
                          ) : (
                            <span className="text-muted-foreground text-xs font-medium">vs</span>
                          )}
                        </div>

                        {/* Team 2 */}
                        <div className={`flex-1 flex items-center gap-2 ${isTeam2Winner ? 'font-bold' : 'font-medium'}`}>
                          {game.isCompleted && (
                            <span className={`text-lg font-bold min-w-[3rem] ${
                              isTeam2Winner
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-muted-foreground'
                            }`}>
                              {game.team2Score}
                            </span>
                          )}
                          <span className="flex-1 truncate text-right">
                            {getTeamName(game.team2Id, game)}
                          </span>
                        </div>
                      </div>

                      {/* Game indicators */}
                      {game.isCompleted && (game.isBlowout || game.isClose) && (
                        <div className="flex gap-1 mt-2">
                          {game.isBlowout && (
                            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded dark:bg-orange-900/30 dark:text-orange-300">
                              Blowout
                            </span>
                          )}
                          {game.isClose && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded dark:bg-blue-900/30 dark:text-blue-300">
                              Close
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Game Card Component with Versus Layout
const GameCard = ({
  game,
  seasonId = null,
  nflSeasonYear = null,
  actualWeek = 1,
  onUpdateGame,
  onDeleteGame,
  isAuthenticated = false,
  teams = [],
  user = null,
  powerRankings = [],
  rosters = {},
  isAdmin = false,
  teamOwnerNames = [],
  isLineupOpen = false,
  onToggleLineup,
}) => {
  const [editing, setEditing] = useState(false);
  const [scores, setScores] = useState({
    team1Score: game.team1Score || '',
    team2Score: game.team2Score || ''
  });

  const handleSave = async () => {
    try {
      await onUpdateGame(
        game.week,
        game.team1Id,
        game.team2Id,
        scores.team1Score ? parseFloat(scores.team1Score) : null,
        scores.team2Score ? parseFloat(scores.team2Score) : null
      );
      setEditing(false);
    } catch (error) {
      alert('Error updating game: ' + error.message);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this game?')) {
      try {
        await onDeleteGame(game.id);
      } catch (error) {
        alert('Error deleting game: ' + error.message);
      }
    }
  };

  const getTeamStats = (teamId) => {
    const ranking = powerRankings.find(r => (r.teamId || r.id) === teamId);
    return ranking || {};
  };

  const getTeamRanking = (teamId) => {
    const ranking = powerRankings.find(r => (r.teamId || r.id) === teamId);
    return ranking ? ranking.rank : null;
  };


  const isBye = game.type === 'bye';
  const team1 = teams.find((t) => t.id === game.team1Id);
  const team2 = teams.find((t) => t.id === game.team2Id);
  const isUserGame = isUserTeam(team1, user) || isUserTeam(team2, user);
  const highlightClasses = getUserTeamHighlightClasses(isUserGame);

  const hasRosters =
    (rosters[game.team1Id]?.roster?.length || 0) > 0 ||
    (rosters[game.team2Id]?.roster?.length || 0) > 0;

  /**
   * One team's line in the matchup.
   *
   * The card this replaces gave each team a panel containing its full roster —
   * up to sixteen player rows a side, inline, always. Stacked on a phone a
   * single matchup ran several screen-heights, so the schedule stopped being
   * a schedule: you could not see who was playing whom without scrolling past
   * a squad list. The line is the fixture; the roster is behind a disclosure
   * and is not rendered until it is opened.
   */
  const TeamRow = ({ teamId, score, isWinner, isByeSlot }) => {
    const team = teams.find((t) => t.id === teamId);
    const stats = getTeamStats(teamId);
    const rank = getTeamRanking(teamId);

    if (isByeSlot) {
      return (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-muted-foreground">
          Bye week
        </div>
      );
    }

    return (
      <div
        className={cn(
          // The winner is marked by weight and a hairline, not by a green
          // wash. Two rows, one of them tinted, already reads as "this one" —
          // a full success tint on half of every card turned the schedule
          // into a field of green blocks and spent the success colour on a
          // fact that is not about success at all, just about which score is
          // higher.
          'flex items-center justify-between gap-3 px-3.5 py-3',
          isWinner && 'bg-foreground/[0.035]'
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {rank && (
            <span className="w-6 shrink-0 text-xs tabular text-muted-foreground">#{rank}</span>
          )}
          <TeamIdentity
            team={{
              ...team,
              name: team ? getMaskedTeamName(team, user, isAdmin, teamOwnerNames) : 'Unknown team',
              ownerName: team ? getMaskedOwnerName(team, user, isAdmin, teamOwnerNames) : null,
              wins: stats.wins,
              losses: stats.losses,
              ties: stats.ties,
            }}
            size="sm"
            showOwner
            showRecord={stats.gamesPlayed > 0}
            isViewer={isUserTeam(team, user)}
          />
        </div>

        {editing ? (
          <Input
            type="number"
            min="0"
            step="0.1"
            aria-label={`Score for ${team?.name || 'team'}`}
            value={teamId === game.team1Id ? scores.team1Score : scores.team2Score}
            onChange={(e) =>
              setScores((prev) => ({
                ...prev,
                [teamId === game.team1Id ? 'team1Score' : 'team2Score']: e.target.value,
              }))
            }
            className="w-20 text-center"
            placeholder="0"
          />
        ) : (
          <span
            className={cn(
              'font-display text-[21px] leading-none tabular tracking-[-0.01em]',
              isWinner ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
            )}
          >
            {score !== null && score !== undefined ? formatPoints(score) : '—'}
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card',
        'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]',
        highlightClasses
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Week {game.week}
          </span>
          {game.isCompleted && game.isBlowout && <Badge variant="warning">Blowout</Badge>}
          {game.isCompleted && game.isClose && <Badge variant="info">Close</Badge>}
          {!game.isCompleted && <Badge variant="secondary">Scheduled</Badge>}
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave}>
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit scores for week ${game.week}`}
                  onClick={() => {
                    setScores({
                      team1Score: game.team1Score ?? '',
                      team2Score: game.team2Score ?? '',
                    });
                    setEditing(true);
                  }}
                >
                  <Edit3 className="h-4 w-4" aria-hidden="true" />
                </Button>
                {/* Deletion has no implementation; the shell passes null and
                    the button stays hidden rather than raising an alert. */}
                {onDeleteGame && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete week ${game.week} game`}
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="divide-y">
        <TeamRow
          teamId={game.team1Id}
          score={game.team1Score}
          isWinner={game.isCompleted && game.winnerTeamId === game.team1Id}
        />
        <TeamRow
          teamId={game.team2Id}
          score={game.team2Score}
          isWinner={game.isCompleted && game.winnerTeamId === game.team2Id}
          isByeSlot={isBye}
        />
      </div>

      {!isBye && hasRosters && (
        <div className="border-t border-border/60">
          <button
            type="button"
            aria-expanded={isLineupOpen}
            onClick={onToggleLineup}
            className="flex min-h-10 w-full cursor-pointer items-center justify-center gap-1.5 px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', isLineupOpen && 'rotate-180')}
              aria-hidden="true"
            />
            {isLineupOpen ? 'Hide lineups' : 'Lineups'}
          </button>

          {/* Rendered only while open, so a week of fixtures does not carry
              fourteen squad lists in the DOM. */}
          {isLineupOpen && (
            <LineupPanel
              seasonId={seasonId}
              nflSeasonYear={nflSeasonYear}
              week={game.week}
              actualWeek={actualWeek}
              sides={[
                {
                  teamId: game.team1Id,
                  teamName: team1 ? getMaskedTeamName(team1, user, isAdmin, teamOwnerNames) : ''
                },
                {
                  teamId: game.team2Id,
                  teamName: team2 ? getMaskedTeamName(team2, user, isAdmin, teamOwnerNames) : ''
                }
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
};

/**
 * The lineups behind one matchup.
 *
 * Mounted only while the disclosure is open, which is what makes its queries
 * lazy — there is no `enabled` latch to maintain, and TanStack's cache means
 * closing and reopening does not refetch.
 *
 * **Which table it reads is decided by the week, not by convenience.** A week
 * that is over is a past-tense question — who actually started, and what they
 * actually scored — and that is `player_week_stats`, the historical fact table
 * the cron writes once. A week that has not finished is a present-tense
 * question, and `player_week_stats` cannot answer one: between two syncs it
 * describes a roster that has since taken waivers and changed its lineup, which
 * on 2026-08-31 made it name 122 of 125 starters wrongly. That week reads the
 * live `rosters` snapshot instead, through `getCurrentLineupsForWeek`.
 *
 * Both hooks are called every render and gated by `enabled`, so exactly one
 * fetches and the hook order never changes.
 *
 * The card this replaces read the `rosters` prop — the whole league's roster
 * snapshot, with no points and no opponent, and with an `injuryStatus` the
 * query never selected, so the injury dot below could not fire. `rosters` now
 * survives only as the disclosure's "is there anything to open" gate.
 */
const LineupPanel = ({ seasonId, nflSeasonYear, week, actualWeek, sides = [] }) => {
  const isPastWeek = week < actualWeek;

  const past = useWeekPlayerStats(seasonId, week, { enabled: isPastWeek });
  const live = useCurrentLineups(seasonId, week, { enabled: !isPastWeek });

  // The NFL calendar, for the "vs BUF" / "@ KC" / "BYE" chips. One cache entry
  // per season, shared with every other chip on the page, and deliberately not
  // awaited: a lineup renders without its opponents rather than waiting on a
  // second query.
  const { data: opponents = {} } = useNflOpponentMap(nflSeasonYear, week);

  const { data: rowsByTeam, isLoading } = isPastWeek ? past : live;

  if (isLoading) return <LineupSkeleton />;

  const hasAnything = sides.some((side) => (rowsByTeam?.[side.teamId]?.length || 0) > 0);

  if (!hasAnything) {
    return (
      <div className="border-t border-border/60 p-3.5 text-xs text-muted-foreground">
        {/* Honest for a pre-2026 week: `player_week_stats` starts with the 2026
            season, so there is genuinely no lineup to show rather than a
            failure to load one. */}
        No lineup data for this week.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 border-t border-border/60 p-3.5 sm:grid-cols-2">
      {sides.map((side) => (
        <TeamLineup
          key={side.teamId}
          teamName={side.teamName}
          rows={rowsByTeam?.[side.teamId] ?? []}
          opponents={opponents}
        />
      ))}
    </div>
  );
};

/**
 * A skeleton rather than a spinner, because the shape *is* predictable here —
 * a lineup is a column of slot/name/points rows, and reserving it means the
 * card does not resize under the reader when the rows land.
 */
const LineupSkeleton = () => (
  <div
    role="status"
    aria-label="Loading lineups"
    className="grid grid-cols-1 gap-5 border-t border-border/60 p-3.5 sm:grid-cols-2"
  >
    {[0, 1].map((column) => (
      <div key={column} className="space-y-2" aria-hidden="true">
        <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
        {Array.from({ length: 7 }, (_, row) => (
          <div key={row} className="flex items-center gap-2">
            <div className="h-4 w-10 shrink-0 animate-pulse rounded bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-3 w-10 shrink-0 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    ))}
    <span className="sr-only">Loading lineups</span>
  </div>
);

/**
 * One team's lineup, grouped by slot. Starters in lineup order, then bench,
 * then IR — the order the manager set it in, so the two columns read as the
 * same lineup side by side.
 */
const TeamLineup = ({ teamName, rows, opponents }) => {
  if (!rows || rows.length === 0) {
    return (
      <div className="space-y-3">
        {teamName && <h4 className="truncate text-sm font-semibold">{teamName}</h4>}
        <div className="text-xs text-muted-foreground">No lineup for this team.</div>
      </div>
    );
  }

  const grouped = rows.reduce((acc, row) => {
    const slot = row.rosterSlot || 'BE';
    (acc[slot] ||= []).push(row);
    return acc;
  }, {});

  const starters = STARTER_SLOTS.flatMap((slot) => grouped[slot] || []);
  const bench = grouped.BE || [];
  const injured = grouped.IR || [];

  const group = (label, players, tone) =>
    players.length > 0 && (
      <div className="space-y-1">
        <h5 className={cn('text-[11px] font-semibold uppercase tracking-wide', tone)}>{label}</h5>
        {players.map((row, idx) => (
          <PlayerRow
            key={row.id ?? `${label}-${idx}`}
            row={row}
            opponent={opponents[row.proTeamId]}
            muted={label !== 'Starters'}
          />
        ))}
      </div>
    );

  return (
    <div className="space-y-3">
      {teamName && <h4 className="truncate text-sm font-semibold">{teamName}</h4>}
      {group('Starters', starters, 'text-muted-foreground')}
      {group('Bench', bench, 'text-muted-foreground')}
      {group('Injured reserve', injured, 'text-destructive')}
    </div>
  );
};

const PlayerRow = ({ row, opponent, muted }) => {
  const playerName = row.player?.name || row.playerName || 'Unknown';
  const position = row.position || row.player?.position || '?';
  const isInjured = row.injuryStatus && row.injuryStatus !== 'ACTIVE';

  return (
    <div className={cn('flex items-center gap-2 text-xs', muted && 'text-muted-foreground')}>
      <span
        className={cn(
          'w-10 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold',
          getPositionColor(position)
        )}
      >
        {position}
      </span>
      <span className="min-w-0 flex-1 truncate">{playerName}</span>
      {isInjured && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
          title={row.injuryStatus}
          aria-label={row.injuryStatus}
        />
      )}
      {/* Fixed width whether or not the chip renders — an unknown opponent is
          nothing at all, and the points must still line up down the column. */}
      <span className="w-12 shrink-0 text-right">
        <OpponentChip entry={opponent} warnOnBye />
      </span>
      <PlayerPoints
        actualPoints={row.actualPoints}
        projectedPoints={row.projectedPoints}
        className="w-[4.25rem] shrink-0 text-right"
      />
    </div>
  );
};

export default ScheduleManager;
