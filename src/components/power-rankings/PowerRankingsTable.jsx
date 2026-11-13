import React from 'react';
import { Edit3, Trophy } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ResponsiveDataTable } from '../ui/responsive-table';
import { Card, CardContent } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import RouteLoading from '../layout/RouteLoading';
import { NumberText, RecordText } from '../ui/number-text';
import { RankBadge } from '../ui/rank-badge';
import { StreakChip } from '../ui/streak-chip';
import { TeamAvatar } from '../ui/team-identity';
import { isUserTeam, getUserTeamHighlightClasses } from '../../utils/userTeamUtils';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import { faabOf, formatFaab } from '../../utils/format';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { POWER_RANKING_WEIGHTS, POWER_RANKING_COMPONENT_META } from '../../../types/index.js';
import { teamRosterPath } from '../teams/teamLink.js';
import { TeamIdentityLink, TeamLink } from '../ui/team-link';
import { OddsCell, RankCell } from './rankingCells';

/**
 * The phone's reading order. Rating, record and playoff odds fill the screen by
 * default; everything else is a swipe to the right.
 */
const SCROLL_ORDER = [
  'rank',
  'team',
  'powerRating',
  'record',
  'playoffOdds',
  'luck',
  'winPct',
  'pointsFor',
  'pointsAgainst',
  'pointDiff',
  'streak',
  'form',
  'quality',
  'projected',
  'nextMatchup',
  'faab',
  'owner',
];

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
  currentWeek = 1,
  loading = false,
  initializing = false,
  // FAAB left is a figure about today, so a past week has no such column.
  showFaab = true,
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

  // The same spinner every other route shows, rather than a table skeleton.
  //
  // A skeleton is defensible here — this really is a table, so the outline
  // could stand in for its shape — but it was the last place in the app still
  // doing it, so a page load flashed a different kind of placeholder depending
  // on which tab you opened. One loading state, everywhere.
  //
  // It was also drawing the skeleton's outlines in white: those rows used a
  // bare `border` utility, and Tailwind v4 leaves an uncoloured border at
  // `currentColor`, which on this near-white foreground is a white rule.
  if (initializing || loading) {
    return <RouteLoading />;
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


  const opponentOf = (team) => {
    const opponentId = team.powerRatingComponents?.nextOpponentTeamId ?? null;
    return opponentId != null ? rankings.find((r) => (r.teamId ?? r.id) === opponentId) ?? null : null;
  };

  /*
   * One column list, two layouts — see ui/responsive-table.jsx.
   *
   * This was eleven `<TableHead>`s and a matching pile of `<TableCell>`s. At
   * 375px it forced the document 132px wider than the viewport (the Playwright
   * smoke job measures exactly this).
   *
   * Below `md` it is the `scroll` layout, not cards. A power ranking is read
   * down the list, and a card apiece put one team and a third of the next on an
   * iPhone SE. Each team is one row now, so the whole league is on one screen,
   * with the rank pinned, and every other stat is a swipe away: there is no
   * advanced-stats toggle and no "More" disclosure. `SCROLL_ORDER` above is the
   * order they come in, and `scroll` on a column is what it gives up for the
   * narrower row: the owner line, the bar under the odds, the display-size
   * rating.
   */
  const columns = [
    {
      key: 'rank',
      header: 'Rank',
      priority: 'primary',
      headerClassName: 'w-[88px]',
      cell: (team, index) => <RankBadge rank={index + 1} delta={team.rankChange} />,
      scroll: {
        pin: true,
        width: 3.25,
        header: (
          <>
            <span className="sr-only">Rank</span>#
          </>
        ),
        cell: (team, index) => <RankCell rank={index + 1} delta={team.rankChange} />,
      },
    },
    {
      key: 'team',
      header: 'Team',
      priority: 'primary',
      // The name opens the team's profile, or for anyone who cannot open one,
      // its roster on the Teams tab, which scrolls the card into view from
      // `?team=`. A link rather than an `onRowClick`: a clickable row is a div
      // with a handler, unreachable by keyboard, and on a phone the whole card
      // would become one tap target.
      cell: (team) => (
        <TeamIdentityLink
          team={{
            ...team,
            name: getMaskedTeamName(team, user, isAdmin, teamOwnerNames),
            ownerName: getMaskedOwnerName(team, user, isAdmin, teamOwnerNames),
          }}
          fallbackTo={teamRosterPath(team.teamId ?? team.id)}
          showOwner={Boolean(team.owner)}
          isViewer={isUserTeam(team, user)}
        />
      ),
      scroll: {
        // Twelve letters of name (`ch` is a digit, and letters run narrower),
        // which the mark gives way to on a narrow row.
        fluid: '11ch + 0.75rem',
        cell: (team) => {
          const name = getMaskedTeamName(team, user, isAdmin, teamOwnerNames);
          return (
            <TeamLink
              team={team}
              fallbackTo={teamRosterPath(team.teamId ?? team.id)}
              title={name}
              className="flex min-w-0 items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <TeamAvatar team={team} size="xs" className="hidden @md:inline-flex" />
              <span className="truncate text-sm font-medium">{name}</span>
              {isUserTeam(team, user) && <span className="sr-only">(your team)</span>}
            </TeamLink>
          );
        },
      },
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
      scroll: {
        shown: true,
        width: 3,
        header: 'Rtg',
        title: 'Power rating',
        className: 'text-right',
        cell: (team) => <NumberText value={team.powerRating} className="text-sm font-semibold" />,
      },
    },
    {
      key: 'record',
      header: 'Record',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => (
        <RecordText wins={team.wins} losses={team.losses} ties={team.ties} className="font-medium" />
      ),
      scroll: { shown: true, width: 3.25, header: 'W-L', title: 'Record', className: 'text-center' },
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
      scroll: { width: 3.75, className: 'text-right' },
    },
    {
      key: 'pointsFor',
      header: 'PF',
      cardLabel: 'Points for',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (team) => <NumberText value={team.pointsFor} className="text-muted-foreground" />,
      scroll: { width: 4.25, title: 'Points for', className: 'text-right' },
    },
    {
      key: 'pointsAgainst',
      header: 'PA',
      cardLabel: 'Points against',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (team) => <NumberText value={team.pointsAgainst} className="text-muted-foreground" />,
      scroll: { width: 4.25, title: 'Points against', className: 'text-right' },
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
      scroll: { width: 4.25, title: 'Point differential', className: 'text-right' },
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
      scroll: { width: 3.75, className: 'text-right' },
    },
    {
      key: 'streak',
      header: 'Streak',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => <StreakChip streak={team.currentStreak} />,
      scroll: { width: 3.75, className: 'text-center' },
    },
    {
      key: 'playoffOdds',
      header: 'Playoff odds',
      className: 'text-right',
      headerClassName: 'text-right',
      // The figure is `OddsCell`, the phone's: 100 and 0 are the calculator's
      // clinched and eliminated, and nothing else reads either, so they are
      // words here too. The bar stays a share.
      cell: (team) => {
        const odds = Number(team.playoffOdds) || 0;
        return (
          <div className="ml-auto min-w-[4.5rem] space-y-1">
            <div className="font-semibold">
              <OddsCell odds={team.playoffOdds} />
            </div>
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
      scroll: {
        shown: true,
        width: 4.25,
        header: 'Playoff%',
        title: 'Playoff odds',
        className: 'text-right',
        cell: (team) => <OddsCell odds={team.playoffOdds} />,
      },
    },
    // Not a column of dashes before the first sync has read a budget.
    ...(showFaab && rankings.some((team) => faabOf(team) != null)
      ? [{
          key: 'faab',
          header: 'FAAB',
          cardLabel: 'FAAB left',
          className: 'text-right',
          headerClassName: 'text-right',
          cell: (team) => <span className="tabular text-muted-foreground">{formatFaab(faabOf(team))}</span>,
          scroll: { width: 3.5, title: 'FAAB left', className: 'text-right' },
        }]
      : []),
    {
      key: 'form',
      header: 'Form',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => {
        const form = formBadge(team.recentForm);
        return <Badge variant={form.variant}>{form.label}</Badge>;
      },
      scroll: { width: 4.75, className: 'text-center' },
    },
    {
      key: 'quality',
      header: 'QW / BL',
      cardLabel: 'Quality wins / bad losses',
      className: 'text-center',
      // Wide enough that "QW / BL" stays on one line; at the auto width the
      // header broke after every word.
      headerClassName: 'text-center min-w-[92px]',
      cell: (team) => (
        <span className="tabular text-sm">
          <span className="text-success">{team.qualityWins || 0}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-destructive">{team.badLosses || 0}</span>
        </span>
      ),
      scroll: { width: 4.5, title: 'Quality wins / bad losses', className: 'text-center' },
    },
    {
      key: 'projected',
      header: 'Proj',
      cardLabel: 'Projected total',
      className: 'text-right',
      headerClassName: 'text-right',
      // This team's own projected starter total for the week, so the Next
      // column's opponent figure has something to be read against. Null is
      // the em dash — a historical view, or no resolvable starters — never 0.
      cell: (team) => (
        <NumberText
          value={team.powerRatingComponents?.projectedStarterTotal}
          className="font-medium"
        />
      ),
      scroll: { width: 3.75, title: 'Projected total', className: 'text-right' },
    },
    {
      key: 'nextMatchup',
      header: 'Next',
      cardLabel: 'Next matchup',
      cardClassName: 'col-span-2',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (team) => {
        const opponent = opponentOf(team);
        if (!opponent) return <span className="text-muted-foreground">—</span>;

        // Wraps rather than widening the table: a long opponent name used to
        // be the widest cell in the row and pushed every column apart. The
        // projection stays glued to its separator so a break falls inside the
        // name, never between the dot and the number.
        return (
          <span className="inline-block max-w-[10rem] whitespace-normal text-sm">
            <TeamLink team={opponent}>{getMaskedTeamName(opponent, user, isAdmin, teamOwnerNames)}</TeamLink>
            <span className="whitespace-nowrap">
              <span className="text-muted-foreground"> · </span>
              <NumberText
                value={team.powerRatingComponents?.nextOpponentProjected}
                className="text-muted-foreground"
              />
            </span>
          </span>
        );
      },
      scroll: {
        width: 11,
        title: 'Next matchup',
        className: 'text-right',
        // One line: the name gives way, and the projection stays whole.
        cell: (team) => {
          const opponent = opponentOf(team);
          if (!opponent) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="flex min-w-0 items-baseline justify-end gap-1">
              <TeamLink team={opponent} className="truncate">
                {getMaskedTeamName(opponent, user, isAdmin, teamOwnerNames)}
              </TeamLink>
              <NumberText
                value={team.powerRatingComponents?.nextOpponentProjected}
                className="shrink-0 text-muted-foreground"
              />
            </span>
          );
        },
      },
    },
    // The wide layout has this under the team's name.
    {
      key: 'owner',
      header: 'Owner',
      cell: (team) => getMaskedOwnerName(team, user, isAdmin, teamOwnerNames),
      scroll: { only: true, width: 10, className: 'truncate text-muted-foreground' },
    },
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
        scroll: { className: 'text-center' },
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
        scroll={{
          label: `Week ${currentWeek} Power Rankings table`,
          order: SCROLL_ORDER,
          isViewer: (team) => isUserTeam(team, user),
        }}
      />

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
                  ['Playoff odds', 'Probability of making the six-team playoff field'],
                  ['Form', 'Direction over the last four weeks'],
                  ['QW / BL', 'Quality wins and bad losses'],
                  ['Proj', 'This team’s projected starter total for the week'],
                  ['Next', 'This week’s opponent and their projected starter total'],
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
                  weights are rescaled, rather than being counted as a zero. NFL Schedule
                  also drops on historical views and on seasons without FPI data.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PowerRankingsTable;