/**
 * Season configuration — the single source for every date the app derives.
 *
 * Before this module, week 1 was a constant in utils/weekCalculator.js, a
 * *second* and slightly different constant in types/index.js, the awards
 * release date was a literal in FantasyFootballApp.jsx, and the pick'em close
 * rule existed in three places at two different times. All of it now comes off
 * the active `seasons` row (see supabase/migrations/*_season_config_backbone).
 *
 * The config is set once when the active season loads (`setSeasonConfig`) and
 * read synchronously afterwards, so the existing synchronous call sites keep
 * working. Everything below `deriveX(config, ...)` is pure and testable.
 */

/**
 * @typedef {Object} SeasonConfig
 * @property {string}  id
 * @property {number}  year
 * @property {string}  startDate       - 'YYYY-MM-DD', first day of week 1 (a Tuesday)
 * @property {string}  timeZone        - IANA zone, e.g. 'America/New_York'
 * @property {number}  weekCount       - total fantasy weeks (regular + playoff)
 * @property {number}  regularSeasonWeeks
 * @property {number}  playoffStartWeek
 * @property {string}  status          - 'active' | 'archived' | 'upcoming'
 * @property {string?} espnLeagueId
 * @property {number?} espnSeasonYear
 * @property {string?} awardsReleaseAt - ISO instant
 * @property {{openOffsetDays:number, openTime:string, closeOffsetDays:number, closeTime:string, revealOffsetDays:number, revealTime:string}} pickEm
 */

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

let activeConfig = null;

// ---------------------------------------------------------------------------
// Time zone helpers
// ---------------------------------------------------------------------------

/** Offset, in ms, of `timeZone` from UTC at the given instant. */
const zoneOffsetMs = (instant, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
    .formatToParts(instant)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24, // some engines render midnight as "24"
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - instant.getTime();
};

/**
 * Resolve a wall-clock date/time in a specific zone to a real instant.
 * Two passes so the offset is looked up at (approximately) the right instant,
 * which is what makes DST transitions come out right.
 *
 * @param {string} date - 'YYYY-MM-DD'
 * @param {string} time - 'HH:MM' or 'HH:MM:SS'
 * @param {string} timeZone
 * @returns {Date}
 */
export const zonedWallClockToInstant = (date, time, timeZone) => {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const naive = Date.parse(`${date}T${normalizedTime}Z`);
  if (Number.isNaN(naive)) {
    throw new Error(`Invalid season date/time: ${date} ${time}`);
  }

  let instant = naive;
  for (let pass = 0; pass < 2; pass += 1) {
    instant = naive - zoneOffsetMs(new Date(instant), timeZone);
  }
  return new Date(instant);
};

/** Add whole days to a 'YYYY-MM-DD' string, staying in calendar space. */
const addDays = (date, days) => {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Build a SeasonConfig from a `seasons` / `v_active_season` row. Accepts both
 * the snake_case shape the database returns and an already-camelCased object.
 *
 * @param {Object} row
 * @returns {SeasonConfig}
 */
export const toSeasonConfig = (row) => {
  if (!row) return null;

  const regularSeasonWeeks = row.regular_season_weeks ?? row.regularSeasonWeeks ?? 0;
  const playoffWeeks = row.playoff_weeks ?? row.playoffWeeks ?? 0;

  return {
    id: row.id,
    year: row.year,
    startDate: row.start_date ?? row.startDate ?? null,
    timeZone: row.timezone ?? row.timeZone ?? 'America/New_York',
    weekCount:
      row.week_count ?? row.weekCount ?? row.total_weeks ?? row.totalWeeks
        ?? regularSeasonWeeks + playoffWeeks,
    regularSeasonWeeks,
    playoffStartWeek:
      row.playoff_start_week ?? row.playoffStartWeek ?? regularSeasonWeeks + 1,
    status: row.status ?? (row.is_active ? 'active' : 'archived'),
    espnLeagueId: row.espn_league_id ?? row.espnLeagueId ?? null,
    espnSeasonYear: row.espn_season_year ?? row.espnSeasonYear ?? row.year ?? null,
    awardsReleaseAt: row.awards_release_at ?? row.awardsReleaseAt ?? null,
    pickEm: {
      openOffsetDays: row.pickem_open_offset_days ?? 0,
      openTime: row.pickem_open_time ?? '04:00',
      closeOffsetDays: row.pickem_close_offset_days ?? 2,
      closeTime: row.pickem_close_time ?? '20:00',
      revealOffsetDays: row.pickem_reveal_offset_days ?? 7,
      revealTime: row.pickem_reveal_time ?? '12:00'
    }
  };
};

// ---------------------------------------------------------------------------
// Module singleton
// ---------------------------------------------------------------------------

/** @param {Object|null} row - a seasons row, or null to clear. */
export const setSeasonConfig = (row) => {
  activeConfig = row ? toSeasonConfig(row) : null;
  return activeConfig;
};

/** @returns {SeasonConfig|null} */
export const getSeasonConfig = () => activeConfig;

/** True once a season row has been loaded and it has a usable start date. */
export const hasSeasonConfig = () => Boolean(activeConfig?.startDate);

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

/**
 * Instant at which a fantasy week begins. Weeks roll over at midnight in the
 * season's own time zone, every 7 days from `startDate`.
 *
 * @param {SeasonConfig} config
 * @param {number} week
 * @returns {Date}
 */
export const deriveWeekStart = (config, week) => {
  if (!config?.startDate) {
    throw new Error('Season config has no start date');
  }
  return zonedWallClockToInstant(
    addDays(config.startDate, (week - 1) * 7),
    '00:00',
    config.timeZone
  );
};

/** Instant one millisecond before the following week begins. */
export const deriveWeekEnd = (config, week) =>
  new Date(deriveWeekStart(config, week + 1).getTime() - 1);

/**
 * Current fantasy week, clamped to [1, weekCount]. Mirrors the SQL function
 * public.season_current_week so the UI and the sync job cannot disagree.
 *
 * @param {SeasonConfig} config
 * @param {Date} [now]
 * @returns {number}
 */
export const deriveCurrentWeek = (config, now = new Date()) => {
  if (!config?.startDate) return 1;

  const elapsed = now.getTime() - deriveWeekStart(config, 1).getTime();
  if (elapsed < 0) return 1;

  const week = Math.floor(elapsed / MS_PER_WEEK) + 1;
  return Math.min(week, config.weekCount || week);
};

/** @returns {boolean} whether the given week falls in the playoff bracket. */
export const isPlayoffWeek = (config, week) =>
  Boolean(config) && week >= config.playoffStartWeek;

/**
 * Default pick'em window for a week. The real windows live in
 * `pick_em_weeks`; this is what those rows get created from.
 *
 * @returns {{submissionOpensAt:string, submissionClosesAt:string, resultsRevealAt:string}}
 */
export const derivePickEmSchedule = (config, week) => {
  if (!config?.startDate) {
    throw new Error('Season config has no start date');
  }

  const weekStartDate = addDays(config.startDate, (week - 1) * 7);
  const { pickEm, timeZone } = config;

  const at = (offsetDays, time) =>
    zonedWallClockToInstant(addDays(weekStartDate, offsetDays), time, timeZone).toISOString();

  return {
    submissionOpensAt: at(pickEm.openOffsetDays, pickEm.openTime),
    submissionClosesAt: at(pickEm.closeOffsetDays, pickEm.closeTime),
    resultsRevealAt: at(pickEm.revealOffsetDays, pickEm.revealTime)
  };
};

/**
 * Whether pick'ems for a week are still accepting submissions.
 * Prefers the stored `pick_em_weeks` row; falls back to the season rule.
 *
 * @param {SeasonConfig} config
 * @param {number} week
 * @param {{submission_closes_at?:string, submissionClosesAt?:string}} [storedWeek]
 * @param {Date} [now]
 */
export const arePickEmsOpen = (config, week, storedWeek = null, now = new Date()) => {
  const storedClose = storedWeek?.submission_closes_at ?? storedWeek?.submissionClosesAt;
  if (storedClose) return now < new Date(storedClose);

  if (!config?.startDate) return false;
  const { submissionOpensAt, submissionClosesAt } = derivePickEmSchedule(config, week);
  return now >= new Date(submissionOpensAt) && now < new Date(submissionClosesAt);
};

/**
 * Awards are readable once the season's release instant has passed. A season
 * with no release date configured never unlocks on date alone — callers still
 * grant access to admins and, when enabled, to all authenticated users.
 */
export const areAwardsReleased = (config, now = new Date()) => {
  if (!config?.awardsReleaseAt) return false;
  return now >= new Date(config.awardsReleaseAt);
};

/**
 * Is this the season currently being played?
 *
 * Replaces `season.year === 2025` checks, which misclassified every season the
 * moment the calendar rolled over. Prefers the row's own status, falls back to
 * the legacy is_active flag, and only then compares against the loaded config.
 *
 * @param {{status?:string, is_active?:boolean, isActive?:boolean, year?:number}} season
 * @returns {boolean}
 */
export const isCurrentSeason = (season) => {
  if (!season) return false;
  if (season.status) return season.status === 'active';
  if (typeof season.is_active === 'boolean') return season.is_active;
  if (typeof season.isActive === 'boolean') return season.isActive;

  const config = getSeasonConfig();
  return Boolean(config?.year) && season.year === config.year;
};

/** Every week number in the season, 1..weekCount. */
export const listWeeks = (config) => {
  const count = config?.weekCount ?? 0;
  return Array.from({ length: count }, (_, index) => index + 1);
};
