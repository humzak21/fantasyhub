/**
 * What the league's automations are, and how to read what they left behind.
 *
 * Pure. Nothing here fetches: the dashboard hands it `sync_runs` rows, the
 * freshness signals from `getAutomationHealth`, the season config and the
 * clock, and gets back a status per automation and a list of recommendations.
 * That split is what makes the rules testable without a database, and it is
 * the same decide/execute shape as `espnGameMapper.js` and `parlayGrader.js`.
 *
 * Two facts shape everything below:
 *
 *   * **Both scheduled ESPN jobs run the same script.** `sync-week.yml` and
 *     `daily-refresh.yml` each invoke `scripts/sync-week.js`; the daily one
 *     adds six `--skip-*` flags. A `sync_runs` row does not say which
 *     workflow wrote it, so `classifyRun` reads the flags back out of the
 *     step results — `skipped: 'flag'` on the result-writing steps is the
 *     daily refresh's signature.
 *   * **A run's success is not the data's freshness.** A row can say
 *     `success` on Tuesday and the week's snapshot can be missing on
 *     Thursday because a person ran `--skip-snapshot` by hand. So the
 *     recommendations read the tables too, through `health`.
 */

import { deriveWeekStart } from '../../../../utils/seasonConfig.js';

export const GITHUB_REPO = 'https://github.com/humzak21/fantasyhub';
export const workflowUrl = (file) => `${GITHUB_REPO}/actions/workflows/${file}`;
export const SECRETS_URL = `${GITHUB_REPO}/settings/secrets/actions`;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A `running` row older than this was never closed: the job died or timed out. */
export const STALLED_AFTER_MS = 30 * MINUTE;
/** How long after a slot a cron run may still land before it counts as missed. */
export const MISSED_GRACE_MS = 3 * HOUR;
/** A cron run this far past its slot is worth a note. */
export const LATE_AFTER_MINUTES = 60;

// ---------------------------------------------------------------------------
// The steps of scripts/sync-week.js, in the order they run.
// ---------------------------------------------------------------------------

export const STEP_ORDER = [
  'pickEmWeek',
  'rosters',
  'scores',
  'playerStats',
  'finalizePrev',
  'nflSchedule',
  'nflRatings',
  'parlayGrades',
  'transactions',
  'snapshot'
];

/**
 * Per step: what it reads, what it writes, and whether a failure stops the
 * run (`fatal`). The non-fatal ones record `{ failed }` in `steps` and the
 * run carries on, so a `success` row can still contain a failed step — the
 * dashboard has to look inside.
 */
export const STEPS = {
  pickEmWeek: {
    label: "Open the week's pick'ems",
    fatal: false,
    espn: null,
    reads: ['seasons.pickem_* columns'],
    writes: ['pick_em_weeks'],
    description:
      "Creates the pick_em_weeks row for the target week if none exists, through the same " +
      "create_pick_em_week RPC the admin button uses. Runs first and needs no ESPN call, so an " +
      "ESPN outage cannot cost the league its picks. Skipped in playoff weeks."
  },
  rosters: {
    label: 'Refresh rosters',
    fatal: true,
    espn: 'mRoster + mTeam (league-private, needs ESPN_S2/SWID)',
    reads: ['teams'],
    writes: ['rosters (delete + reinsert per team)', 'players (projected_points, injury status)'],
    description:
      "Rewrites every team's current roster and lineup slots from ESPN. This is the present-tense " +
      "snapshot the pick'ems research panel, Teams tab and Schedule lineups read. Stops once the " +
      "playoffs start so records stay frozen."
  },
  scores: {
    label: 'Write matchup scores',
    fatal: true,
    espn: 'mMatchupScore for the target week (league-private)',
    reads: ['teams', 'games'],
    writes: ['games (team scores; rows created for matchups ESPN added)'],
    description:
      "Upserts the week's matchups. Derived columns (winner, margin, blowout, completed_at) are " +
      "computed by the before_game_update trigger; the game type is written on insert only so " +
      "hand-corrected postseason types survive."
  },
  playerStats: {
    label: 'Store player week stats',
    fatal: false,
    espn: 'the same mMatchupScore payload (no extra request)',
    reads: ['teams', 'players'],
    writes: ['player_week_stats (one row per player per week)', 'players (new ids)'],
    description:
      "One row per rostered player per week: slot, started, projected and actual points, and the " +
      "raw stat breakdown. actual_points stays null until ESPN has settled the matchup or has a " +
      "per-category line, so a pre-kickoff zero is never stored as a result."
  },
  finalizePrev: {
    label: 'Finalize the previous week',
    fatal: false,
    espn: 'mMatchupScore for week N-1 (one extra request)',
    reads: ['teams', 'games'],
    writes: ['games (final scores for week N-1)', 'player_week_stats (week N-1 actuals)'],
    description:
      "The cron targets the week that has just begun, so the finished week's real numbers would " +
      "never be fetched without this. Re-runs scores and player stats over week N-1 through the " +
      "same upserts. Only when the week was derived, never for an explicit week argument."
  },
  nflSchedule: {
    label: 'Refresh the NFL calendar',
    fatal: false,
    espn: 'proTeamSchedules_wl (public, no cookies)',
    reads: [],
    writes: ['nfl_schedule (two rows per game, one per bye, keyed by season_year)'],
    description:
      "Re-imports the whole NFL season so flexed kickoffs stay right. Feeds the 'vs BUF / @ KC / " +
      "BYE' chips, the nflSos ranking component and the parlay grader's stats_official gate."
  },
  nflRatings: {
    label: 'Snapshot NFL power index',
    fatal: false,
    espn: "ESPN's Football Power Index (public, no cookies)",
    reads: [],
    writes: ['nfl_team_ratings (one row per NFL team per fantasy week)'],
    description:
      "ESPN serves current FPI only, so the weekly snapshot is what makes a past week's ranking " +
      "reproducible. Runs before the snapshot on purpose so the week ranks on fresh FPI."
  },
  parlayGrades: {
    label: 'Grade TD parlay picks',
    fatal: false,
    espn: 'kona_player_info for dropped players only (league-private)',
    reads: ['td_parlay_picks (scored_td IS NULL)', 'player_week_stats.stat_breakdown', 'nfl_schedule.stats_official'],
    writes: ['td_parlay_picks.scored_td'],
    description:
      "Grades every elapsed ungraded pick from the stored stat breakdown. Every uncertain case " +
      "skips and stays 'Pending' (a wrong 'no TD' is invisible, a pending pick is conspicuous); " +
      "only an explicit bye grades false without a stat line. Free-text picks stay manual."
  },
  transactions: {
    label: 'Refresh transaction counts',
    fatal: false,
    espn: 'mTransactions2 season summary (league-private)',
    reads: ['teams (franchise_id)'],
    writes: ['transactions (adds, waivers, trades, drops, FAAB per franchise)'],
    description:
      "Season-to-date roster moves per franchise, upserted on (franchise_id, season_id). A team " +
      "ESPN names that no season team matches is reported, not guessed."
  },
  snapshot: {
    label: 'Snapshot power rankings',
    fatal: true,
    espn: null,
    reads: ['games', 'player_week_stats', 'nfl_schedule', 'nfl_team_ratings', 'rosters'],
    writes: ['power_rankings_history (snapshot_type = weekly)'],
    description:
      "Runs the power ranking calculator for the week and stores the result. Clears the week " +
      "before inserting, so a re-run replaces rather than duplicates. This is what the rankings " +
      "history chart and week-over-week movement read."
  }
};

// ---------------------------------------------------------------------------
// The automations.
// ---------------------------------------------------------------------------

/**
 * `schedule` is the cron in UTC, decomposed so `lastScheduledSlot` can find
 * the slot a run belongs to without a cron parser. `skips` are the steps the
 * workflow passes `--skip-*` for, which is also the signature `classifyRun`
 * looks for.
 */
export const AUTOMATIONS = [
  {
    id: 'weekly-sync',
    name: 'Weekly ESPN sync',
    kind: 'workflow',
    workflowFile: 'sync-week.yml',
    command: 'npm run sync-week',
    evidence: 'sync_runs',
    schedule: {
      cron: '0 10 * * 2',
      dow: 2,
      hour: 10,
      minute: 0,
      human: 'Tuesdays at 10:00 UTC (05:00 EST / 06:00 EDT)'
    },
    timeoutMinutes: 15,
    concurrency: 'espn-write',
    secrets: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ESPN_S2', 'ESPN_SWID'],
    steps: STEP_ORDER,
    skips: [],
    summary:
      "The one job that writes results. Every Tuesday morning it opens the week's pick'ems, " +
      "refreshes rosters, writes the new week's matchups and projections, finalizes the week that " +
      "just ended, refreshes the NFL calendar and FPI, grades the TD parlay, refreshes transaction " +
      "counts, and snapshots the power rankings.",
    notes: [
      'Takes no arguments: the active season row supplies the season, week, playoff boundary and ESPN league.',
      'Every step is an idempotent upsert, so re-running a failed run is the fix.',
      'Exits quietly (status 0, no sync_runs row) when the season is completed or has not started; throws if the season has no start_date.',
      'Rosters, scores and the snapshot are fatal; the other seven steps record their failure and the run continues.'
    ]
  },
  {
    id: 'daily-refresh',
    name: 'Daily ESPN refresh',
    kind: 'workflow',
    workflowFile: 'daily-refresh.yml',
    command:
      'npm run sync-week -- --skip-scores --skip-player-stats --skip-finalize-prev ' +
      '--skip-nfl-schedule --skip-nfl-ratings --skip-snapshot',
    evidence: 'sync_runs',
    schedule: {
      cron: '40 16 * * *',
      dow: null,
      hour: 16,
      minute: 40,
      human: 'Every day at 16:40 UTC (12:40 PM EDT / 11:40 AM EST)'
    },
    timeoutMinutes: 10,
    concurrency: 'espn-write',
    secrets: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ESPN_S2', 'ESPN_SWID'],
    steps: ['pickEmWeek', 'rosters', 'parlayGrades', 'transactions'],
    skips: ['scores', 'playerStats', 'finalizePrev', 'nflSchedule', 'nflRatings', 'snapshot'],
    summary:
      "The present-tense half. Managers change lineups up to kickoff and waivers clear on " +
      "Wednesday, so rosters and transaction counts are refreshed daily. It never writes a " +
      "result: scores, player stats and the ranking snapshot move once a week, on Tuesday.",
    notes: [
      'Same script as the weekly sync with six --skip flags, so a sync_runs row is attributed to this job by those flags.',
      'Timed to land twenty minutes before the early Sunday kickoffs; GitHub cron starts late under load, which is why the margin exists.',
      'Also re-runs the pick\'em-week check and the parlay grader, so a Tuesday miss on either is caught the same day.'
    ]
  },
  {
    id: 'schedule-import',
    name: 'Season schedule import',
    kind: 'workflow',
    workflowFile: 'sync-schedule.yml',
    command: 'npm run sync-schedule',
    evidence: 'espn_schedule_imports',
    schedule: { cron: null, human: 'Manual, once a year (Run workflow button)' },
    timeoutMinutes: 15,
    concurrency: 'espn-write',
    secrets: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ESPN_S2', 'ESPN_SWID'],
    steps: [],
    skips: [],
    reads: ['mTeam + mMatchup for the whole season (league-private)', 'proTeamSchedules_wl (public)'],
    writes: [
      'teams (name and abbreviation on update; owner and espn_team_id filled only when blank)',
      'games (every matchup; type written on insert only)',
      'nfl_schedule (the same year)',
      'espn_schedule_imports (the log row)'
    ],
    summary:
      "The start-of-season job. Fetches the whole season from ESPN and writes teams and games " +
      "directly, then refreshes the NFL calendar for the same year. The weekly sync creates any " +
      "matchup this missed, so a re-run is safe but rarely needed.",
    notes: [
      'Reports owner-name divergences between ESPN and teams.owner instead of overwriting: teams.owner is the cross-season identity key.',
      'Rows match ESPN by espn_matchup_id, falling back to week + team pair so pre-ESPN rows are adopted, not duplicated.'
    ]
  }
];

/**
 * Automations with no run log: database triggers and functions that fire on
 * a write, and the repository jobs. Listed so the dashboard is the whole
 * inventory, with where to look when one misbehaves.
 */
export const PASSIVE_AUTOMATIONS = [
  {
    id: 'trigger-game-update',
    name: 'before_game_update trigger',
    where: 'Database · games',
    fires: 'On every insert or update of a games row',
    does:
      'Computes winner_team_id, loser_team_id, is_tie, point_differential, is_blowout, is_close and ' +
      'completed_at from the two scores. is_completed is a generated column. The sync never writes ' +
      'these columns, so they cannot drift from the scores.',
    verify: 'A game with both scores but no winner_team_id means the trigger is missing or disabled.'
  },
  {
    id: 'trigger-default-divisions',
    name: 'trigger_create_default_divisions',
    where: 'Database · seasons',
    fires: 'When a season row is inserted',
    does:
      "Seeds 'Division 1' and 'Division 2' for the new season. Anything else writing divisions for a " +
      'fresh season must upsert on (season_id, display_order).',
    verify: 'A new season with no divisions in the standings drawer.'
  },
  {
    id: 'trigger-auth-confirmed',
    name: 'on_auth_user_confirmed',
    where: 'Database · auth.users',
    fires: 'When an account confirms its email',
    does:
      'Inserts the pending member_approvals row that puts the account in Settings → Approvals. Wrapped ' +
      'so it can never raise: an exception here would break sign-up for everyone.',
    verify: 'A confirmed account that never appears in the approval queue; list_member_approvals() still lists it via a LEFT JOIN.'
  },
  {
    id: 'trigger-take-events',
    name: 'log_take_event / log_take_participant_event / set_take_edited_at',
    where: 'Database · takes, take_participants',
    fires: 'On insert, update or delete of a take or a +1',
    does:
      'Appends the take_events activity log (posted, edited with a from/to diff, graded, faded, unfaded) ' +
      'and stamps edited_at when the body or wager moves. Nothing else may write take_events.',
    verify: 'An edit with no matching take_events row.'
  },
  {
    id: 'finalize-on-activate',
    name: 'Finalize the previous season on activation',
    where: 'App · seasons.setActiveSeason',
    fires: 'When the admin makes a different season active',
    does:
      'Runs finalize_season on the season being replaced, non-fatally: placements, playoff finishes and ' +
      'is_completed. A season with games still to play is skipped silently. The result is reported on the ' +
      'returned season as finalizedPrevious / finalizeError.',
    verify: 'Settings → Seasons shows the previous season as completed with a champion.'
  },
  {
    id: 'ci',
    name: 'CI (ci.yml)',
    where: 'GitHub Actions · every push and pull request',
    fires: 'On push and pull request',
    does:
      'Type-check, unit tests, build, the CSS token check, the mobile-convention greps and a Playwright ' +
      'smoke run at 375×667 and 1280×800. Lint is advisory except under src/components/ui and layout.',
    verify: `${GITHUB_REPO}/actions/workflows/ci.yml`
  },
  {
    id: 'dependabot',
    name: 'Dependabot',
    where: 'GitHub · .github/dependabot.yml',
    fires: 'Weekly',
    does:
      'Grouped dependency updates so the lockfile moves a few times a month. Majors arrive as their own PR. ' +
      'The lockfile merge driver regenerates package-lock.json from package.json on conflict.',
    verify: `${GITHUB_REPO}/pulls`
  }
];

export const findAutomation = (id) => AUTOMATIONS.find((automation) => automation.id === id) ?? null;

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/** The most recent slot at or before `at` for a cron-scheduled automation, or null. */
export function lastScheduledSlot(schedule, at = new Date()) {
  if (!schedule?.cron) return null;
  const slot = new Date(Date.UTC(
    at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), schedule.hour, schedule.minute
  ));
  if (slot > at) slot.setUTCDate(slot.getUTCDate() - 1);
  if (schedule.dow != null) {
    while (slot.getUTCDay() !== schedule.dow) slot.setUTCDate(slot.getUTCDate() - 1);
  }
  return slot;
}

/** The first slot strictly after `at`, or null for a manual-only automation. */
export function nextScheduledSlot(schedule, at = new Date()) {
  const last = lastScheduledSlot(schedule, at);
  if (!last) return null;
  const next = new Date(last);
  next.setUTCDate(next.getUTCDate() + (schedule.dow != null ? 7 : 1));
  return next;
}

/**
 * Minutes between a cron run and the slot it was scheduled for. Null for a
 * manual run, or when the nearest slot is more than twelve hours back — a
 * run that far off is not late, it is from somewhere else.
 */
export function scheduleLagMinutes(run, automation) {
  if (!run || run.trigger !== 'cron' || !automation?.schedule?.cron) return null;
  const started = new Date(run.startedAt);
  const slot = lastScheduledSlot(automation.schedule, started);
  if (!slot) return null;
  const lag = Math.round((started - slot) / MINUTE);
  return lag > 12 * 60 ? null : lag;
}

// ---------------------------------------------------------------------------
// Reading a run
// ---------------------------------------------------------------------------

const isFlagSkipped = (step) => step?.skipped === 'flag';

/**
 * Which workflow wrote a `sync_runs` row.
 *
 * The daily refresh is the weekly script with `--skip-scores` and
 * `--skip-snapshot` (among others); no scheduled weekly run ever sets those.
 * A row with no steps yet — still running, or dead before its first step —
 * is attributed by proximity to a slot, and otherwise stays `unknown`.
 */
export function classifyRun(run) {
  const steps = run?.steps ?? {};
  const hasSteps = Object.keys(steps).length > 0;

  if (hasSteps) {
    return isFlagSkipped(steps.scores) && isFlagSkipped(steps.snapshot)
      ? 'daily-refresh'
      : 'weekly-sync';
  }

  if (run?.trigger === 'cron' && run.startedAt) {
    for (const automation of AUTOMATIONS) {
      const lag = scheduleLagMinutes({ ...run, trigger: 'cron' }, automation);
      if (lag != null && lag >= 0 && lag <= 6 * 60) return automation.id;
    }
  }
  return 'unknown';
}

const SKIP_REASONS = {
  flag: 'skipped by flag',
  'playoff week': 'skipped — playoff week',
  'no previous week': 'skipped — nothing before week 1',
  'explicit week': 'skipped — week given explicitly'
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const errorIssues = (errors = [], prefix) =>
  errors.map((entry) => {
    const who = entry?.team ? `${entry.team}: ` : '';
    return `${prefix}${who}${entry?.error ?? String(entry)}`;
  });

/**
 * One step's result, as a state and a sentence.
 *
 *   ok       the step ran and reported no problems
 *   warning  the step ran but reported errors or conflicts alongside its counts
 *   failed   the step threw (non-fatal steps record this and the run continues)
 *   skipped  by flag, playoff boundary, or the week rule
 *   missing  the run never reached it, or the row predates the step
 */
export function summarizeStep(name, result) {
  if (result == null) {
    return { state: 'missing', text: 'not recorded', issues: [] };
  }
  if (result.failed) {
    return { state: 'failed', text: result.failed, issues: [] };
  }
  // A string `skipped` is the script's "did not run" marker. The parlay step
  // also reports `skipped` as a map of reason → count for picks it left
  // pending, which is the step *running* and must not read as a skip.
  if (typeof result.skipped === 'string') {
    const why = SKIP_REASONS[result.skipped] ?? `skipped — ${result.skipped}`;
    return { state: 'skipped', text: why, issues: [] };
  }

  const issues = [];
  let text = 'ok';

  switch (name) {
    case 'pickEmWeek':
      text = result.created ? "created the week's pick'em row" : 'row already open';
      break;
    case 'rosters':
      text = 'rosters rewritten from ESPN';
      break;
    case 'scores':
      text = `${result.created ?? 0} created · ${result.updated ?? 0} updated · ${result.unchanged ?? 0} unchanged`;
      issues.push(...errorIssues(result.errors, 'unmatched: '));
      issues.push(...(result.conflicts ?? []).map((clash) =>
        `conflict: ${typeof clash === 'string' ? clash : JSON.stringify(clash)}`));
      break;
    case 'playerStats':
      text = `${plural(result.upserted ?? 0, 'player row')} · ${plural(result.playersCreated ?? 0, 'new player')}`;
      issues.push(...errorIssues(result.errors, 'skipped: '));
      break;
    case 'finalizePrev':
      text =
        `week ${result.week}: ${result.scores?.updated ?? 0} scores updated · ` +
        `${plural(result.playerStats?.upserted ?? 0, 'player row')}`;
      issues.push(...errorIssues(result.scores?.errors, 'unmatched: '));
      issues.push(...errorIssues(result.playerStats?.errors, 'skipped: '));
      break;
    case 'nflSchedule':
      text = `${result.upserted ?? 0} team-weeks` + (result.weekSpan ? ` over ${result.weekSpan} weeks` : '');
      issues.push(...errorIssues(result.errors, ''));
      break;
    case 'nflRatings':
      text = `${plural(result.upserted ?? 0, 'NFL team')} rated`;
      issues.push(...errorIssues(result.errors, ''));
      break;
    case 'parlayGrades': {
      const skipped = Object.entries(result.skipped ?? {});
      text = `${result.graded ?? 0} graded (${result.tds ?? 0} TD · ${result.noTds ?? 0} no TD)`;
      if (result.konaRecovered) text += ` · ${result.konaRecovered} recovered from ESPN`;
      for (const [reason, n] of skipped) issues.push(`${n} left pending — ${reason}`);
      issues.push(...errorIssues(result.errors, 'write failed: '));
      break;
    }
    case 'transactions':
      text = `${plural(result.updated ?? 0, 'team')} updated`;
      issues.push(...errorIssues(result.errors, ''));
      break;
    case 'snapshot':
      text = `${plural(result.teamsSnapshotted ?? 0, 'team')} snapshotted`;
      break;
    default:
      text = JSON.stringify(result);
  }

  // Pending parlay picks are the design working, not a fault; every other
  // issue list is something a person may need to look at.
  const state = issues.length > 0 && name !== 'parlayGrades' ? 'warning' : 'ok';
  return { state, text, issues };
}

/** Every step of a run, in script order, summarised. Steps the job skips by flag are folded away. */
export function summarizeRunSteps(run, { includeFlagSkips = false } = {}) {
  const steps = run?.steps ?? {};
  return STEP_ORDER
    .map((name) => ({ name, ...STEPS[name], ...summarizeStep(name, steps[name]), raw: steps[name] }))
    .filter((step) => includeFlagSkips || !(step.state === 'skipped' && isFlagSkipped(steps[step.name])));
}

/**
 * The run as a whole: the row's own status, sharpened by what the steps say
 * and by whether a `running` row is still plausibly running.
 */
export function runOutcome(run, now = new Date()) {
  const steps = summarizeRunSteps(run);
  const failedSteps = steps.filter((step) => step.state === 'failed').map((step) => step.name);
  const warningSteps = steps.filter((step) => step.state === 'warning').map((step) => step.name);

  let status = run?.status ?? 'unknown';
  if (status === 'running' && run.startedAt && now - new Date(run.startedAt) > STALLED_AFTER_MS) {
    status = 'stalled';
  } else if (status === 'success' && failedSteps.length > 0) {
    status = 'partial';
  }

  return { status, failedSteps, warningSteps };
}

// ---------------------------------------------------------------------------
// Season state
// ---------------------------------------------------------------------------

/**
 * Where the calendar is. The cron runs all year; outside the season the
 * script exits before writing a row, so "no run this week" is the design,
 * not a failure — and the status logic has to know which.
 */
export function seasonState(season, config, now = new Date()) {
  if (!season || !config) return 'none';
  if (season.isCompleted || season.is_completed || config.status === 'archived') return 'completed';
  if (!config.startDate) return 'no-start-date';
  if (now < deriveWeekStart(config, 1)) return 'not-started';
  return 'in-season';
}

// ---------------------------------------------------------------------------
// Per-automation status
// ---------------------------------------------------------------------------

/**
 * One automation's standing, from its runs.
 *
 *   failed    the latest run failed outright
 *   stalled   the latest row is still `running` past the job's timeout
 *   partial   the latest run succeeded but a non-fatal step failed
 *   missed    in season, and no cron run landed for the last slot (with grace)
 *   running   a run is in progress
 *   attention the latest run reported per-step issues
 *   late      the latest cron run started well after its slot
 *   healthy   nothing to report
 *   idle      out of season, so no run is expected
 *   no-runs   nothing in the log yet
 */
export function summarizeAutomation(automation, runs, { now = new Date(), state = 'in-season' } = {}) {
  const own = runs.filter((run) => classifyRun(run) === automation.id);
  const latest = own[0] ?? null;
  const outcome = latest ? runOutcome(latest, now) : null;
  const lagMinutes = scheduleLagMinutes(latest, automation);
  const nextRun = state === 'in-season' ? nextScheduledSlot(automation.schedule, now) : null;

  let status = 'healthy';
  let missedSlot = null;

  if (!latest) {
    status = state === 'in-season' ? 'no-runs' : 'idle';
  } else if (outcome.status === 'failed') {
    status = 'failed';
  } else if (outcome.status === 'stalled') {
    status = 'stalled';
  } else if (outcome.status === 'running') {
    status = 'running';
  } else if (outcome.status === 'partial') {
    status = 'partial';
  } else if (state !== 'in-season') {
    status = 'idle';
  } else {
    const dueSlot = lastScheduledSlot(automation.schedule, new Date(now - MISSED_GRACE_MS));
    const covered = dueSlot
      ? own.some((run) => run.trigger === 'cron' && new Date(run.startedAt) >= dueSlot)
      : true;
    if (!covered) {
      status = 'missed';
      missedSlot = dueSlot;
    } else if (outcome.warningSteps.length > 0) {
      status = 'attention';
    } else if (lagMinutes != null && lagMinutes > LATE_AFTER_MINUTES) {
      status = 'late';
    }
  }

  return { automation, runs: own, latest, outcome, status, lagMinutes, nextRun, missedSlot };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

/** Advice keyed on what an error message looks like. */
export function adviseOnError(message = '') {
  const text = String(message);
  if (/401|403|unauthori[sz]ed|forbidden|cookie|espn_s2|swid|not a member/i.test(text)) {
    return {
      title: 'ESPN rejected the league credentials',
      detail:
        'ESPN_S2 and SWID are browser cookies that expire and are rotated when you sign out. Sign in ' +
        'to ESPN, copy the two cookies again, update the repository secrets, and re-run the workflow.',
      actions: [{ label: 'Update repository secrets', href: SECRETS_URL }]
    };
  }
  if (/start_date/i.test(text)) {
    return {
      title: 'The active season has no start date',
      detail:
        'Every week number is derived from seasons.start_date, so the sync refuses to guess. Set it to ' +
        'the Tuesday week 1 begins in Settings → Seasons and re-run.',
      actions: []
    };
  }
  if (/no active season/i.test(text)) {
    return {
      title: 'No season is marked active',
      detail: 'Mark the current season active in Settings → Seasons; every job resolves its target from that row.',
      actions: []
    };
  }
  if (/espn league id|espn_league_id/i.test(text)) {
    return {
      title: 'The season has no ESPN league id',
      detail: 'Set seasons.espn_league_id for the active season (createSeason carries it forward; a hand-made season may lack it).',
      actions: []
    };
  }
  if (/fetch failed|econnreset|etimedout|timeout|timed out|socket hang up|503|502|504/i.test(text)) {
    return {
      title: 'ESPN or the network was unavailable',
      detail: 'Almost always transient. Every step is an idempotent upsert, so re-running the workflow is the whole fix.',
      actions: []
    };
  }
  if (/jwt|service_role|permission denied|pgrst|row-level security|apikey/i.test(text)) {
    return {
      title: 'Supabase refused the write',
      detail:
        'The job authenticates with SUPABASE_SERVICE_ROLE_KEY. Confirm the secret matches the project ' +
        '(kvcnijyyfylxfarrlxkv) and has not been rotated, then re-run.',
      actions: [{ label: 'Update repository secrets', href: SECRETS_URL }]
    };
  }
  return {
    title: 'Re-run the job and read the log',
    detail: 'The message above is the whole record the app has. The GitHub Actions log for the run has the stack trace.',
    actions: []
  };
}

const olderThan = (iso, ms, now) => !iso || now - new Date(iso) > ms;

/**
 * What to do, ordered by severity. Each recommendation names the automation,
 * says what is wrong in one sentence, why it matters, and the concrete next
 * action — a workflow to press, a command to run, or a setting to change.
 */
export function buildRecommendations({
  summaries = [],
  health = null,
  config = null,
  state = 'in-season',
  actualWeek = null,
  now = new Date()
}) {
  const out = [];
  const push = (rec) => out.push({ severity: 'info', actions: [], ...rec });

  const runAction = (automation) => ({
    label: `Run ${automation.name}`,
    href: workflowUrl(automation.workflowFile)
  });
  const commandAction = (automation) => ({ label: 'Or from a terminal', command: automation.command });

  if (state === 'none') {
    push({
      id: 'no-season',
      severity: 'warning',
      title: 'No active season',
      detail: 'Every job resolves its target from the active season row. Until one is marked active, nothing runs.'
    });
    return out;
  }
  if (state === 'no-start-date') {
    push({
      id: 'no-start-date',
      severity: 'error',
      title: 'The active season has no start date',
      detail:
        'The weekly sync throws on this rather than syncing an arbitrary week, so every scheduled run ' +
        'is failing. Set start_date to the Tuesday week 1 begins in Settings → Seasons.'
    });
  }
  if (state === 'not-started') {
    push({
      id: 'pre-season',
      severity: 'info',
      title: 'Season has not started — jobs exit quietly',
      detail:
        `The cron fires but sync-week.js exits before writing a row until ${config?.startDate}. ` +
        'To pull rosters and projections early, run the weekly sync by hand with --force.',
      actions: [{ label: 'Pre-season pull', command: 'npm run sync-week -- --force' }]
    });
  }
  if (state === 'completed') {
    push({
      id: 'completed',
      severity: 'info',
      title: 'Season is completed — jobs exit quietly',
      detail: 'Nothing runs until the next season is created and marked active.'
    });
  }

  for (const summary of summaries) {
    const { automation, latest, outcome, status, lagMinutes, missedSlot } = summary;
    if (!automation.workflowFile || automation.evidence !== 'sync_runs') continue;

    if (status === 'failed') {
      const advice = adviseOnError(latest.error);
      push({
        id: `${automation.id}-failed`,
        severity: 'error',
        automationId: automation.id,
        title: `${automation.name} failed: ${advice.title}`,
        detail: `${latest.error ?? 'no error message recorded'} — ${advice.detail}`,
        actions: [...advice.actions, runAction(automation), commandAction(automation)]
      });
    }
    if (status === 'stalled') {
      push({
        id: `${automation.id}-stalled`,
        severity: 'error',
        automationId: automation.id,
        title: `${automation.name} never finished`,
        detail:
          `A run started ${new Date(latest.startedAt).toISOString()} is still marked running, past the ` +
          `${automation.timeoutMinutes}-minute job timeout. The runner was killed before it could close the ` +
          'row. Re-run; the upserts pick up where it stopped.',
        actions: [runAction(automation), commandAction(automation)]
      });
    }
    if (status === 'missed') {
      push({
        id: `${automation.id}-missed`,
        severity: 'error',
        automationId: automation.id,
        title: `${automation.name} did not run for its last slot`,
        detail:
          `No cron run has landed since ${missedSlot.toISOString()}. Either GitHub did not fire the ` +
          'schedule (a repository with no pushes for 60 days has its schedules disabled), the job failed ' +
          'before it could open a sync_runs row (check the Actions log), or the script exited early because ' +
          'the season row says not started or completed.',
        actions: [
          { label: 'Check the Actions log', href: workflowUrl(automation.workflowFile) },
          runAction(automation)
        ]
      });
    }
    if (status === 'partial' && latest) {
      for (const stepName of outcome.failedSteps) {
        const step = STEPS[stepName];
        const advice = adviseOnError(latest.steps?.[stepName]?.failed);
        push({
          id: `${automation.id}-${stepName}-failed`,
          severity: 'warning',
          automationId: automation.id,
          title: `${automation.name}: "${step.label}" failed, run continued`,
          detail:
            `${latest.steps?.[stepName]?.failed ?? ''} — this step writes ${step.writes.join(', ')}. ` +
            `${advice.detail}`,
          actions: [...advice.actions, runAction(automation)]
        });
      }
    }
    if (status === 'attention' && latest) {
      for (const stepName of outcome.warningSteps) {
        const detail = summarizeStep(stepName, latest.steps?.[stepName]);
        push({
          id: `${automation.id}-${stepName}-issues`,
          severity: 'warning',
          automationId: automation.id,
          title: `${automation.name}: "${STEPS[stepName].label}" reported ${plural(detail.issues.length, 'issue')}`,
          detail: detail.issues.slice(0, 5).join(' · '),
          actions: stepName === 'transactions' || stepName === 'scores'
            ? [{ label: 'Check team owners and espn_team_id', href: null, note: 'Settings → Seasons' }]
            : []
        });
      }
    }
    if (lagMinutes != null && lagMinutes > LATE_AFTER_MINUTES && status !== 'missed') {
      const sunday = automation.id === 'daily-refresh';
      push({
        id: `${automation.id}-late`,
        severity: sunday && lagMinutes > 20 ? 'warning' : 'info',
        automationId: automation.id,
        title: `${automation.name} started ${lagMinutes} minutes after its slot`,
        detail: sunday
          ? 'The daily refresh is timed to land twenty minutes before the early Sunday kickoffs. A lag this ' +
            'size means the Sunday lineups it captures are already locked. GitHub schedules are best-effort; ' +
            'move the cron earlier in .github/workflows/daily-refresh.yml rather than later.'
          : 'GitHub schedules are best-effort and start late under load. Harmless unless the pick\'em window ' +
            'opens before the row is created.'
      });
    }
  }

  // Data freshness: what the tables say regardless of what the log says.
  if (health && state === 'in-season' && actualWeek) {
    const weekly = findAutomation('weekly-sync');
    const daily = findAutomation('daily-refresh');
    const playoffs = config?.playoffStartWeek != null && actualWeek >= config.playoffStartWeek;

    if (!playoffs && !health.pickEmWeeks.includes(actualWeek)) {
      push({
        id: 'pickem-week-missing',
        severity: 'error',
        title: `No pick'em row for week ${actualWeek}`,
        detail:
          "The Pick'ems tab has nothing to submit against and the TD parlay renders nothing. Either job " +
          'creates it on its next run; to open it now, press Create Week in the Pick\'ems admin panel.',
        actions: [runAction(daily)]
      });
    }
    if (!health.snapshot || health.snapshot.week < actualWeek) {
      push({
        id: 'snapshot-behind',
        severity: 'warning',
        title: `No ranking snapshot for week ${actualWeek}`,
        detail:
          `The newest weekly snapshot is week ${health.snapshot?.week ?? 'none'}. Rankings history and ` +
          'week-over-week movement stop at that week until the weekly sync runs (its snapshot step is fatal, ' +
          'so a missing one means the run did not reach it).',
        actions: [runAction(weekly), commandAction(weekly)]
      });
    }
    if (actualWeek > 1 && (!health.playerStats || health.playerStats.week < actualWeek - 1)) {
      push({
        id: 'player-stats-behind',
        severity: 'warning',
        title: `Player stats stop at week ${health.playerStats?.week ?? 'none'}`,
        detail:
          `Week ${actualWeek - 1} has finished but has no player_week_stats rows, so lineups show ` +
          'projections and the parlay grader has nothing to grade. finalizePrev on the weekly sync writes them.',
        actions: [runAction(weekly)]
      });
    }
    if (!playoffs && olderThan(health.rosters?.at, 36 * HOUR, now)) {
      push({
        id: 'rosters-stale',
        severity: 'warning',
        title: 'Rosters are more than a day and a half old',
        detail:
          `Last rewritten ${health.rosters?.at ? new Date(health.rosters.at).toISOString() : 'never'}. ` +
          "The pick'ems research panel, Teams tab and Schedule lineups all read this snapshot; the daily " +
          'refresh should have replaced it.',
        actions: [runAction(daily)]
      });
    }
    if (olderThan(health.transactions?.at, 48 * HOUR, now)) {
      push({
        id: 'transactions-stale',
        severity: 'info',
        title: 'Transaction counts are more than two days old',
        detail: 'The transactions leaderboard reads last_synced_at rows the daily refresh should be replacing.',
        actions: [runAction(daily)]
      });
    }
    if (health.nflSchedule.rows === 0) {
      push({
        id: 'nfl-schedule-empty',
        severity: 'warning',
        title: `No NFL calendar for ${config?.espnSeasonYear ?? 'this season'}`,
        detail:
          'Opponent chips render nothing, the nflSos ranking component is unknown for every team, and the ' +
          'parlay grader cannot see a bye. The weekly sync re-imports it; so does this command.',
        actions: [{ label: 'Import the NFL calendar', command: 'npm run sync-nfl-schedule' }]
      });
    }
    if (!health.nflRatings || health.nflRatings.week < actualWeek) {
      push({
        id: 'nfl-ratings-behind',
        severity: 'info',
        title: `No FPI snapshot for week ${actualWeek}`,
        detail:
          `Newest is week ${health.nflRatings?.week ?? 'none'}. The nflSos component ranks on the latest ` +
          'snapshot it has; a missing week is a slightly staler ranking, not a broken one.',
        actions: [{ label: 'Snapshot FPI now', command: 'npm run sync-nfl-ratings' }]
      });
    }
    if (health.pendingParlayGrades > 0) {
      push({
        id: 'parlay-pending',
        severity: 'info',
        title: `${plural(health.pendingParlayGrades, 'TD parlay pick')} from finished weeks still pending`,
        detail:
          'The grader leaves a pick pending when the NFL stats are not yet official, the player has no stat ' +
          'line, or the pick was free text. Most clear on the next run; a free-text pick has to be graded by ' +
          "hand in the Pick'ems → Parlay dashboard."
      });
    }
  }

  const rank = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** How many recommendations need a person — the Settings sidebar badge. */
export const countAttention = (recommendations = []) =>
  recommendations.filter((rec) => rec.severity !== 'info').length;
