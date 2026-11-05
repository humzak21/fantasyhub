import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';

import { Skeleton } from '../ui/skeleton.jsx';
import BestWorstGames from './sections/BestWorstGames.jsx';
import GameLog from './sections/GameLog.jsx';
import HeadlineTiles from './sections/HeadlineTiles.jsx';
import LeagueStanding from './sections/LeagueStanding.jsx';
import Moves from './sections/Moves.jsx';
import OwnershipHistory from './sections/OwnershipHistory.jsx';
import ProfileHeader from './sections/ProfileHeader.jsx';
import SeasonBar from './sections/SeasonBar.jsx';
import TotalsAndAverages from './sections/TotalsAndAverages.jsx';
import Trends from './sections/Trends.jsx';
import { SectionCard } from './sections/SectionCard.jsx';
import { ALL_SEASONS, lineBoxScore, maskFranchise } from './sections/sectionFormat.js';
import { MatchupBoxScoreSheet } from '../matchups/MatchupBoxScoreSheet.jsx';

// recharts stays out of every page that never opens a player.
const PlayerCharts = lazy(() => import('./sections/PlayerCharts.jsx'));

/**
 * The player page's contents, inside the shell `PlayerDetail` draws.
 *
 * Header, the six career tiles, the season bar, then the sections: from `lg`
 * two columns (the log, totals and charts on the left; trends, best and worst,
 * the league strip, ownership and moves on the right), stacked in that reading
 * order below it. The body is a `@container`, so the tiles size by the
 * dialog's width rather than the viewport's.
 *
 * The season choice is component state, `'all'` or a season id, opening on
 * All seasons: the page is his whole time in the league first, and one
 * season is a narrowing of it.
 *
 * Every week or year the sections print is a `BoxScoreButton` where that
 * week's game was scored, opening `MatchupBoxScoreSheet` over the page
 * (`boxScoreFor` turns a line, or a season and week, into the sheet's game).
 * Both are Radix dialogs on one layer stack, so the sheet stacks on top and the
 * page stays open beneath it. A neighbour's link replaces the player under the same
 * body, so the choice resets when the player changes.
 *
 * @param {object} props
 * @param {object} props.profile - `buildPlayerProfile`'s output, never null here
 * @param {object|null} props.ranking - `rankCareers`' output, or null while it loads or failed
 * @param {object} props.rankingQuery - the careers query, for its loading and error states
 * @param {object} props.viewer - `useViewer()`, for masking franchises
 * @param {() => void} props.onClose - closes the page (pass to a `TeamLink`'s `onClick`)
 */
export default function PlayerDetailBody({ profile, ranking, rankingQuery, viewer, onClose }) {
  const seasons = profile.seasons ?? [];
  const playerId = profile.player?.id ?? null;
  const [choice, setChoice] = useState({ playerId, value: ALL_SEASONS });
  if (choice.playerId !== playerId) setChoice({ playerId, value: ALL_SEASONS });
  const value = choice.playerId === playerId ? choice.value : ALL_SEASONS;

  const onSeasonChange = useCallback(
    (next) => setChoice({ playerId, value: next }),
    [playerId]
  );
  const maskName = useCallback((franchise) => maskFranchise(franchise, viewer), [viewer]);

  const [boxScore, setBoxScore] = useState(null);
  const nflYearBySeason = useMemo(
    () => new Map(seasons.map((s) => [String(s.seasonId), s.nflSeasonYear ?? s.year])),
    [seasons]
  );
  // A line, or `{ seasonId, week }` for a surface that has only those (a move).
  const boxScoreFor = useCallback(
    (ref) => {
      if (!ref) return null;
      const line = ref.game !== undefined
        ? ref
        : seasons.find((s) => String(s.seasonId) === String(ref.seasonId))?.weeks.find((w) => w.week === ref.week) ?? null;
      return line ? lineBoxScore(line, viewer, nflYearBySeason.get(String(line.seasonId)) ?? null) : null;
    },
    [seasons, viewer, nflYearBySeason]
  );
  const openBoxScore = useCallback((game) => setBoxScore(game), []);
  const closeBoxScore = useCallback(() => setBoxScore(null), []);
  const onOpenWeek = useCallback((line) => {
    const game = boxScoreFor(line);
    if (game) setBoxScore(game);
  }, [boxScoreFor]);

  const season = value === ALL_SEASONS ? null : seasons.find((s) => String(s.seasonId) === String(value)) ?? null;
  const mode = season ? 'season' : 'all';
  const shared = { profile, season, viewer, onClose, boxScoreFor, openBoxScore };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ProfileHeader profile={profile} viewer={viewer} onClose={onClose} />
      <HeadlineTiles profile={profile} ranking={ranking} rankingQuery={rankingQuery} />
      <SeasonBar profile={profile} value={season ? season.seasonId : ALL_SEASONS} season={season} onChange={onSeasonChange} />

      <div data-slot="sections" className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <GameLog {...shared} />
          <TotalsAndAverages {...shared} />
          <SectionCard title="Charts" icon={LineChart}>
            <Suspense fallback={<Skeleton className="h-[220px]" />}>
              <PlayerCharts profile={profile} season={season} mode={mode} maskName={maskName} onOpenWeek={onOpenWeek} />
            </Suspense>
          </SectionCard>
        </div>
        <div className="min-w-0 space-y-4">
          <Trends {...shared} />
          <BestWorstGames {...shared} />
          <LeagueStanding profile={profile} ranking={ranking} rankingQuery={rankingQuery} />
          <OwnershipHistory {...shared} />
          <Moves {...shared} />
        </div>
      </div>

      <MatchupBoxScoreSheet game={boxScore} onClose={closeBoxScore} />
    </div>
  );
}
