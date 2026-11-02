/**
 * When NFL games are on, and so when ESPN is worth calling at all.
 *
 * Shared by the two live feeds. Pure apart from `fetchWeekKickoffs`, so the
 * clock can be tested without an edge runtime or a network. Nothing here calls
 * ESPN: these are the checks that decide whether anything else may.
 *
 * Two answers, in order of how much they know:
 *
 *   - `kickoffWindows`, from `nfl_schedule.game_time`. Knows about Wednesday,
 *     Friday and Saturday games and the 9:30 ET London slot, because it reads
 *     the calendar.
 *   - `GAME_WINDOWS`, the league's usual Thu/Sun/Mon slots. Only for a week the
 *     calendar has no kickoffs for.
 */

const EASTERN = 'America/New_York';

/** A game runs about 3h15; four hours past the last kickoff covers overtime. */
export const LAST_KICKOFF_TAIL_MS = 4 * 60 * 60 * 1000;

/**
 * When NFL games are worth polling for, in Eastern wall-clock time. `day` is
 * 0=Sunday … 6=Saturday; `startMin`/`endMin` are minutes past midnight ET.
 *
 * These are the league's usual windows — Thursday and Monday night, and the
 * Sunday slate. They are intentionally a touch generous on the tail (games run
 * long) and easy to extend. Missing a slot is never *wrong* — it just means no
 * live overlay for it; the Tuesday sync still lands.
 */
export const GAME_WINDOWS = [
  { day: 4, startMin: 20 * 60, endMin: 24 * 60 }, // Thursday 20:00–23:59 ET
  { day: 0, startMin: 13 * 60, endMin: 24 * 60 }, // Sunday   13:00–23:59 ET
  { day: 1, startMin: 20 * 60, endMin: 24 * 60 }  // Monday   20:00–23:59 ET
];

/**
 * A `Date`'s Eastern weekday and minutes-past-midnight, via the runtime's own
 * time-zone database — so it is correct across the EDT→EST change without any
 * offset arithmetic here.
 */
export function etParts(now, timeZone = EASTERN) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
  // `hour12: false` renders midnight as '24' in some engines; fold it back to 0.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));

  return { weekday, minutes: hour * 60 + minute };
}

/** Is `{ weekday, minutes }` inside any window? Pure, so it is the tested core. */
export function inWindow({ weekday, minutes }, windows = GAME_WINDOWS) {
  return windows.some(
    (w) => w.day === weekday && minutes >= w.startMin && minutes < w.endMin
  );
}

/** Is now inside a game window? A cheap local check, never an ESPN call. */
export function isLikelyGameWindow(now, windows = GAME_WINDOWS, timeZone) {
  return inWindow(etParts(now, timeZone), windows);
}

/**
 * Should ESPN be pulled right now?
 *
 * Only inside a window, and only if the last pull is at least the TTL old (or
 * there has never been one). Outside a window this is always false — the caller
 * serves the last snapshot untouched.
 */
export function shouldRefresh({ now, refreshedAt, inWindow: isIn, ttlMs }) {
  if (!isIn) return false;
  if (!refreshedAt) return true;

  const last = new Date(refreshedAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= ttlMs;
}

/**
 * One window per Eastern calendar day that has a game: from that day's first
 * kickoff to its last kickoff plus `tailMs`.
 *
 * By day rather than per game, because a Sunday's slots overlap anyway and a
 * gap between them would stop the feed with the early games running long. The
 * tail is what carries a Monday-night game past midnight.
 *
 * @param {Array<string|Date|null>} kickoffs `nfl_schedule.game_time` for a week
 * @returns {Array<{ start: number, end: number }>} epoch ms, in kickoff order
 */
export function kickoffWindows(kickoffs = [], { tailMs = LAST_KICKOFF_TAIL_MS, timeZone = EASTERN } = {}) {
  const dayOf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const byDay = new Map();
  for (const kickoff of kickoffs) {
    if (kickoff == null) continue;
    const at = new Date(kickoff);
    if (Number.isNaN(at.getTime())) continue;

    const day = dayOf.format(at);
    const known = byDay.get(day);
    byDay.set(day, {
      first: Math.min(known?.first ?? Infinity, at.getTime()),
      last: Math.max(known?.last ?? -Infinity, at.getTime())
    });
  }

  return [...byDay.values()]
    .map(({ first, last }) => ({ start: first, end: last + tailMs }))
    .sort((a, b) => a.start - b.start);
}

/**
 * A week's kickoffs. A `start_time_tbd` row is left out because its time is
 * ESPN's placeholder: week 18 reads 3:01 AM on a Sunday until the NFL sets its
 * slate, and a window built on that would open in the middle of the night.
 *
 * @param {object} client a Supabase client
 * @param {number|null} seasonYear
 * @param {number|null} week
 * @returns {Promise<string[]>} empty without a year and week to ask about
 */
export async function fetchWeekKickoffs(client, seasonYear, week) {
  if (!seasonYear || !week) return [];

  const { data, error } = await client
    .from('nfl_schedule')
    .select('game_time')
    .eq('season_year', seasonYear)
    .eq('week', week)
    .eq('start_time_tbd', false)
    .not('game_time', 'is', null);

  if (error) throw error;
  return (data ?? []).map((row) => row.game_time);
}

/**
 * Is a game on, by the week's own calendar?
 *
 * A week with no kickoffs on file is *unknown*, not empty, so it falls back to
 * the usual slots rather than reporting that no game will ever be played.
 */
export function isGameWindowOpen(now, kickoffs = []) {
  const windows = kickoffWindows(kickoffs);
  if (windows.length === 0) return isLikelyGameWindow(now);

  const at = now.getTime();
  return windows.some(({ start, end }) => at >= start && at < end);
}
