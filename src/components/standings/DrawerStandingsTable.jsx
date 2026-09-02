import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Edit2, Settings, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { ResponsiveDataTable } from '../ui/responsive-table';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { getMaskedTeamName, getMaskedOwnerName, getMaskedDivisionName } from '../../utils/displayNameUtils';
import { computeSeeds, teamIdOf, usesSeededPlayoffs } from '../../../utils/playoffSeeding.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';

/**
 * What the row tints mean, above the first division. Only seeded seasons
 * (2026+) render it: before that a green row meant "top three in the
 * division" and there was nothing else to tell apart.
 */
const QualifierKey = () => (
  <dl className="flex items-center gap-4 px-1 text-xs text-muted-foreground" aria-label="Key">
    <div className="flex items-center gap-1.5">
      <dt className="h-3 w-3 shrink-0 rounded-sm bg-warning/40 ring-1 ring-inset ring-warning/60" aria-hidden="true" />
      <dd>Bye</dd>
    </div>
    <div className="flex items-center gap-1.5">
      <dt className="h-3 w-3 shrink-0 rounded-sm bg-success/40 ring-1 ring-inset ring-success/60" aria-hidden="true" />
      <dd>Wild card</dd>
    </div>
  </dl>
);

const DrawerStandingsTable = ({
  teams = [],
  divisions = [],
  standings = { divisions: [], unassigned: [] },
  currentWeek,
  // The season's year, passed down rather than read from `getSeasonConfig()`:
  // qualification changed in 2026 and this table renders past seasons too.
  seasonYear = null,
  loading = false,
  isAuthenticated = false,
  onDivisionRename,
  onTeamDivisionChange,
  onCreateDivision,
  onDivisionDelete,
  onClose,
  games = [], // Add games data for streak calculation fallback
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  // The drawer's season picker, rendered in the header's control cluster
  // beside Manage. Owned by the drawer, because which seasons exist and which
  // one is being edited are its state, not the table's.
  seasonPicker = null
}) => {
  const [isManaging, setIsManaging] = useState(false);
  const [newDivisionName, setNewDivisionName] = useState('');
  // One draft per division. This used to share `newDivisionName` with the
  // create dialog and with every other division's rename dialog, so opening a
  // rename prefilled the create box — and the last dialog opened decided what
  // any of them submitted.
  const [renameDrafts, setRenameDrafts] = useState({});

  const seeded = usesSeededPlayoffs(seasonYear);

  // The client-side half of the qualification rule, for the fallback path
  // below. The RPC already returns seeds; this covers the case where it has
  // not answered yet and the table is rendering from `teams` alone.
  const fallbackSeeds = useMemo(
    () => (seeded ? computeSeeds(teams) : null),
    [seeded, teams]
  );

  const seedFieldsFor = (team, indexInDivision) => {
    if (!seeded) {
      // Through 2025: top three of each division, no seeds.
      return { playoffSeed: null, isBye: false, isWildcard: false, isPlayoffSpot: indexInDivision < 3 };
    }

    const info = fallbackSeeds?.get(teamIdOf(team));
    return {
      playoffSeed: info?.seed ?? null,
      isBye: Boolean(info?.isBye),
      isWildcard: Boolean(info?.isWildcard),
      isPlayoffSpot: info?.seed != null
    };
  };

  // Calculate standings data
  const calculateStandings = () => {
    // If we have standings from the database, use those
    if (standings && (standings.divisions?.length > 0 || standings.unassigned?.length > 0)) {
      // Merge the standings with division info
      const divisionStandings = divisions.map(division => {
        const standingDivision = standings.divisions.find(d => d.divisionId === division.id);
        return {
          ...division,
          teams: standingDivision?.teams || [],
          hasTeams: (standingDivision?.teams?.length || 0) > 0
        };
      });

      return {
        divisions: divisionStandings,
        unassigned: standings.unassigned || []
      };
    }

    // Fallback: calculate from teams data if no pre-calculated standings
    if (!teams || teams.length === 0) return { divisions: [], unassigned: [] };

    // Group teams by division
    const groupedTeams = teams.reduce((acc, team) => {
      const divisionId = team.divisionId || team.division_id || 'unassigned';
      if (!acc[divisionId]) {
        acc[divisionId] = [];
      }
      acc[divisionId].push(team);
      return acc;
    }, {});

    // Sort teams within each division by win percentage, then points for, then points against
    Object.keys(groupedTeams).forEach(divisionId => {
      groupedTeams[divisionId].sort((a, b) => {
        const aWinPct = a.winPercentage || a.win_percentage || 0;
        const bWinPct = b.winPercentage || b.win_percentage || 0;
        if (aWinPct !== bWinPct) {
          return bWinPct - aWinPct;
        }

        const aPointsFor = a.pointsFor || a.points_for || 0;
        const bPointsFor = b.pointsFor || b.points_for || 0;
        if (aPointsFor !== bPointsFor) {
          return bPointsFor - aPointsFor;
        }

        const aPointsAgainst = a.pointsAgainst || a.points_against || 0;
        const bPointsAgainst = b.pointsAgainst || b.points_against || 0;
        return aPointsAgainst - bPointsAgainst;
      });
    });

    // Create division standings with rank and playoff status
    const divisionStandings = divisions.map(division => {
      const divisionTeams = groupedTeams[division.id] || [];
      const teamsWithRank = divisionTeams.map((team, index) => ({
        ...team,
        wins: team.wins || 0,
        losses: team.losses || 0,
        ties: team.ties || 0,
        pointsFor: parseFloat(team.pointsFor || team.points_for || 0),
        pointsAgainst: parseFloat(team.pointsAgainst || team.points_against || 0),
        pointDifferential: parseFloat(team.pointDifferential || team.point_differential || 0),
        winPercentage: parseFloat(team.winPercentage || team.win_percentage || 0),
        calculatedWinPct: team.wins + team.losses + team.ties > 0
          ? team.wins / (team.wins + team.losses + team.ties)
          : 0,
        divisionRank: index + 1,
        ...seedFieldsFor(team, index),
        currentStreak: (() => {
          const dbStreak = team.currentStreak || team.current_streak;
          const teamId = team.id || team.teamId;
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Streak Debug] Team ${team.name} (${teamId}):`, {
              dbStreak,
              hasDbStreak: dbStreak && dbStreak.type !== 'none' && dbStreak.length > 0,
              gamesCount: games?.length || 0,
              team: { id: team.id, teamId: team.teamId, name: team.name }
            });
          }
          
          if (dbStreak && dbStreak.type !== 'none' && dbStreak.length > 0) {
            return dbStreak;
          }
          // Fallback to calculate from games if database doesn't have it
          const calculatedStreak = calculateStreakFromGames(teamId, games);
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Streak Debug] Calculated streak for ${team.name}:`, calculatedStreak);
          }
          
          return calculatedStreak;
        })()
      }));

      return {
        ...division,
        teams: teamsWithRank,
        hasTeams: teamsWithRank.length > 0
      };
    });

    // Handle unassigned teams
    const unassignedTeams = (groupedTeams.unassigned || []).map((team, index) => ({
      ...team,
      wins: team.wins || 0,
      losses: team.losses || 0,
      ties: team.ties || 0,
      pointsFor: parseFloat(team.pointsFor || team.points_for || 0),
      pointsAgainst: parseFloat(team.pointsAgainst || team.points_against || 0),
      pointDifferential: parseFloat(team.pointDifferential || team.point_differential || 0),
      winPercentage: parseFloat(team.winPercentage || team.win_percentage || 0),
      calculatedWinPct: team.wins + team.losses + team.ties > 0
        ? team.wins / (team.wins + team.losses + team.ties)
        : 0,
      divisionRank: index + 1,
      // An unassigned team has no division place to earn, but from 2026 a
      // wildcard is league-wide — so it can still hold a seed.
      ...seedFieldsFor(team, Number.POSITIVE_INFINITY),
      currentStreak: (() => {
        const dbStreak = team.currentStreak || team.current_streak;
        const teamId = team.id || team.teamId;
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Streak Debug] Unassigned Team ${team.name} (${teamId}):`, {
            dbStreak,
            hasDbStreak: dbStreak && dbStreak.type !== 'none' && dbStreak.length > 0,
            gamesCount: games?.length || 0
          });
        }
        
        if (dbStreak && dbStreak.type !== 'none' && dbStreak.length > 0) {
          return dbStreak;
        }
        // Fallback to calculate from games if database doesn't have it
        const calculatedStreak = calculateStreakFromGames(teamId, games);
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Streak Debug] Calculated streak for unassigned ${team.name}:`, calculatedStreak);
        }
        
        return calculatedStreak;
      })()
    }));

    return {
      divisions: divisionStandings,
      unassigned: unassignedTeams
    };
  };

  /*
   * The qualifier tint. `bg-green-50 dark:bg-green-900/20` only rendered here
   * because the remap block at the end of globals.css catches those exact
   * selectors; `bg-success` is the token that actually means this.
   *
   * From 2026 the tint is the whole marker: a bye row is yellow and a
   * wild-card row is green, and the key above the first division says which
   * is which. The rows used to carry "Bye" and "WC" chips as well, which put
   * a third badge beside the seed on a name that was already truncating. The
   * words survive for screen readers only, in the team cell.
   */
  const qualifierTint = (team) => {
    if (seeded && team.isBye) return 'bg-warning/15';
    return team.isPlayoffSpot ? 'bg-success/10' : '';
  };

  const getStreakDisplay = (streak) => {
    if (!streak || streak.type === 'none') return '-';
    const prefix = streak.type === 'win' ? 'W' : streak.type === 'loss' ? 'L' : 'T';
    return `${prefix}${streak.length}`;
  };

  const getStreakVariant = (streak) => {
    if (streak?.type === 'win') return 'default';
    if (streak?.type === 'loss') return 'destructive';
    return 'secondary';
  };

  // Fallback function to calculate streak from games data if not in database
  const calculateStreakFromGames = (teamId, gamesData) => {
    if (!gamesData || gamesData.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Streak Calc] No games data for team ${teamId}`);
      }
      return { type: 'none', length: 0 };
    }
    
    // Debug: log that we're calculating streaks from games
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Streak Calc] Calculating streak for team ${teamId}`, { 
        gamesCount: gamesData.length,
        sampleGame: gamesData[0]
      });
      
      // Show completion stats for all games
      const completedGamesCount = gamesData.filter(g => 
        g.isCompleted || g.is_completed || 
        (g.team1_score !== null && g.team1_score !== undefined && 
         g.team2_score !== null && g.team2_score !== undefined)
      ).length;
      console.log(`[Streak Calc] Games completion status: ${completedGamesCount}/${gamesData.length} games completed`);
    }

    // Filter completed games for this team and sort by week descending
    let debugLogged = false;
    const teamGames = gamesData
      .filter(game => {
        const isTeamInGame = (
          game.team1Id === teamId || game.team2Id === teamId || 
          game.team1_id === teamId || game.team2_id === teamId
        );
        const isCompleted = game.isCompleted || game.is_completed || 
          (game.team1_score !== null && game.team1_score !== undefined && 
           game.team2_score !== null && game.team2_score !== undefined);
        
        // Removed excessive debug logging - issue was field name mismatch
        
        return isTeamInGame && isCompleted;
      })
      .sort((a, b) => (b.week || 0) - (a.week || 0));

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Streak Calc] Team ${teamId} - Found ${teamGames.length} completed games out of ${gamesData.length} total games`);
      if (teamGames.length > 0) {
        console.log(`[Streak Calc] Sample team game:`, teamGames[0]);
      } else {
        // Debug: show why no games were found
        const teamGamesDebug = gamesData.filter(game => {
          const isTeamInGame = (
            game.team1Id === teamId || game.team2Id === teamId || 
            game.team1_id === teamId || game.team2_id === teamId
          );
          return isTeamInGame;
        });
        console.log(`[Streak Calc] Team ${teamId} appears in ${teamGamesDebug.length} games (but none completed)`);
        if (teamGamesDebug.length > 0) {
          console.log(`[Streak Calc] Sample uncompleted team game:`, teamGamesDebug[0]);
        }
      }
    }

    if (teamGames.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Streak Calc] No completed games found for team ${teamId}`);
      }
      return { type: 'none', length: 0 };
    }

    // Get the most recent game result
    const latestGame = teamGames[0];
    const isTeam1 = latestGame.team1Id === teamId || latestGame.team1_id === teamId;
    const team1Score = parseFloat(latestGame.team1_score || 0);
    const team2Score = parseFloat(latestGame.team2_score || 0);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Streak Calc] Latest game for team ${teamId}:`, {
        isTeam1,
        team1Score,
        team2Score,
        gameWeek: latestGame.week
      });
    }
    
    let latestResult;
    if (team1Score === team2Score) {
      latestResult = 'tie';
    } else if ((isTeam1 && team1Score > team2Score) || (!isTeam1 && team2Score > team1Score)) {
      latestResult = 'win';
    } else {
      latestResult = 'loss';
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Streak Calc] Latest result for team ${teamId}: ${latestResult}`);
    }

    if (latestResult === 'tie') return { type: 'tie', length: 1 };

    // Count consecutive games with the same result
    let streakLength = 1;
    for (let i = 1; i < teamGames.length; i++) {
      const game = teamGames[i];
      const gameIsTeam1 = game.team1Id === teamId || game.team1_id === teamId;
      const gameTeam1Score = parseFloat(game.team1_score || 0);
      const gameTeam2Score = parseFloat(game.team2_score || 0);
      
      let gameResult;
      if (gameTeam1Score === gameTeam2Score) {
        gameResult = 'tie';
      } else if ((gameIsTeam1 && gameTeam1Score > gameTeam2Score) || (!gameIsTeam1 && gameTeam2Score > gameTeam1Score)) {
        gameResult = 'win';
      } else {
        gameResult = 'loss';
      }

      if (gameResult === latestResult) {
        streakLength++;
      } else {
        break;
      }
    }

    const finalStreak = { type: latestResult, length: streakLength };
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Streak Calc] Final streak for team ${teamId}:`, finalStreak);
    }

    return finalStreak;
  };

  const renameDraftFor = (division) => renameDrafts[division.id] ?? division.name ?? '';

  const setRenameDraft = (divisionId, value) =>
    setRenameDrafts((drafts) => ({ ...drafts, [divisionId]: value }));

  const clearRenameDraft = (divisionId) =>
    setRenameDrafts((drafts) => {
      const rest = { ...drafts };
      delete rest[divisionId];
      return rest;
    });

  const handleDivisionRename = async (divisionId, newName) => {
    if (onDivisionRename) {
      await onDivisionRename(divisionId, newName);
    }
    clearRenameDraft(divisionId);
  };

  const handleDivisionDelete = async (divisionId) => {
    if (onDivisionDelete) {
      await onDivisionDelete(divisionId);
    }
    clearRenameDraft(divisionId);
  };

  const handleTeamMove = async (teamId, newDivisionId) => {
    if (onTeamDivisionChange) {
      await onTeamDivisionChange(teamId, newDivisionId);
    }
  };

  const handleCreateDivision = async (divisionName) => {
    if (onCreateDivision && divisionName.trim()) {
      await onCreateDivision(divisionName.trim(), divisions.length + 1);
    }
  };



  const { divisions: divisionStandings, unassigned } = calculateStandings();

  /*
   * One team-column width for every table on the board.
   *
   * Each division is its own <table>, and an auto-layout table sizes its
   * columns from its own content — so the division with "U dont have 🌮🥒"
   * in it got a wide team column and a clipped DIFF, while the one next to
   * it wrapped its owner names into two lines to make room. Two tables that
   * disagree about where the owner column starts read as two different
   * reports. The fix is the one a spreadsheet would use: measure the longest
   * team cell across *all* the teams, and give every table that width with
   * `table-fixed`, so the numeric columns and the owner column line up too.
   *
   * Measured, not counted: a character count cannot price an emoji or a
   * wide glyph. The cells are rendered once more into a hidden block that
   * inherits the real font, and the widest sets `--standings-team-col`.
   * Re-measured when the names change (a season switch, a rename, the
   * masking toggling), and again once the webfont has loaded — before that,
   * the fallback face measures differently.
   *
   * The cap is what the owner column can spare. Under `table-fixed` the
   * owner column takes whatever the others leave, so an uncapped team column
   * would hand a novelty name the whole row and break "Gatamaneni" across
   * three lines. The longest single owner *word* is measured alongside the
   * team cells; owners may wrap at a space, never inside a name. The team
   * column grows to its longest name up to that limit and wraps past it —
   * at a space, exactly as the owner column does, never inside a word: the
   * floor is the longest single team word.
   */
  const boardRef = useRef(null);
  const measureRef = useRef(null);
  const [teamColWidth, setTeamColWidth] = useState(null);
  const allTeams = [...divisionStandings.flatMap((d) => d.teams), ...unassigned];
  const teamCells = allTeams.map((team) => ({
    key: team.id ?? team.teamId ?? team.name,
    name: getMaskedTeamName(team, user, isAdmin, teamOwnerNames),
  }));
  // The words of every team name, for the floor: the column may wrap a name
  // but never break a word.
  const teamWords = [
    ...new Set(teamCells.flatMap((cell) => String(cell.name ?? '').split(/\s+/))),
  ].filter(Boolean);
  const ownerWords = [
    ...new Set(
      allTeams.flatMap((team) =>
        String(getMaskedOwnerName(team, user, isAdmin, teamOwnerNames) ?? '').split(/\s+/)
      )
    ),
  ].filter(Boolean);
  // The effect keys on the rendered text, not the arrays: the standings are
  // rebuilt every render, and only a change in what the cells say matters.
  const nameKey = [...teamCells.map((c) => c.name), ...teamWords, ...ownerWords].join('|');

  useLayoutEffect(() => {
    const measurer = measureRef.current;
    const board = boardRef.current;
    if (!measurer || !board) return undefined;

    const measure = () => {
      const widest = (kind) =>
        Math.max(
          0,
          ...[...measurer.querySelectorAll(`[data-measure="${kind}"]`)].map(
            (el) => el.getBoundingClientRect().width
          )
        );
      const widestTeam = widest('team');
      // jsdom has no layout engine and reports 0: leave the column to itself.
      if (widestTeam === 0) return;

      const cellPadding = 24; // px-3 on both sides
      const wanted = Math.ceil(widestTeam) + cellPadding;

      // What the other columns leave. The fixed-width columns report their
      // class widths under `table-fixed` whatever their content, so they are
      // read from the first table rather than restated here as numbers.
      const table = board.querySelector('table');
      const tableWidth = table?.getBoundingClientRect().width ?? 0;
      const fixed = table
        ? [...table.querySelectorAll('thead th')]
            .filter((th) => !th.classList.contains('standings-fluid-col'))
            .reduce((sum, th) => sum + th.getBoundingClientRect().width, 0)
        : 0;
      const ownerMin = Math.ceil(widest('owner')) + cellPadding;
      const teamMin = Math.ceil(widest('team-word')) + cellPadding;
      const cap = Math.max(teamMin, Math.floor(tableWidth - fixed - ownerMin));

      setTeamColWidth(tableWidth > 0 ? Math.min(wanted, cap) : wanted);
    };

    measure();
    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) measure();
    });
    window.addEventListener('resize', measure);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
    };
  }, [nameKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Loading header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="h-5 w-20 bg-muted rounded animate-pulse"></div>
            <div className="h-4 w-12 bg-muted rounded animate-pulse"></div>
          </div>
          <div className="h-6 w-16 bg-muted rounded animate-pulse"></div>
        </div>
        
        {/* Loading divisions */}
        {[1, 2].map((i) => (
          <div key={i} className="space-y-2">
            {/* Division header loading */}
            <div className="flex items-center justify-between px-1">
              <div className="h-4 w-24 bg-muted rounded animate-pulse"></div>
              <div className="h-4 w-6 bg-muted rounded animate-pulse"></div>
            </div>
            
            {/* Table loading */}
            <div className="rounded-md border">
              <div className="p-2 border-b">
                <div className="flex gap-2">
                  <div className="h-3 w-8 bg-muted rounded animate-pulse"></div>
                  <div className="h-3 w-16 bg-muted rounded animate-pulse"></div>
                  <div className="h-3 w-12 bg-muted rounded animate-pulse"></div>
                  <div className="h-3 w-8 bg-muted rounded animate-pulse"></div>
                  <div className="h-3 w-8 bg-muted rounded animate-pulse"></div>
                  <div className="h-3 w-8 bg-muted rounded animate-pulse"></div>
                </div>
              </div>
              {[1, 2, 3].map((j) => (
                <div key={j} className="p-2 border-b last:border-b-0">
                  <div className="flex gap-2">
                    <div className="h-4 w-8 bg-muted rounded animate-pulse"></div>
                    <div className="h-4 w-16 bg-muted rounded animate-pulse"></div>
                    <div className="h-4 w-12 bg-muted rounded animate-pulse"></div>
                    <div className="h-4 w-8 bg-muted rounded animate-pulse"></div>
                    <div className="h-4 w-8 bg-muted rounded animate-pulse"></div>
                    <div className="h-4 w-8 bg-muted rounded animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  /*
   * One column list for both tables below (a division's teams, and the
   * unassigned ones), and for both layouts.
   *
   * These tables carried `min-w-[500px]` inside a drawer that is `w-[95%]` —
   * about 356px on an iPhone SE — so reading the standings meant scrolling
   * every row sideways past the team name to reach the numbers. Below sm: each team
   * is a card: rank, team and owner identify it, the record and point totals
   * are a labelled grid.
   *
   * `withRank` is false for the unassigned list, which has no division
   * standing to show.
   */
  const standingsColumns = ({ withRank, moveTargets, moveLabel }) => [
    ...(withRank
      ? [{
          key: 'rank',
          header: '#',
          priority: 'primary',
          headerClassName: 'w-12 px-3 py-2 text-sm',
          className: 'px-3 py-2 font-medium',
          cell: (team) => <span className="font-medium">{team.divisionRank}</span>,
        }]
      : []),
    {
      key: 'team',
      header: 'Team',
      priority: 'primary',
      // The width is the measured one, shared by every table on the board;
      // see `useLayoutEffect` above. Unset (before the first measurement, or
      // in jsdom) it resolves to auto.
      // `standings-fluid-col` is a marker with no CSS, read by the measurer.
      headerClassName: 'standings-fluid-col w-(--standings-team-col) px-3 py-2 text-sm',
      className: 'px-3 py-2 font-medium',
      cell: (team) => (
        <div className="min-w-0">
          {/* Wraps at a space, as the owner column does; the measured column
              floor is the longest single word, so it never breaks inside one. */}
          <div className="min-w-0 font-medium">
            {getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}
            {team.isBye && <span className="sr-only">First-round bye</span>}
            {team.isWildcard && <span className="sr-only">Wild card</span>}
          </div>
          {/* The owner is its own column at sm:+; on a card it belongs under
              the team name rather than in the stats grid. */}
          <div className="truncate text-xs text-muted-foreground sm:hidden">
            {getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)}
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      priority: 'detail',
      // The one column with no width: under `table-fixed` it takes what the
      // others leave, and the measurer above keeps that at least a word wide.
      headerClassName: 'standings-fluid-col px-3 py-2 text-sm',
      className: 'px-3 py-2 text-muted-foreground',
      cell: (team) => getMaskedOwnerName(team, user, isAdmin, teamOwnerNames),
    },
    {
      key: 'record',
      header: 'Record',
      headerClassName: 'w-20 px-2 py-2 text-center text-sm',
      className: 'px-2 py-2 text-center',
      cell: (team) => `${team.wins}-${team.losses}-${team.ties}`,
    },
    {
      key: 'winPct',
      header: 'Win %',
      // A hair wider than the other numeric columns: at w-16 the header's
      // "%" fell onto a second line and made this the tallest header cell.
      headerClassName: 'w-[4.5rem] whitespace-nowrap px-2 py-2 text-center text-sm',
      className: 'px-2 py-2 text-center',
      cell: (team) => `${((team.winPercentage || team.calculatedWinPct || 0) * 100).toFixed(1)}%`,
    },
    // The playoff seed is the number that decides who plays whom, so it is a
    // column of numbers rather than a chip on the name. Only seeded seasons
    // (2026+) have one; before that a division place was the whole story, so
    // the column is absent rather than a column of dashes.
    ...(seeded
      ? [{
          key: 'seed',
          header: 'Seed',
          headerClassName: 'w-14 px-2 py-2 text-center text-sm',
          className: 'px-2 py-2 text-center',
          cell: (team) =>
            team.playoffSeed != null ? (
              <span className="font-medium" title={`Playoff seed ${team.playoffSeed}`}>
                {team.playoffSeed}
              </span>
            ) : (
              <span className="text-muted-foreground" aria-label="No seed">—</span>
            ),
        }]
      : []),
    {
      key: 'pf',
      header: 'PF',
      cardLabel: 'Points for',
      headerClassName: 'w-16 px-2 py-2 text-center text-sm',
      className: 'px-2 py-2 text-center',
      cell: (team) => (team.pointsFor || 0).toFixed(2),
    },
    {
      key: 'pa',
      header: 'PA',
      cardLabel: 'Points against',
      headerClassName: 'w-16 px-2 py-2 text-center text-sm',
      className: 'px-2 py-2 text-center',
      cell: (team) => (team.pointsAgainst || 0).toFixed(2),
    },
    {
      key: 'diff',
      header: 'Diff',
      headerClassName: 'w-16 px-2 py-2 text-center text-sm',
      className: 'px-2 py-2 text-center',
      cell: (team) => (
        <span className={`font-medium ${team.pointDifferential >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {team.pointDifferential >= 0 ? '+' : ''}{(team.pointDifferential || 0).toFixed(1)}
        </span>
      ),
    },
    ...(isManaging
      ? [{
          key: 'move',
          header: moveLabel,
          headerClassName: 'w-20 px-2 py-2 text-center text-sm',
          className: 'px-2 py-2 text-center',
          cell: (team) => (
            <div className="flex flex-col gap-1">
              {moveTargets(team).map((targetDivision) => (
                <Button
                  key={targetDivision.id}
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 py-1 text-xs"
                  onClick={() => handleTeamMove(team.id, targetDivision.id)}
                >
                  → {targetDivision.name}
                </Button>
              ))}
            </div>
          ),
        }]
      : []),
  ];

  return (
    <div className="space-y-4">
      {/* Header with management controls and close button */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 px-1 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl tracking-tight text-foreground">Standings</h2>
          {currentWeek && (
            <Badge variant="outline" className="text-xs">
              Week {currentWeek}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {seasonPicker}
          {isAuthenticated && (
            <div className="flex items-center gap-1">
              {isManaging && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs px-2 py-1">
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Create New Division</AlertDialogTitle>
                      <AlertDialogDescription>
                        Enter a name for the new division.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                      <Label htmlFor="new-division-name">Division Name</Label>
                      <Input
                        id="new-division-name"
                        value={newDivisionName}
                        onChange={(e) => setNewDivisionName(e.target.value)}
                        placeholder="Enter division name"
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setNewDivisionName('')}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          handleCreateDivision(newDivisionName);
                          setNewDivisionName('');
                        }}
                        disabled={!newDivisionName.trim()}
                      >
                        Create
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                variant={isManaging ? "default" : "outline"}
                size="sm"
                className="text-xs px-2 py-1"
                onClick={() => setIsManaging(!isManaging)}
              >
                <Settings className="h-3 w-3 mr-1" />
                {isManaging ? 'Done' : 'Manage'}
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close standings drawer"
            className="h-8 w-8 text-muted-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Divisions stacked vertically */}
      <div
        ref={boardRef}
        className="relative space-y-4"
        style={teamColWidth ? { '--standings-team-col': `${teamColWidth}px` } : undefined}
      >
        {/* The measuring block: every team cell as the table renders it, in
            the table's own font, hidden and out of flow. */}
        <div
          ref={measureRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute left-0 top-0 h-0 overflow-hidden whitespace-nowrap text-sm"
        >
          {teamCells.map((cell) => (
            <div key={cell.key} data-measure="team" className="w-max font-medium">
              {cell.name}
            </div>
          ))}
          {teamWords.map((word) => (
            <div key={word} data-measure="team-word" className="w-max font-medium">
              {word}
            </div>
          ))}
          {ownerWords.map((word) => (
            <div key={word} data-measure="owner" className="w-max">
              {word}
            </div>
          ))}
        </div>
        {seeded && <QualifierKey />}
        {divisionStandings.map((division, divisionIndex) => (
          <div key={division.id} className="space-y-2">
            {/* Compact division header */}
            <div className="flex items-center gap-2 px-1">
              <h3 className="text-base font-semibold">{getMaskedDivisionName(division, divisionIndex, user, isAdmin, teamOwnerNames)}</h3>
              {isManaging && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      aria-label={`Rename ${division.name}`}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rename {getMaskedDivisionName(division, divisionIndex, user, isAdmin, teamOwnerNames)}</AlertDialogTitle>
                      <AlertDialogDescription>
                        Enter a new name for this division.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                      <Label htmlFor={`division-name-${division.id}`}>Division Name</Label>
                      <Input
                        id={`division-name-${division.id}`}
                        value={renameDraftFor(division)}
                        onChange={(e) => setRenameDraft(division.id, e.target.value)}
                        placeholder="Enter division name"
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => clearRenameDraft(division.id)}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDivisionRename(division.id, renameDraftFor(division).trim())}
                        disabled={!renameDraftFor(division).trim()}
                      >
                        Save
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {isManaging && onDivisionDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${division.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete {getMaskedDivisionName(division, divisionIndex, user, isAdmin, teamOwnerNames)}?
                      </AlertDialogTitle>
                      {/* `teams.division_id` is ON DELETE SET NULL, so its
                          members are not deleted — they land in Unassigned and
                          have to be moved somewhere by hand. */}
                      <AlertDialogDescription>
                        {division.teams.length > 0
                          ? `Its ${division.teams.length} team${division.teams.length === 1 ? '' : 's'} will become unassigned until you move them to another division.`
                          : 'This division has no teams.'}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDivisionDelete(division.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {/* Full table for drawer */}
            {division.teams.length > 0 ? (
              <div className="rounded-md border p-2 sm:p-0">
                <ResponsiveDataTable
                  columns={standingsColumns({
                    withRank: true,
                    moveLabel: 'Move',
                    moveTargets: () => divisionStandings.filter((d) => d.id !== division.id),
                  })}
                  data={division.teams}
                  tableClassName="table-fixed"
                  rowClassName={(team) =>
                    `text-sm transition-all duration-200 hover:bg-muted/50 ${qualifierTint(team)}`
                  }
                />
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-xs">
                No teams assigned
              </div>
            )}
          </div>
        ))}

        {/* Unassigned teams section */}
        {unassigned.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <h3 className="text-base font-semibold text-muted-foreground">Unassigned</h3>
            </div>
            <div className="rounded-md border p-2 sm:p-0">
              <ResponsiveDataTable
                columns={standingsColumns({
                  withRank: false,
                  moveLabel: 'Assign',
                  moveTargets: () => divisionStandings,
                })}
                data={unassigned}
                tableClassName="table-fixed"
                rowClassName={() => 'text-sm transition-all duration-200 hover:bg-muted/50'}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DrawerStandingsTable;