/**
 * The automation dashboard on the settings page.
 *
 * Worth pinning: it reads through `getDb().syncRuns`, attributes rows to the
 * right job, surfaces a failure as a recommendation with the workflow link,
 * and shows the per-step results of the last run when asked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor, within } from '../../../test/renderWithProviders.jsx';

const SEASON = {
  id: 's1',
  year: 2026,
  isActive: true,
  isCompleted: false,
  startDate: '2026-09-08',
  timezone: 'America/New_York',
  regularSeasonWeeks: 14,
  playoffWeeks: 3,
  weekCount: 17,
  espnSeasonYear: 2026,
  espnLeagueId: '12345',
  teams: []
};

const RUNS = [
  {
    id: 'daily-1',
    seasonId: 's1',
    weekNumber: 2,
    status: 'success',
    trigger: 'cron',
    startedAt: '2026-09-16T16:41:00Z',
    finishedAt: '2026-09-16T16:41:20Z',
    durationMs: 20_000,
    error: null,
    steps: {
      scores: { skipped: 'flag' },
      rosters: { ok: true },
      snapshot: { skipped: 'flag' },
      nflRatings: { skipped: 'flag' },
      pickEmWeek: { id: 'pw', created: false },
      nflSchedule: { skipped: 'flag' },
      playerStats: { skipped: 'flag' },
      finalizePrev: { skipped: 'flag' },
      parlayGrades: { tds: 0, noTds: 0, graded: 0, skipped: {}, konaRecovered: 0 },
      transactions: { errors: [], updated: 14 }
    }
  },
  {
    id: 'weekly-1',
    seasonId: 's1',
    weekNumber: 2,
    status: 'failed',
    trigger: 'cron',
    startedAt: '2026-09-15T10:02:00Z',
    finishedAt: '2026-09-15T10:02:05Z',
    durationMs: 5_000,
    error: 'ESPN responded 401 Unauthorized',
    steps: { pickEmWeek: { id: 'pw', created: true } }
  }
];

const HEALTH = {
  snapshot: { week: 2, at: '2026-09-15T10:03:20Z' },
  playerStats: { week: 2, at: '2026-09-15T10:03:10Z' },
  rosters: { at: '2026-09-16T16:41:10Z' },
  transactions: { at: '2026-09-16T16:41:15Z' },
  nflSchedule: { rows: 576, at: '2026-09-15T10:03:15Z' },
  nflRatings: { week: 2, at: '2026-09-15T10:03:16Z' },
  pickEmWeeks: [1, 2],
  pendingParlayGrades: 0,
  scheduleImport: { at: '2026-08-20T14:00:00Z', summary: 'teams: 0 added / 14 updated · games: 98 added' }
};

const syncRuns = {
  getSyncRuns: vi.fn(async () => RUNS),
  getAutomationHealth: vi.fn(async () => HEALTH)
};

// `getContext` is stubbed as well as `getDb`: `useActiveSeason` clears the
// data layer's season memo through it before fetching, and the real one
// builds a Supabase client from env vars the unit-test job does not have.
// Without the stub the season query throws, the page reads "no active
// season", and every assertion that needs the calendar fails on CI only.
vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getContext: () => ({ client: null, seasonsCache: new Map(), activeSeasonId: null }),
  getDb: () => ({
    syncRuns,
    seasons: { getActiveSeason: async () => SEASON },
    users: { isParlayCommissioner: async () => false, isApprovedMember: async () => true }
  })
}));

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({
    user: { id: 'admin-1', user_metadata: { name: 'Humza Khalil' } },
    isAuthenticated: true,
    isAdmin: true,
    loading: false
  })
}));

const { default: AutomationsDashboard, ColourKey } = await import('../AutomationsDashboard.jsx');

// Real timers on purpose. TanStack Query schedules its fetches and
// notifications on timers, and the health read waits on the season read, so
// under fake timers the second hop stalled on CI's slower runner and the page
// rendered "no active season" before findBy gave up. Nothing asserted here
// depends on the clock: the fixtures are a failed weekly run and a daily run
// told apart by their skip flags, and those read the same on any date.
beforeEach(() => {
  vi.clearAllMocks();
  syncRuns.getSyncRuns.mockResolvedValue(RUNS);
  syncRuns.getAutomationHealth.mockResolvedValue(HEALTH);
});

describe('AutomationsDashboard', () => {
  it('lists every automation and reads the log through the db layer', async () => {
    renderWithProviders(<AutomationsDashboard />);

    // Each job's name appears on its card and again in the week strip.
    expect((await screen.findAllByText('Weekly ESPN sync')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Daily ESPN refresh').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Season schedule import')).toBeInTheDocument();
    expect(syncRuns.getSyncRuns).toHaveBeenCalledWith({ seasonId: null, limit: 40 });
    // The health read waits on the season read, and `throughWeek` is derived
    // from today's date against the fixture's start date, so only the keys
    // that do not move are pinned.
    await waitFor(() =>
      expect(syncRuns.getAutomationHealth).toHaveBeenCalledWith(
        expect.objectContaining({ seasonId: 's1', seasonYear: 2026 })
      )
    );
  });

  it('turns the failed weekly run into a recommendation with the workflow link', async () => {
    renderWithProviders(<AutomationsDashboard />);

    const recs = await screen.findByRole('region', { name: /recommendations/i });
    expect(within(recs).getByText(/Weekly ESPN sync failed: ESPN rejected the league credentials/)).toBeInTheDocument();
    expect(within(recs).getByRole('link', { name: /run weekly espn sync/i }))
      .toHaveAttribute('href', 'https://github.com/humzak21/fantasyhub/actions/workflows/sync-week.yml');
    expect(within(recs).getByRole('link', { name: /update repository secrets/i })).toBeInTheDocument();
    expect(within(recs).getByText('npm run sync-week')).toBeInTheDocument();
  });

  it('attributes the daily row to the daily job and shows its steps on request', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AutomationsDashboard />);

    // The label says "of the last run" only once the runs have loaded; the
    // card titles render from the static catalog before that.
    const buttons = await screen.findAllByRole('button', { name: /steps of the last run/i });
    // Weekly card first, daily second; both have a last run.
    await user.click(buttons[1]);

    expect(screen.getByText('rosters rewritten from ESPN')).toBeInTheDocument();
    expect(screen.getByText('14 teams updated')).toBeInTheDocument();
    expect(screen.queryByText('skipped by flag')).not.toBeInTheDocument();
  });

  it('opens with the next seven days and names the jobs as the cards do', async () => {
    renderWithProviders(<AutomationsDashboard />);

    const strip = await screen.findByRole('list', { name: /upcoming runs/i });
    expect(within(strip).getByText('Today')).toBeInTheDocument();
    expect(within(strip).getAllByText(/^(Today|Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)).toHaveLength(7);
    // Seven daily refreshes over seven days, labelled with the card's name.
    expect(within(strip).getAllByText('Daily ESPN refresh')).toHaveLength(7);
    expect(within(strip).getAllByText('Weekly ESPN sync')).toHaveLength(1);
    // The strip sits above the Automations card, whose header holds Refresh.
    const refresh = screen.getByRole('button', { name: /refresh/i });
    expect(strip.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not render the colour key itself; the settings sidebar does', async () => {
    renderWithProviders(<AutomationsDashboard />);
    await screen.findByRole('list', { name: /upcoming runs/i });
    expect(screen.queryByLabelText('Colour key')).not.toBeInTheDocument();
  });

  it('exports a colour key built from the same states the page renders, stacked in one column', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ColourKey />);

    const key = screen.getByLabelText('Colour key');
    expect(key.className).not.toMatch(/grid-cols/);
    for (const label of ['Healthy', 'Ran late', 'Check issues', 'Step failed', 'Missed', 'Failed', 'Never finished', 'Idle (off-season)', 'No runs yet']) {
      expect(within(key).getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
    expect(within(key).getAllByText('not run yet').length).toBeGreaterThanOrEqual(1);
    expect(within(key).getByText('Not reached')).toBeInTheDocument();
    expect(within(key).getByText('Behind')).toBeInTheDocument();

    // It folds away, and comes back.
    await user.click(screen.getByRole('button', { name: /colour key/i }));
    expect(screen.queryByLabelText('Colour key')).not.toBeInTheDocument();
  });

  it('shows what the tables say', async () => {
    renderWithProviders(<AutomationsDashboard />);

    expect(await screen.findByText('What the tables say')).toBeInTheDocument();
    expect(screen.getByText('576 team-weeks')).toBeInTheDocument();
    expect(screen.getByText('Power ranking snapshot')).toBeInTheDocument();
  });
});
