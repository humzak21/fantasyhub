/**
 * Week state, with one owner per concept.
 *
 * Before this, "the current week" had three owners that wrote to each other:
 *
 *   1. `utils/weekCalculator.getCurrentWeek()` — calendar derivation
 *   2. `dataManager.getCurrentWeek(seasonId)` — a database column
 *   3. user navigation, via the hook's `setCurrentWeek`
 *
 * ...reconciled by two effects in `FantasyFootballApp.jsx` that each existed to
 * overrule the other, one of them commented "force calendar week after data
 * loads (override database value)". Navigating to week 3 could be silently
 * undone by whichever effect fired last.
 *
 * The split here:
 *
 *   **actual week** — a pure derivation from the active season's start date.
 *     No state, no effect, nothing to overwrite. It re-derives on its own as
 *     the clock passes a week boundary.
 *   **viewed week** — plain UI state, seeded from the actual week once.
 *
 * They never write to each other. The database's `weeks.current_week` column is
 * no longer consulted for this; `season_current_week()` in Postgres derives it
 * from the same start date, so the two cannot disagree.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

import { deriveCurrentWeek, toSeasonConfig } from '../../utils/seasonConfig.js';
import { useActiveSeason } from './useLeague.js';

/** How often to re-check whether the calendar has crossed a week boundary. */
const WEEK_TICK_MS = 60 * 60 * 1000;

/**
 * A Date that updates on an interval. One timer, no data writes — the only
 * thing it does is re-render so pure derivations from "now" stay honest.
 */
function useNow(intervalMs = WEEK_TICK_MS) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

/** The active season normalised to a `SeasonConfig`, or null before it loads. */
export function useSeasonConfig() {
  const { data: season } = useActiveSeason();
  return useMemo(() => (season ? toSeasonConfig(season) : null), [season]);
}

/**
 * The week the league is actually in, derived from the season start date.
 * Returns 1 until the season loads, which is what every consumer already
 * assumed. Read-only by construction.
 */
export function useActualWeek() {
  const config = useSeasonConfig();
  const now = useNow();
  return useMemo(() => (config ? deriveCurrentWeek(config, now) : 1), [config, now]);
}

const ViewedWeekContext = createContext(null);

/**
 * Holds the week the user is looking at.
 *
 * Seeded from the actual week, then owned entirely by navigation. The seeding
 * happens once per season — `hasSeeded` is keyed on the season id, so a season
 * switch re-seeds but a clock tick or a data refetch never yanks the user back
 * to the live week mid-browse.
 */
export function ViewedWeekProvider({ children }) {
  const actualWeek = useActualWeek();
  const config = useSeasonConfig();
  const seasonId = config?.id ?? null;

  const [state, setState] = useState({ week: actualWeek, seededFor: null });

  // Seed, and re-seed only when the season itself changes.
  const week = state.seededFor === seasonId ? state.week : actualWeek;

  useEffect(() => {
    if (!seasonId || state.seededFor === seasonId) return;
    setState({ week: actualWeek, seededFor: seasonId });
    // `actualWeek` is deliberately not a dependency: this seeds once per
    // season, and re-running it on every hourly tick is the bug being fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, state.seededFor]);

  const setViewedWeek = useCallback(
    (next) => {
      setState((current) => ({
        week: typeof next === 'function' ? next(current.week) : next,
        seededFor: seasonId ?? current.seededFor
      }));
    },
    [seasonId]
  );

  const value = useMemo(
    () => ({
      viewedWeek: week,
      setViewedWeek,
      actualWeek,
      isViewingCurrentWeek: week === actualWeek,
      /** Jump back to whatever week the league is actually in. */
      resetToActualWeek: () => setViewedWeek(actualWeek)
    }),
    [week, setViewedWeek, actualWeek]
  );

  return <ViewedWeekContext.Provider value={value}>{children}</ViewedWeekContext.Provider>;
}

/**
 * @returns {{
 *   viewedWeek: number,
 *   setViewedWeek: (week: number | ((prev:number)=>number)) => void,
 *   actualWeek: number,
 *   isViewingCurrentWeek: boolean,
 *   resetToActualWeek: () => void
 * }}
 */
export function useViewedWeek() {
  const context = useContext(ViewedWeekContext);
  if (!context) {
    throw new Error('useViewedWeek must be used inside a <ViewedWeekProvider>');
  }
  return context;
}
