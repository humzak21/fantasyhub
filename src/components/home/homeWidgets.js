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
 * viewerTeam, onOpenStandings, openTab }` — see `HomePage`.
 */

import MatchupHero from './widgets/MatchupHero.jsx';
import RankingsSlice from './widgets/RankingsSlice.jsx';
import StandingsMini from './widgets/StandingsMini.jsx';

const inSeason = (ctx) => ctx.phase === 'active' || ctx.phase === 'complete';

export const HOME_WIDGETS = [
  {
    id: 'matchup',
    title: 'Your matchup',
    column: 'hero',
    Component: MatchupHero,
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
    id: 'standings',
    title: 'Standings',
    column: 'side',
    Component: StandingsMini,
    when: inSeason
  }
];

export default HOME_WIDGETS;
