import { useState } from 'react';
import {
  Workflow,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Clock,
  SkipForward,
  Hourglass,
  ChevronDown,
  ChevronRight,
  Database,
  Terminal,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Zap,
  CalendarClock
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { EmptyState } from '../ui/empty-state';
import { cn, formatDateTime } from '../../lib/utils';
import { useAutomationReport } from './automations/useAutomationReport.js';
import {
  PASSIVE_AUTOMATIONS,
  STEPS,
  summarizeRunSteps,
  runOutcome,
  scheduleLagMinutes,
  upcomingSchedule,
  workflowUrl
} from './automations/automationCatalog.js';

/**
 * Settings → Automations: every job that runs without a person, what it
 * reads and writes, whether it ran, and what to do when it did not.
 *
 * Read-only by construction. The jobs run in GitHub Actions with the
 * service-role key and the ESPN cookies; the browser can watch the
 * `sync_runs` log and the tables the steps own, and link to the workflow's
 * "Run workflow" button, but cannot start one — ESPN needs cookies only the
 * workflows hold. The `isAdmin` gate on the settings page is an affordance:
 * nothing here is more private than the league tables every visitor reads.
 *
 * The rules — which workflow a row belongs to, when a slot counts as missed,
 * what a failed step means — live in `automations/automationCatalog.js`,
 * which is pure and tested. This file only renders its output.
 */

// Every state map below carries a `meaning`: the colour key at the top of
// the page is built from these same objects, so a badge and its legend entry
// cannot disagree.
const STATUS = {
  healthy: { label: 'Healthy', variant: 'success', Icon: CheckCircle2, meaning: 'Last run succeeded on schedule with nothing to report.' },
  running: { label: 'Running', variant: 'info', Icon: Loader2, meaning: 'A run is in progress right now.' },
  late: { label: 'Ran late', variant: 'info', Icon: Clock, meaning: 'Ran, but started more than an hour after its cron slot.' },
  attention: { label: 'Check issues', variant: 'warning', Icon: AlertTriangle, meaning: 'Ran, but a step reported errors or conflicts alongside its counts.' },
  partial: { label: 'Step failed', variant: 'warning', Icon: AlertTriangle, meaning: 'Ran to the end, but a non-fatal step failed and was skipped over.' },
  missed: { label: 'Missed', variant: 'destructive', Icon: XCircle, meaning: 'In season, and no scheduled run landed for the last slot.' },
  failed: { label: 'Failed', variant: 'destructive', Icon: XCircle, meaning: 'The last run stopped with an error.' },
  stalled: { label: 'Never finished', variant: 'destructive', Icon: Hourglass, meaning: 'A run is still marked running past the job timeout; the runner died.' },
  idle: { label: 'Idle (off-season)', variant: 'secondary', Icon: Clock, meaning: 'Out of season: the cron fires and the script exits without writing.' },
  'no-runs': { label: 'No runs yet', variant: 'secondary', Icon: Clock, meaning: 'Nothing in the log for this job yet.' }
};

const RUN_STATUS = {
  success: { label: 'Success', variant: 'success', meaning: 'Every step finished.' },
  partial: { label: 'Partial', variant: 'warning', meaning: 'Finished, but a non-fatal step failed inside it.' },
  failed: { label: 'Failed', variant: 'destructive', meaning: 'Stopped with an error; later steps never ran.' },
  running: { label: 'Running', variant: 'info', meaning: 'Still in progress.' },
  stalled: { label: 'Never finished', variant: 'destructive', meaning: 'Never closed its row; the job was killed.' }
};

const STEP_STATE = {
  ok: { Icon: CheckCircle2, className: 'text-success', label: 'Ran', meaning: 'The step ran and reported no problems.' },
  warning: { Icon: AlertTriangle, className: 'text-warning', label: 'Ran with issues', meaning: 'The step ran but listed errors or conflicts.' },
  failed: { Icon: XCircle, className: 'text-destructive', label: 'Failed', meaning: 'The step threw; a non-fatal step lets the run continue.' },
  skipped: { Icon: SkipForward, className: 'text-muted-foreground', label: 'Skipped', meaning: 'Skipped by a flag, the playoff boundary, or the week rule.' },
  missing: { Icon: Hourglass, className: 'text-muted-foreground', label: 'Not reached', meaning: 'The run stopped before this step, or the row predates it.' }
};

const SEVERITY = {
  error: { Icon: XCircle, className: 'border-destructive/40 bg-destructive/10', iconClass: 'text-destructive', label: 'Error', meaning: 'Something a person has to fix; data is missing or wrong.' },
  warning: { Icon: AlertTriangle, className: 'border-warning/40 bg-warning/10', iconClass: 'text-warning', label: 'Warning', meaning: 'Worth a look; a step or table is behind.' },
  info: { Icon: Info, className: 'border-info/30 bg-info/10', iconClass: 'text-info', label: 'Info', meaning: 'Explains a state; usually nothing to do.' }
};

const SEASON_STATE_COPY = {
  none: 'No active season. Nothing runs until one is marked active.',
  'no-start-date': 'The active season has no start date, so every scheduled run throws.',
  'not-started': 'Season has not started. The crons fire and exit quietly until week 1.',
  'in-season': 'In season. Both scheduled jobs are expected to run.',
  completed: 'Season completed. The crons fire and exit quietly.'
};

const fmt = (iso) => (iso ? formatDateTime(iso) : '—');

const duration = (ms) => {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const relative = (iso, now) => {
  if (!iso) return '';
  const minutes = Math.round((now - new Date(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

const StatusBadge = ({ status }) => {
  const meta = STATUS[status] ?? STATUS['no-runs'];
  const { Icon } = meta;
  return (
    <Badge variant={meta.variant} className="gap-1">
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
};

const Chips = ({ items, empty = '—' }) =>
  items?.length ? (
    <ul className="flex flex-wrap gap-1">
      {items.map((item) => (
        <li key={item} className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {item}
        </li>
      ))}
    </ul>
  ) : (
    <span className="text-xs text-muted-foreground">{empty}</span>
  );

const Field = ({ label, children, className }) => (
  <div className={cn('min-w-0', className)}>
    <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
    <div className="mt-0.5 text-sm text-foreground">{children}</div>
  </div>
);

const ActionLink = ({ action }) => {
  if (action.command) {
    return (
      <code className="rounded-md border border-border bg-muted/60 px-2 py-1 text-xs">
        {action.command}
      </code>
    );
  }
  if (action.href) {
    return (
      <Button asChild size="sm" variant="outline">
        <a href={action.href} target="_blank" rel="noreferrer">
          {action.label}
          <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </Button>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {action.label}
      {action.note ? ` (${action.note})` : ''}
    </span>
  );
};

const Recommendation = ({ rec }) => {
  const meta = SEVERITY[rec.severity] ?? SEVERITY.info;
  const { Icon } = meta;
  return (
    <li className={cn('rounded-lg border p-3', meta.className)}>
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.iconClass)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{rec.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{rec.detail}</p>
          {rec.actions?.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {rec.actions.map((action, index) => (
                <ActionLink key={`${action.label}-${index}`} action={action} />
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

const StepRow = ({ step, showDescription }) => {
  const meta = STEP_STATE[step.state] ?? STEP_STATE.missing;
  const { Icon } = meta;
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.className)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{step.label}</span>
            <span className="text-xs text-muted-foreground">{step.name}</span>
            {!step.fatal && <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">non-fatal</span>}
          </div>
          <p className={cn('text-sm', step.state === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
            {step.text}
          </p>
          {step.issues.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {step.issues.slice(0, 8).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
              {step.issues.length > 8 && <li>…and {step.issues.length - 8} more</li>}
            </ul>
          )}
          {showDescription && (
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
              <Field label="Pulls from"><Chips items={[step.espn, ...step.reads].filter(Boolean)} empty="database only" /></Field>
              <Field label="Writes" className="sm:col-span-2"><Chips items={step.writes} /></Field>
              <p className="text-muted-foreground sm:col-span-3">{step.description}</p>
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

const RunRow = ({ run, now, automation, seasonLabel }) => {
  const [open, setOpen] = useState(false);
  const outcome = runOutcome(run, now);
  const meta = RUN_STATUS[outcome.status] ?? RUN_STATUS.running;
  const lag = scheduleLagMinutes(run, automation);
  const steps = summarizeRunSteps(run);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li className="py-2">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 text-left"
      >
        <Chevron className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <span className="text-sm font-medium tabular">Week {run.weekNumber}</span>
            {seasonLabel && <span className="text-xs text-muted-foreground">{seasonLabel}</span>}
            <Badge variant="outline">{run.trigger === 'manual' ? 'manual' : 'scheduled'}</Badge>
            {lag != null && lag > 5 && (
              <span className="text-xs text-muted-foreground">+{lag} min after slot</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fmt(run.startedAt)} · {duration(run.durationMs)}
            {outcome.failedSteps.length > 0 && ` · failed: ${outcome.failedSteps.join(', ')}`}
            {outcome.warningSteps.length > 0 && ` · issues: ${outcome.warningSteps.join(', ')}`}
          </p>
        </div>
      </button>

      {open && (
        <div className="ml-6 mt-2 space-y-2">
          {run.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="break-words">{run.error}</AlertDescription>
            </Alert>
          )}
          <ul className="divide-y divide-border rounded-lg border border-border px-3">
            {steps.map((step) => (
              <StepRow key={step.name} step={step} />
            ))}
          </ul>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Raw steps JSON</summary>
            <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-muted/40 p-2">
              {JSON.stringify(run.steps, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </li>
  );
};

const AutomationCard = ({ summary, now, seasonNames, health }) => {
  const { automation, latest, outcome, status, lagMinutes, nextRun, runs } = summary;
  const [showSteps, setShowSteps] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const steps = latest ? summarizeRunSteps(latest) : [];
  const isImport = automation.evidence === 'espn_schedule_imports';
  const importRow = health?.scheduleImport ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Workflow className="h-4 w-4" aria-hidden="true" />
              {automation.name}
              {isImport ? (
                <Badge variant={importRow ? 'success' : 'secondary'}>{importRow ? 'Imported' : 'Not run'}</Badge>
              ) : (
                <StatusBadge status={status} />
              )}
            </CardTitle>
            <CardDescription className="mt-1">{automation.summary}</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href={workflowUrl(automation.workflowFile)} target="_blank" rel="noreferrer">
              Open workflow
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Schedule">
            {automation.schedule.human}
            {automation.schedule.cron && (
              <span className="block text-xs text-muted-foreground">cron {automation.schedule.cron}</span>
            )}
          </Field>
          {isImport ? (
            <>
              <Field label="Last import">
                {importRow ? fmt(importRow.at) : 'never for this season'}
                {importRow && <span className="block text-xs text-muted-foreground">{relative(importRow.at, now)}</span>}
              </Field>
              <Field label="Result" className="col-span-2">
                <span className="text-xs text-muted-foreground">{importRow?.summary ?? '—'}</span>
              </Field>
            </>
          ) : (
            <>
              <Field label="Last run">
                {latest ? (
                  <>
                    {fmt(latest.startedAt)}
                    <span className="block text-xs text-muted-foreground">
                      {relative(latest.startedAt, now)} · week {latest.weekNumber} ·{' '}
                      {latest.trigger === 'manual' ? 'by a person' : 'scheduled'}
                      {lagMinutes != null && lagMinutes > 5 ? ` · ${lagMinutes} min late` : ''}
                    </span>
                  </>
                ) : (
                  'never'
                )}
              </Field>
              <Field label="Outcome">
                {outcome ? (
                  <>
                    <Badge variant={(RUN_STATUS[outcome.status] ?? RUN_STATUS.running).variant}>
                      {(RUN_STATUS[outcome.status] ?? RUN_STATUS.running).label}
                    </Badge>
                    <span className="block text-xs text-muted-foreground">
                      took {duration(latest.durationMs)}
                      {outcome.failedSteps.length > 0 && ` · failed: ${outcome.failedSteps.join(', ')}`}
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="Next scheduled">
                {nextRun ? fmt(nextRun.toISOString()) : automation.schedule.cron ? 'not while off-season' : 'manual only'}
              </Field>
            </>
          )}
        </div>

        {latest?.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="break-words">{latest.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <Field label="Job settings">
            <Chips
              items={[
                `timeout ${automation.timeoutMinutes} min`,
                `concurrency group ${automation.concurrency}`,
                `log: ${automation.evidence}`
              ]}
            />
          </Field>
          <Field label="Secrets it needs">
            <Chips items={automation.secrets} />
          </Field>
          {isImport && (
            <>
              <Field label="Pulls from"><Chips items={automation.reads} /></Field>
              <Field label="Writes"><Chips items={automation.writes} /></Field>
            </>
          )}
        </div>

        {automation.notes?.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {automation.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-muted-foreground">Run it by hand from a terminal with the ESPN cookies in the environment:</p>
            <code className="mt-1 block overflow-x-auto whitespace-pre">{automation.command}</code>
          </div>
        </div>

        {!isImport && (
          <section>
            <button
              type="button"
              onClick={() => setShowSteps((was) => !was)}
              aria-expanded={showSteps}
              className="flex items-center gap-2 text-sm font-medium"
            >
              {showSteps ? <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              Steps {latest ? 'of the last run' : ''} ({automation.steps.length} run, {automation.skips.length} skipped by flag)
            </button>
            {showSteps && (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border px-3">
                {(latest
                  ? steps
                  : automation.steps.map((name) => ({ name, ...STEPS[name], state: 'missing', text: 'no run yet', issues: [] }))
                ).map((step) => (
                  <StepRow key={step.name} step={step} showDescription />
                ))}
              </ul>
            )}
          </section>
        )}

        {!isImport && (
          <section>
            <button
              type="button"
              onClick={() => setShowHistory((was) => !was)}
              aria-expanded={showHistory}
              className="flex items-center gap-2 text-sm font-medium"
            >
              {showHistory ? <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              Run history ({runs.length})
            </button>
            {showHistory && (
              runs.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No runs attributed to this job yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border px-3">
                  {runs.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      now={now}
                      automation={automation}
                      seasonLabel={seasonNames[run.seasonId]}
                    />
                  ))}
                </ul>
              )
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
};

const FreshnessRow = ({ label, value, at, ok, note, now }) => {
  const meta = ok === null ? FRESHNESS.neutral : ok ? FRESHNESS.current : FRESHNESS.stale;
  return (
  <li className="flex items-start gap-2 py-2">
    <meta.Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.className)} aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular">{value}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {at ? `as of ${fmt(at)} (${relative(at, now)})` : 'no rows'}
        {note ? ` · ${note}` : ''}
      </p>
    </div>
  </li>
  );
};

const Freshness = ({ health, actualWeek, config, now }) => {
  if (!health) return null;
  const week = actualWeek ?? null;
  const playoffs = config?.playoffStartWeek != null && week != null && week >= config.playoffStartWeek;
  const fresh = (iso, hours) => Boolean(iso) && now - new Date(iso) <= hours * 3_600_000;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" aria-hidden="true" />
          What the tables say
        </CardTitle>
        <CardDescription>
          A run reporting success is not the same as the data being current. These are the newest rows in
          each table the jobs own, against the calendar&apos;s week {week ?? '—'}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          <FreshnessRow
            label="Power ranking snapshot"
            value={health.snapshot ? `week ${health.snapshot.week}` : 'none'}
            at={health.snapshot?.at}
            ok={week == null ? null : Boolean(health.snapshot && health.snapshot.week >= week)}
            note="power_rankings_history · weekly sync"
            now={now}
          />
          <FreshnessRow
            label="Player week stats"
            value={health.playerStats ? `through week ${health.playerStats.week}` : 'none'}
            at={health.playerStats?.at}
            ok={week == null ? null : Boolean(health.playerStats && health.playerStats.week >= week - 1)}
            note="player_week_stats · weekly sync"
            now={now}
          />
          <FreshnessRow
            label="Rosters"
            value={health.rosters ? 'present' : 'none'}
            at={health.rosters?.at}
            ok={playoffs ? null : fresh(health.rosters?.at, 36)}
            note="rosters · daily refresh"
            now={now}
          />
          <FreshnessRow
            label="Transaction counts"
            value={health.transactions ? 'present' : 'none'}
            at={health.transactions?.at}
            ok={fresh(health.transactions?.at, 48)}
            note="transactions · daily refresh"
            now={now}
          />
          <FreshnessRow
            label="NFL calendar"
            value={`${health.nflSchedule.rows} team-weeks`}
            at={health.nflSchedule.at}
            ok={health.nflSchedule.rows > 0}
            note="nfl_schedule · weekly sync"
            now={now}
          />
          <FreshnessRow
            label="NFL power index"
            value={health.nflRatings ? `week ${health.nflRatings.week}` : 'none'}
            at={health.nflRatings?.at}
            ok={week == null ? null : Boolean(health.nflRatings && health.nflRatings.week >= week)}
            note="nfl_team_ratings · weekly sync"
            now={now}
          />
          <FreshnessRow
            label={"Pick'em weeks open"}
            value={health.pickEmWeeks.length ? health.pickEmWeeks.join(', ') : 'none'}
            at={null}
            ok={week == null || playoffs ? null : health.pickEmWeeks.includes(week)}
            note="pick_em_weeks · both jobs"
            now={now}
          />
          <FreshnessRow
            label="TD parlay picks pending"
            value={String(health.pendingParlayGrades)}
            at={null}
            ok={health.pendingParlayGrades === 0 ? true : null}
            note="td_parlay_picks.scored_td is null for finished weeks · both jobs"
            now={now}
          />
        </ul>
      </CardContent>
    </Card>
  );
};

const PassiveList = () => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Zap className="h-4 w-4" aria-hidden="true" />
        Automations without a run log
      </CardTitle>
      <CardDescription>
        Triggers and functions that fire on a write, and the repository jobs. They leave no row to watch,
        so each lists the symptom that means it is not firing.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ul className="divide-y divide-border">
        {PASSIVE_AUTOMATIONS.map((item) => (
          <li key={item.id} className="py-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium">{item.name}</span>
              <span className="text-xs text-muted-foreground">{item.where}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Fires: {item.fires}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.does}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Verify:{' '}
              {/^https?:/.test(item.verify) ? (
                <a href={item.verify} target="_blank" rel="noreferrer" className="underline">
                  {item.verify}
                </a>
              ) : (
                item.verify
              )}
            </p>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
);


const OCCURRENCE = {
  ran: { label: 'ran', className: 'border-success/30 bg-success/10', dot: 'bg-success', meaning: 'A scheduled run started within six hours of this slot.' },
  due: { label: 'due', className: 'border-info/30 bg-info/10', dot: 'bg-info', meaning: 'The slot has passed; the run is still inside its three-hour grace.' },
  missed: { label: 'missed', className: 'border-destructive/40 bg-destructive/10', dot: 'bg-destructive', meaning: 'Grace is up and no run landed.' },
  idle: { label: 'exits quietly', className: 'border-border bg-muted/40', dot: 'bg-muted-foreground', meaning: 'Out of season: the cron fires, the script exits without writing.' },
  upcoming: { label: null, keyLabel: 'not run yet', className: 'border-primary/30 bg-primary/10', dot: 'bg-primary', meaning: 'Scheduled and still ahead.' }
};

const FRESHNESS = {
  current: { Icon: CheckCircle2, className: 'text-success', label: 'Current', meaning: 'The table is as up to date as the calendar week says it should be.' },
  stale: { Icon: AlertTriangle, className: 'text-warning', label: 'Behind', meaning: 'The newest row is older than the calendar expects.' },
  neutral: { Icon: Info, className: 'text-muted-foreground', label: 'Informational', meaning: 'No expectation applies right now (off-season, playoffs, or a count).' }
};

const dayLabel = (date) => new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
const dayNumber = (date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
const clock = (date) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);

/**
 * The next seven days, today first, with every scheduled run on each. Times
 * are the viewer's clock; the labels are the automations' own names so a
 * reader can find the card below.
 */
const WeekView = ({ days, now }) => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Next 7 days
        </CardTitle>
        <CardDescription>
          What is scheduled to run and when, in your time zone ({zone}). Runs already behind us today are
          marked by what the log says about them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 md:grid-cols-7" aria-label="Upcoming runs">
          {days.map((day) => (
            <li
              key={day.date.toISOString()}
              className={cn(
                'rounded-lg border p-2',
                day.isToday ? 'border-primary/50 bg-primary/5' : 'border-border'
              )}
              aria-current={day.isToday ? 'date' : undefined}
            >
              <div className="flex items-baseline justify-between gap-2 md:block">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                  {day.isToday ? 'Today' : dayLabel(day.date)}
                </p>
                <p className="text-sm font-medium tabular">{dayNumber(day.date)}</p>
              </div>
              {day.occurrences.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nothing scheduled</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {day.occurrences.map((occurrence) => {
                    const meta = OCCURRENCE[occurrence.status] ?? OCCURRENCE.upcoming;
                    const past = occurrence.at <= now;
                    return (
                      <li
                        key={`${occurrence.automationId}-${occurrence.at.toISOString()}`}
                        className={cn('rounded-md border px-2 py-1.5 text-xs', meta.className)}
                        title={`${occurrence.name} · ${occurrence.at.toUTCString()}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden="true" />
                          <span className="tabular">{clock(occurrence.at)}</span>
                          {meta.label && (
                            <span className={cn('ml-auto', past ? 'text-muted-foreground' : '')}>{meta.label}</span>
                          )}
                        </div>
                        <p className="mt-0.5 leading-snug text-foreground">{occurrence.name}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
};

const KeyRow = ({ swatch, label, meaning }) => (
  <li className="flex items-start gap-2 py-1">
    <span className="flex w-28 shrink-0 items-center">{swatch}</span>
    <div className="min-w-0">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <p className="text-xs text-muted-foreground">{meaning}</p>
    </div>
  </li>
);

const KeyGroup = ({ title, children }) => (
  <section>
    <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{title}</h3>
    <ul className="mt-1 divide-y divide-border/60">{children}</ul>
  </section>
);

/**
 * What every colour on the page means, built from the maps the page renders
 * with. Swatches are the real badge, dot or icon, not a repainted copy.
 *
 * Rendered by the settings page in its sidebar, under the section list,
 * while this dashboard is open — not by the dashboard itself — so the key
 * sits beside the page rather than pushing the first card down.
 */
export const ColourKey = () => {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 text-left"
        >
          <Chevron className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="text-base">Colour key</CardTitle>
        </button>
        {open && (
          <CardDescription>
            Green is done and right, blue is in motion or merely late, amber needs a look, red needs a
            person, grey is nothing to expect, and orange is not run yet.
          </CardDescription>
        )}
      </CardHeader>
      {open && (
        <CardContent>
          <div className="space-y-5" aria-label="Colour key">
            <KeyGroup title="Job status">
              {Object.entries(STATUS).map(([key, meta]) => (
                <KeyRow key={key} swatch={<StatusBadge status={key} />} label={meta.label} meaning={meta.meaning} />
              ))}
            </KeyGroup>
            <KeyGroup title="Run outcome">
              {Object.entries(RUN_STATUS).map(([key, meta]) => (
                <KeyRow key={key} swatch={<Badge variant={meta.variant}>{meta.label}</Badge>} label={meta.label} meaning={meta.meaning} />
              ))}
            </KeyGroup>
            <KeyGroup title="Step result">
              {Object.entries(STEP_STATE).map(([key, meta]) => (
                <KeyRow
                  key={key}
                  swatch={<meta.Icon className={cn('h-4 w-4', meta.className)} aria-hidden="true" />}
                  label={meta.label}
                  meaning={meta.meaning}
                />
              ))}
            </KeyGroup>
            <KeyGroup title="Week strip">
              {Object.entries(OCCURRENCE).map(([key, meta]) => (
                <KeyRow
                  key={key}
                  swatch={
                    <span className={cn('flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]', meta.className)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden="true" />
                      {meta.label ?? meta.keyLabel}
                    </span>
                  }
                  label={meta.label ?? meta.keyLabel}
                  meaning={meta.meaning}
                />
              ))}
            </KeyGroup>
            <KeyGroup title="Recommendation">
              {Object.entries(SEVERITY).map(([key, meta]) => (
                <KeyRow
                  key={key}
                  swatch={
                    <span className={cn('flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]', meta.className)}>
                      <meta.Icon className={cn('h-3 w-3', meta.iconClass)} aria-hidden="true" />
                      {meta.label}
                    </span>
                  }
                  label={meta.label}
                  meaning={meta.meaning}
                />
              ))}
            </KeyGroup>
            <KeyGroup title="Data freshness">
              {Object.entries(FRESHNESS).map(([key, meta]) => (
                <KeyRow
                  key={key}
                  swatch={<meta.Icon className={cn('h-4 w-4', meta.className)} aria-hidden="true" />}
                  label={meta.label}
                  meaning={meta.meaning}
                />
              ))}
            </KeyGroup>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

const AutomationsDashboard = () => {
  const report = useAutomationReport();
  const { summaries, recommendations, health, state, actualWeek, config, now, isLoading, error, season, runs } = report;
  const week = upcomingSchedule({ now, days: 7, runs, state });

  const seasonNames = season ? { [season.id]: `${season.year}` } : {};
  const counts = summaries.reduce((acc, summary) => {
    acc[summary.status] = (acc[summary.status] ?? 0) + 1;
    return acc;
  }, {});
  const problems = (counts.failed ?? 0) + (counts.missed ?? 0) + (counts.stalled ?? 0);
  const warnings = (counts.partial ?? 0) + (counts.attention ?? 0);

  return (
    <div className="space-y-6">
      <WeekView days={week} now={now} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5" aria-hidden="true" />
                Automations
              </CardTitle>
              <CardDescription>
                Every job that runs without a person: what it pulls, what it changes, whether it ran, and what
                to do when it did not. The jobs run in GitHub Actions; this page watches their log and links
                to their Run buttons.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => report.refetch()} disabled={isLoading}>
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isLoading && 'animate-spin')} aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error.message || 'Could not load the automation log.'}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Season">
              {season ? `${season.year}` : 'none'}
              <span className="block text-xs text-muted-foreground">{SEASON_STATE_COPY[state]}</span>
            </Field>
            <Field label="Calendar week">
              {config?.startDate ? `week ${actualWeek}` : '—'}
              {config?.playoffStartWeek && (
                <span className="block text-xs text-muted-foreground">playoffs from week {config.playoffStartWeek}</span>
              )}
            </Field>
            <Field label="Needs a person">
              <span className={cn('tabular', problems > 0 ? 'text-destructive' : warnings > 0 ? 'text-warning' : '')}>
                {problems + warnings}
              </span>
              <span className="block text-xs text-muted-foreground">
                {problems} failed or missed · {warnings} with step issues
              </span>
            </Field>
            <Field label="Checked">
              {fmt(now.toISOString())}
              <span className="block text-xs text-muted-foreground">refreshes every minute and on focus</span>
            </Field>
          </div>

          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Reading the run log…</p>
          ) : recommendations.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nothing to do"
              description="Every job ran on schedule and every table is as current as the calendar says it should be."
              className="py-6"
            />
          ) : (
            <section aria-label="Recommendations">
              <h3 className="mb-2 text-sm font-medium">
                Recommendations <Badge variant={problems > 0 ? 'destructive' : warnings > 0 ? 'warning' : 'secondary'}>{recommendations.length}</Badge>
              </h3>
              <ul className="space-y-2">
                {recommendations.map((rec) => (
                  <Recommendation key={rec.id} rec={rec} />
                ))}
              </ul>
            </section>
          )}
        </CardContent>
      </Card>

      {summaries.map((summary) => (
        <AutomationCard
          key={summary.automation.id}
          summary={summary}
          now={now}
          seasonNames={seasonNames}
          health={health}
        />
      ))}

      <Freshness health={health} actualWeek={config?.startDate ? actualWeek : null} config={config} now={now} />

      <PassiveList />
    </div>
  );
};

export default AutomationsDashboard;
