import React from 'react';
import { Edit3, Trophy } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ResponsiveDataTable } from '../ui/responsive-table';
import { Card, CardContent } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { SkeletonTable } from '../ui/skeleton';
import { NumberText, RecordText } from '../ui/number-text';
import { RankBadge } from '../ui/rank-badge';
import { StreakChip } from '../ui/streak-chip';
import { TeamIdentity } from '../ui/team-identity';
import { isUserTeam, getUserTeamHighlightClasses } from '../../utils/userTeamUtils';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { POWER_RANKING_WEIGHTS, POWER_RANKING_COMPONENT_META } from '../../../types/index.js';

/**
 * The components, in weight order, built from the weights themselves.
 *
 * This list used to be written out by hand here, and it named six components
 * with percentages ("Performance Score 25%", "Team Strength 20%") that matched
 * neither `POWER_RANKING_WEIGHTS` nor the literals the calculator actually
 * used — three different sets of numbers, one of them shown to the user.
 * Deriving it means the legend cannot drift from the algorithm again.
 */
const RANKING_COMPONENTS = Object.entries(POWER_RANKING_WEIGHTS)
  .sort(([, a], [, b]) => b - a)
  .map(([key, weight]) => ({
    key,
    weight,
    weightLabel: `${Math.round(weight * 100)}%`,
    ...POWER_RANKING_COMPONENT_META[key]
  }));

const PowerRankingsTable = ({
  rankings = [],
  onEditTeam,
  showAdvanced = false,
  currentWeek = 1,
  loading = false,
  initializing = false,
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  /**
   * Recent form, as a status word rather than a signed number.
   *
   * The column used to print `+3.47` in one of five independently-scaled
   * colours, next to five other independently-scaled red/green signals in the
   * same row. The number is a z-score-ish quantity with no natural unit, so
   * the two decimals were noise; what a reader wants from it is the direction.
   */
  const formBadge = (form) => {
    const value = Number(form) || 0;
    if (value >= 5) return { variant: 'success', label: 'Hot' };
    if (value >= 2) return { variant: 'info', label: 'Rising' };
    if (value >= -2) return { variant: 'secondary', label: 'Steady' };
    if (value >= -5) return { variant: 'warning', label: 'Cooling' };
    return { variant: 'destructive', label: 'Cold' };
  };

  // This used to `return null`, on the reasoning that the app shell's
  // full-screen overlay was showing the loading state. That overlay is gone —
  // it blocked the entire page on every mutation — so the table now owns its
  // own loading state. Returning null here rendered a blank main screen for as
  // long as anything upstream was in flight.
  if (initializing || loading) {
    return <SkeletonTable rows={10} columns={showAdvanced ? 8 : 6} />;
  }

  if (!rankings.length) {
    return (
      <Card>
        <EmptyState
          icon={Trophy}
          title="No rankings yet"
          description={`Week ${currentWeek} needs teams and at least one completed game before it can be ranked.`}
        />
      </Card>
    );
  }


  /*
   * One column list, two layouts — see ui/responsive-table.jsx.
   *
   * This was eleven `<TableHead>`s and a matching pile of `<TableCell>`s. At
   * 375px it forced the document 132px wider than the viewport (the Playwright
   * smoke job measures exactly this), and scrolling it sideways is useless
   * anyway: the team name leaves the screen before the numbers arrive, so
   * every cell becomes an unlabelled figure.
   *
   * `priority` is the whole design decision. Rank, team and the power rating
   * are what the page is *for*, so they are the card header. The traditional
   * stats are what people scan, so they are a two-column grid. The advanced
   * stats are a deliberate opt-in even on desktop, so they fold away.
   */
  const columns = [
    {
      key: 'rank',
      header: 'Rank',
      priority: 'primary',
      headerClassName: 'w-[88px]',
      cell: (team, index) => <RankBadge rank={index + 1} delta={team.rankChange} />,
    },
    {
      key: 'team',
      header: 'Team',
      priority: 'primary',
      cell: (team) => (
        <TeamIdentity
          team={{
            ...team,
            name: getMaskedTeamName(team, user, isAdmin, teamOwnerNames),
            ownerName: getMaskedOwnerName(team, user, isAdmin, teamOwnerNames),
          }}
          showOwner={Boolean(team.owner)}
          isViewer={isUserTeam(team, user)}
        />
      ),
    },
    {
      key: 'powerRating',
      header: 'Rating',
      priority: 'primary',
      className: 'text-right',
      headerClassName: 'text-right',
      // The number this page exists to show. Everything else in the row is
      // supporting evidence, so the rating is the only value set at display
      // size — hierarchy comes from one thing being bigger, not from six
      // things being bold.
      cell: (team) => (
        <NumberText value={team.powerRating} display className="text-[22px] leading-none" />
      ),
    },
    {
      key: 'record',
      header: 'Record',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => (
        <RecordText wins={team.wins} losses={team.losses} ties={team.ties} className="font-medium" />
      ),
    },
    {
      key: 'winPct',
      header: 'Win%',
      className: 'text-center',
      headerClassName: 'text-center',
      // Not colour-coded. It is the record expressed as a percentage, and the
      // record is right beside it — a second red/green scale for the same
      // fact is what made a single row carry six of them.
      cell: (team) => (
        <NumberText value={(team.winPercentage || 0) * 100} variant="percent" className="text-muted-foreground" />
      ),
    },
    {
      key: 'pointsFor',
      header: 'PF',
      cardLabel: 'Points for',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (team) => <NumberText value={team.pointsFor} className="text-muted-foreground" />,
    },
    {
      key: 'pointsAgainst',
      header: 'PA',
      cardLabel: 'Points against',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (team) => <NumberText value={team.pointsAgainst} className="text-muted-foreground" />,
    },
    {
      key: 'pointDiff',
      header: 'Diff',
      cardLabel: 'Point diff',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (team) => (
        <NumberText value={team.pointDifferential} variant="delta" emphasis="signed" className="font-semibold" />
      ),
    },
    {
      key: 'luck',
      header: 'Luck',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (team) => (
        <NumberText
          value={(team.powerRatingComponents?.luckPercentage || 0) * 100}
          variant="signedPercent"
          emphasis="signed"
        />
      ),
    },
    {
      key: 'streak',
      header: 'Streak',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => <StreakChip streak={team.currentStreak} />,
    },
    ...(showAdvanced ? [
      {
        key: 'playoffOdds',
        header: 'Playoff odds',
        priority: 'detail',
        className: 'text-right',
        headerClassName: 'text-right',
        cell: (team) => {
          const odds = Number(team.playoffOdds) || 0;
          return (
            <div className="ml-auto min-w-[4.5rem] space-y-1">
              <NumberText value={odds} variant="percent" decimals={0} className="font-semibold" />
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    odds >= 80
                      ? 'h-full rounded-full bg-success'
                      : odds >= 40
                        ? 'h-full rounded-full bg-info'
                        : 'h-full rounded-full bg-muted-foreground/50'
                  }
                  style={{ width: `${Math.min(100, odds)}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        key: 'form',
        header: 'Form',
        priority: 'detail',
        className: 'text-center',
        headerClassName: 'text-center',
        cell: (team) => {
          const form = formBadge(team.recentForm);
          return <Badge variant={form.variant}>{form.label}</Badge>;
        },
      },
      {
        key: 'quality',
        header: 'QW / BL',
        cardLabel: 'Quality wins / bad losses',
        priority: 'detail',
        className: 'text-center',
        headerClassName: 'text-center',
        cell: (team) => (
          <span className="tabular text-sm">
            <span className="text-success">{team.qualityWins || 0}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-destructive">{team.badLosses || 0}</span>
          </span>
        ),
      },
    ] : []),
    ...(onEditTeam ? [
      {
        key: 'actions',
        header: 'Actions',
        cardLabel: 'Edit',
        className: 'text-center',
        headerClassName: 'text-center',
        cell: (team) => (
          <Button onClick={() => onEditTeam(team)} variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Edit3 className="h-4 w-4" />
          </Button>
        ),
      },
    ] : []),
  ];

  return (
    <div className="space-y-4">
      <ResponsiveDataTable
        columns={columns}
        data={rankings}
        rowKey={(team, i) => team.teamId || team.id || i}
        rowClassName={(team) => getUserTeamHighlightClasses(isUserTeam(team, user))}
      />

      {showAdvanced && (
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              How the rating is built
            </h4>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h5 className="mb-2 text-sm font-medium">Columns</h5>
                <dl className="space-y-1.5 text-sm">
                  {[
                    ['Luck', 'Wins above or below what all-play analysis expects'],
                    ['Playoff odds', 'Probability of finishing top 3 in the division'],
                    ['Form', 'Direction over the last four weeks'],
                    ['QW / BL', 'Quality wins and bad losses'],
                  ].map(([term, definition]) => (
                    <div key={term} className="flex gap-2">
                      <dt className="w-28 shrink-0 font-medium">{term}</dt>
                      <dd className="text-muted-foreground">{definition}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Algorithm components, straight from the weights themselves */}
              <div>
                <h5 className="mb-2 text-sm font-medium">Components</h5>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {RANKING_COMPONENTS.map((component) => (
                    <div key={component.key}>
                      <strong className="text-foreground">
                        {component.label} ({component.weightLabel}):
                      </strong>{' '}
                      {component.description}
                    </div>
                  ))}
                  <div className="pt-2">
                    Components are each scaled 0–100 across the league, then weighted. A
                    component with no data for the week shown — roster figures before the
                    2026 season, or any component in week 1 — is dropped and the remaining
                    weights are rescaled, rather than being counted as a zero.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PowerRankingsTable;