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
  Zap
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

const STATUS = {
  healthy: { label: 'Healthy', variant: 'success', Icon: CheckCircle2 },
  running: { label: 'Running', variant: 'info', Icon: Loader2 },
  late: { label: 'Ran late', variant: 'info', Icon: Clock },
  attention: { label: 'Check issues', variant: 'warning', Icon: AlertTriangle },
  partial: { label: 'Step failed', variant: 'warning', Icon: AlertTriangle },
  missed: { label: 'Missed', variant: 'destructive', Icon: XCircle },
  failed: { label: 'Failed', variant: 'destructive', Icon: XCircle },
  stalled: { label: 'Never finished', variant: 'destructive', Icon: Hourglass },
  idle: { label: 'Idle (off-season)', variant: 'secondary', Icon: Clock },
  'no-runs': { label: 'No runs yet', variant: 'secondary', Icon: Clock }
};

const RUN_STATUS = {
  success: { label: 'Success', variant: 'success' },
  partial: { label: 'Partial', variant: 'warning' },
  failed: { label: 'Failed', variant: 'destructive' },
  running: { label: 'Running', variant: 'info' },
  stalled: { label: 'Never finished', variant: 'destructive' }
};

const STEP_STATE = {
  ok: { Icon: CheckCircle2, className: 'text-success' },
  warning: { Icon: AlertTriangle, className: 'text-warning' },
  failed: { Icon: XCircle, className: 'text-destructive' },
  skipped: { Icon: SkipForward, className: 'text-muted-foreground' },
  missing: { Icon: Hourglass, className: 'text-muted-foreground' }
};

const SEVERITY = {
  error: { Icon: XCircle, className: 'border-destructive/40 bg-destructive/10', iconClass: 'text-destructive' },
  warning: { Icon: AlertTriangle, className: 'border-warning/40 bg-warning/10', iconClass: 'text-warning' },
  info: { Icon: Info, className: 'border-info/30 bg-info/10', iconClass: 'text-info' }
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

const FreshnessRow = ({ label, value, at, ok, note, now }) => (
  <li className="flex items-start gap-2 py-2">
    {ok === null ? (
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    ) : ok ? (
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
    ) : (
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
    )}
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

const AutomationsDashboard = () => {
  const report = useAutomationReport();
  const { summaries, recommendations, health, state, actualWeek, config, now, isLoading, error, season } = report;

  const seasonNames = season ? { [season.id]: `${season.year}` } : {};
  const counts = summaries.reduce((acc, summary) => {
    acc[summary.status] = (acc[summary.status] ?? 0) + 1;
    return acc;
  }, {});
  const problems = (counts.failed ?? 0) + (counts.missed ?? 0) + (counts.stalled ?? 0);
  const warnings = (counts.partial ?? 0) + (counts.attention ?? 0);

  return (
    <div className="space-y-6">
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
