import { useMemo } from 'react';

import {
  useActualWeek,
  useLineupsForWeek,
  useNflOpponentMap,
  useSeasonConfig
} from '../../../hooks/queries/index.js';
import { overlayGame } from '../../../utils/liveOverlay.js';
import { pickOutlook } from './pickOutlook.js';

const NONE = {};

/**
 * What every matchup card on a page reads, fetched once for the page.
 *
 * Fourteen cards share one lineup query and one calendar read, the entries
 * Schedule and the home page's hero already hold, so opening Pick'ems from
 * either is a cache hit. `useLineupsForWeek` chooses the table and lays the live
 * snapshot over it, so a card's score cannot disagree with the rows under it.
 *
 * `picks` is `{ [gameId]: teamId }`, the viewer's own, and only those get a chip.
 *
 * @param {{ seasonId: string, week: number, nflSeasonYear?: number|null, games: object[], picks?: object, enabled?: boolean }} args
 */
export function useMatchupBoard({ seasonId, week, nflSeasonYear = null, games, picks = NONE, enabled = true }) {
  // `useActualWeek()` answers 1 while the season loads, and a 1 cannot be told
  // from a real week 1. `useLineupsForWeek` waits on a null instead.
  const config = useSeasonConfig();
  const derivedWeek = useActualWeek();
  const actualWeek = config?.startDate ? derivedWeek : null;

  const active = enabled && games.length > 0;

  const { data: rowsByTeam = NONE, live, isLoading } = useLineupsForWeek(seasonId, week, {
    actualWeek,
    enabled: active
  });

  // Deliberately not awaited: a player renders without their opponent rather
  // than the list waiting on a second query.
  const { data: opponents = NONE } = useNflOpponentMap(nflSeasonYear, week, { enabled: active });

  const outlooks = useMemo(() => {
    const byGame = {};
    for (const game of games) {
      byGame[game.id] = pickOutlook({
        game,
        pickedTeamId: picks[game.id] ?? null,
        rowsByTeam,
        liveSides: overlayGame(game, live).live,
        nflGames: live?.nflGames
      });
    }
    return byGame;
  }, [games, picks, rowsByTeam, live]);

  return { rowsByTeam, live, opponents, outlooks, isLoading };
}

export default useMatchupBoard;
