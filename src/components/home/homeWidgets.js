/**
 * The home page's widgets, in reading order.
 *
 * Widgets are registered, not placed. `HomePage` maps this list into the
 * grid, so adding a widget is an entry here and a component — never a hand
 * edit of the page's JSX.
 *
 * - `id`        stable key, also the widget's heading id
 * - `title`     what the per-widget error card calls it if it crashes
 * - `column`    `hero` spans the page; `main` is the wide column at `lg`,
 *               `side` the narrow one. Below `lg` there are no columns and
 *               the list order is the reading order.
 * - `Component` receives `{ ctx }` and nothing else; it calls its own hooks.
 * - `when(ctx)` hides a widget that has no business rendering.
 *
 * `ctx` is `{ seasonId, season, config, phase, actualWeek, daysToStart,
 * viewerTeam, onOpenStandings, openTab, openWeek, canOpenTab }` — see
 * `HomePage`.
 */

import MatchupHero from './widgets/MatchupHero.jsx';
import PickemsParlayWidget from './widgets/PickemsParlayWidget.jsx';
import RankingsSlice from './widgets/RankingsSlice.jsx';
import RecentForm from './widgets/RecentForm.jsx';
import RecordsCarousel from './widgets/RecordsCarousel.jsx';
import StandingsMini from './widgets/StandingsMini.jsx';
import TakesWidget from './widgets/TakesWidget.jsx';

const inSeason = (ctx) => ctx.phase === 'active' || ctx.phase === 'complete';

/** The viewer's team has a scored game this season. "Nothing yet" above the
 *  fold is dead weight — the hero already says it is week 1. */
const hasPlayed = (ctx) =>
  Boolean(ctx.viewerTeam) &&
  (ctx.season?.schedule ?? []).some(
    (game) =>
      (game.team1Id === ctx.viewerTeam.id || game.team2Id === ctx.viewerTeam.id) &&
      game.team1Score != null &&
      game.team2Score != null &&
      game.team2Id != null
  );

export const HOME_WIDGETS = [
  {
    id: 'matchup',
    title: 'Your matchup',
    column: 'hero',
    Component: MatchupHero,
    when: (ctx) => Boolean(ctx.seasonId)
  },
  {
    // Second on a phone: it is the one card with a deadline on it. It says
    // so itself on the weeks with no pick'em row (a playoff week), rather
    // than vanishing — a card that comes and goes is harder to learn.
    id: 'pickems',
    title: "Pick'ems & TD parlay",
    column: 'main',
    Component: PickemsParlayWidget,
    when: (ctx) => ctx.phase === 'active' || ctx.phase === 'loading'
  },
  {
    // League history, so it is worth a look in any phase, the off-season
    // included.
    id: 'records',
    title: 'Records',
    column: 'main',
    Component: RecordsCarousel,
    when: (ctx) => Boolean(ctx.seasonId)
  },
  {
    id: 'rankings',
    title: 'Power rankings',
    column: 'side',
    Component: RankingsSlice,
    when: inSeason
  },
  {
    id: 'recent-form',
    title: 'Last 3 weeks',
    column: 'main',
    Component: RecentForm,
    when: (ctx) => inSeason(ctx) && hasPlayed(ctx)
  },
  {
    id: 'standings',
    title: 'Standings',
    column: 'side',
    Component: StandingsMini,
    when: inSeason
  },
  {
    id: 'takes',
    title: 'Takes',
    column: 'side',
    Component: TakesWidget,
    when: (ctx) => Boolean(ctx.seasonId)
  }
];

export default HOME_WIDGETS;
