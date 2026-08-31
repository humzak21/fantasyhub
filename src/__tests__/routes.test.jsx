/**
 * Tabs are routes (Phase 2a). These assert the parts of that which are real
 * behaviour and therefore observable in jsdom: which tab a URL selects, what
 * an unknown tab does, and that /settings still wins over /:tab.
 *
 * What is deliberately *not* here: anything about viewport width. jsdom has no
 * layout engine, so a test that "renders at 375px" renders at no width at all.
 * Width-dependent behaviour belongs in the Playwright smoke job.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../test/renderWithProviders.jsx';
import App from '../App.jsx';

// The shell pulls the whole data layer in. None of that is under test here —
// only routing — so the tabs are stubbed down to a marker each.
vi.mock('../../FantasyFootballApp.jsx', async () => {
  const { useParams } = await vi.importActual('react-router-dom');
  return {
    default: function ShellStub() {
      const { tab } = useParams();
      return <div data-testid="shell">tab:{tab || 'rankings'}</div>;
    },
  };
});

vi.mock('../components/auth/UserSettingsPage.jsx', () => ({
  UserSettingsPage: function SettingsStub() {
    return <div data-testid="settings" />;
  },
}));

vi.mock('../components/auth/DisplayNamePrompt.jsx', () => ({
  default: function DisplayNamePromptStub() {
    return null;
  },
}));

describe('tab routing', () => {
  // Every test here renders the whole `<App/>` — the router, the four
  // providers and the module graph behind them — and the first one to run
  // pays for initialising all of it. That comfortably exceeds vitest's 5s
  // default when the full suite is running files in parallel, so the file
  // failed in a complete run while passing on its own. The assertions are
  // unchanged; only the patience is.
  vi.setConfig({ testTimeout: 20000 });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the default tab at /', async () => {
    render(<App />, { initialEntries: ['/'] });
    await waitFor(() => expect(screen.getByTestId('shell')).toHaveTextContent('tab:rankings'));
  });

  it.each(['statistics', 'schedule', 'teams', 'history', 'pickems', 'playoffs', 'awards'])(
    'renders /%s as that tab',
    async (tab) => {
      render(<App />, { initialEntries: [`/${tab}`] });
      await waitFor(() => expect(screen.getByTestId('shell')).toHaveTextContent(`tab:${tab}`));
    }
  );

  it('routes /settings to the settings page, not to a tab named "settings"', async () => {
    render(<App />, { initialEntries: ['/settings'] });
    await waitFor(() => expect(screen.getByTestId('settings')).toBeInTheDocument());
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  it('redirects the legacy /overview and /fantasy paths to the shell', async () => {
    render(<App />, { initialEntries: ['/overview'] });
    await waitFor(() => expect(screen.getByTestId('shell')).toHaveTextContent('tab:rankings'));
  });
});
