import { useCallback, useMemo } from 'react';
import { CalendarX, House } from 'lucide-react';

import PageHeader from '../layout/PageHeader';
import { EmptyState } from '../ui/empty-state';
import { Skeleton, SkeletonCards } from '../ui/skeleton';
import ErrorBoundary from '../../../utils/errorBoundary.jsx';
import { cn } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useViewerTeam } from '../../hooks/use-viewer-team.js';
import {
  useActualWeek,
  useLeagueData,
  useSeasonConfig,
  useViewedWeek
} from '../../../hooks/queries/index.js';
import { daysUntilStart, seasonPhase } from '../../../utils/home/matchup.js';
import { HomeDirectory } from './HomeDirectory';
import { WidgetError } from './HomeWidget';
import { HOME_WIDGETS } from './homeWidgets';

/**
 * Below `lg` the two columns dissolve (`display: contents`) and every widget
 * is an item of one grid, so the registry's order is the reading order on a
 * phone. Literal class names: Tailwind cannot see one built at runtime.
 */
const ORDER = ['order-1', 'order-2', 'order-3', 'order-4', 'order-5', 'order-6', 'order-7', 'order-8', 'order-9', 'order-10', 'order-11', 'order-12'];

/**
 * The front door: `/` and `/home`.
 *
 * Two shapes, chosen by the flags the nav uses. A visitor or an account
 * awaiting approval gets the directory — a card per tab they may open. An
 * approved member gets the dashboard: the widgets in `homeWidgets.js`, centred
 * on their team.
 *
 * The choice waits on `isAuthLoading` and `isApprovalLoading`, as the route
 * guard does: a member on a cold load must not see the directory flash and
 * then flip to their matchup.
 *
 * Present tense only. The page reads `useActualWeek()` and never the viewed
 * week, and the shell hides the header's week control here (`weekAware:
 * false`). `actualWeek` is null until the season config has a start date —
 * `useActualWeek()` answers 1 before then, and a 1 cannot be told from a
 * real week 1 — so nothing week-keyed fetches early.
 */
export default function HomePage({ tabs = [], shouldShowTab = () => true, onOpenStandings }) {
  const { isAuthenticated, isAuthLoading, isApproved, isApprovalLoading } = useViewer();
  const { activeSeason, isLoading: seasonLoading } = useLeagueData();
  const config = useSeasonConfig();
  const derivedWeek = useActualWeek();
  const { setViewedWeek } = useViewedWeek();
  const { team: viewerTeam, isLoading: teamLoading } = useViewerTeam();

  const actualWeek = config?.startDate ? derivedWeek : null;
  const phase = teamLoading ? 'loading' : seasonPhase(config, activeSeason);

  // Week-aware tabs (Rankings, Schedule) open on whatever week the reader
  // last browsed to. A link from a present-tense page should land on the
  // present, so it resets the viewed week first.
  const openTab = useCallback(() => {
    if (actualWeek != null) setViewedWeek(actualWeek);
  }, [actualWeek, setViewedWeek]);

  // A link to one past week (a game in "Last 3 weeks") sets that week instead.
  const openWeek = useCallback((week) => setViewedWeek(week), [setViewedWeek]);

  // Whether the viewer may open a tab, by the nav's own rule — so a widget
  // only links where the link would not bounce.
  const canOpenTab = useCallback(
    (id) => {
      const tab = tabs.find((t) => t.id === id);
      return Boolean(tab && shouldShowTab(tab));
    },
    [tabs, shouldShowTab]
  );

  const ctx = useMemo(
    () => ({
      seasonId: activeSeason?.id ?? null,
      season: activeSeason,
      config,
      phase,
      actualWeek,
      daysToStart: daysUntilStart(config),
      viewerTeam,
      onOpenStandings,
      openTab,
      openWeek,
      canOpenTab
    }),
    [activeSeason, config, phase, actualWeek, viewerTeam, onOpenStandings, openTab, openWeek, canOpenTab]
  );

  if (isAuthLoading || isApprovalLoading) {
    return (
      <>
        <PageHeader icon={House} title="Home" />
        <HomeSkeleton />
      </>
    );
  }

  if (!isApproved) {
    return (
      <>
        <PageHeader icon={House} title="Home" description={seasonLine(activeSeason, phase, actualWeek)} />
        <HomeDirectory tabs={tabs} shouldShowTab={shouldShowTab} signedOut={!isAuthenticated} />
      </>
    );
  }

  if (!seasonLoading && !activeSeason) {
    return (
      <>
        <PageHeader icon={House} title="Home" />
        <EmptyState
          icon={CalendarX}
          title="No active season"
          description="When the admin activates a season, your matchup and the league's numbers appear here."
        />
        <HomeDirectory tabs={tabs} shouldShowTab={shouldShowTab} />
      </>
    );
  }

  const visible = HOME_WIDGETS.filter((widget) => widget.when(ctx));
  const hero = visible.filter((w) => w.column === 'hero');
  const main = visible.filter((w) => w.column === 'main');
  const side = visible.filter((w) => w.column === 'side');
  const orderOf = (widget) => ORDER[visible.indexOf(widget)] ?? '';

  // The last card in each desktop column stretches to the column's end, so
  // the two columns finish level whatever the cards' own heights — a card
  // with a little room under its content, never a hole under the shorter
  // column.
  const lastOf = (list) => list[list.length - 1];
  const render = (widget, className) => (
    <div
      key={widget.id}
      className={cn(
        'home-reveal min-w-0',
        orderOf(widget),
        'lg:order-none',
        widget === lastOf(main) || widget === lastOf(side) ? 'lg:flex lg:flex-1 lg:flex-col lg:[&>*]:flex-1' : null,
        className
      )}
      style={{ '--reveal-delay': `${visible.indexOf(widget) * 40}ms` }}
    >
      {/* A boundary per widget: a render crash in one leaves its card
          saying so, with a Retry, and every other widget standing. */}
      <ErrorBoundary
        fallback={({ resetError }) => (
          <WidgetError id={widget.id} title={widget.title} resetError={resetError} />
        )}
      >
        <widget.Component ctx={ctx} />
      </ErrorBoundary>
    </div>
  );

  return (
    <>
      <PageHeader icon={House} title="Home" description={seasonLine(activeSeason, phase, actualWeek)} />

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-12">
        {hero.map((widget) => render(widget, 'md:col-span-2 lg:col-span-12'))}

        {main.length > 0 && (
          <div className="contents lg:col-span-8 lg:flex lg:flex-col lg:gap-4 lg:self-stretch">
            {main.map((widget) => render(widget))}
          </div>
        )}

        {side.length > 0 && (
          // With no wide column (the page's first release carries none) the
          // narrow widgets share the full width, two across, rather than
          // sitting in a third of it beside nothing.
          <div
            className={cn(
              'contents',
              main.length > 0
                ? 'lg:col-span-4 lg:flex lg:flex-col lg:gap-4 lg:self-stretch'
                : 'lg:col-span-12 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4'
            )}
          >
            {side.map((widget) => render(widget))}
          </div>
        )}
      </div>
    </>
  );
}

/** "Week 8 · 2026 season", or what the season is doing instead. */
function seasonLine(season, phase, week) {
  if (!season) return undefined;
  const name = season.name || `${season.year} season`;
  if (phase === 'active' && week != null) return `Week ${week} · ${name}`;
  if (phase === 'complete') return `${name} · complete`;
  return name;
}

function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <div role="status" aria-label="Loading" className="rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
      <SkeletonCards count={2} className="lg:grid-cols-2" />
    </div>
  );
}
