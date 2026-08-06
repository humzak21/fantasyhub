/**
 * A `render` that mounts the same provider tree `main.jsx` does.
 *
 * Before §6 the shells took `user`, `isAdmin` and `teamOwnerNames` as props and
 * owned their own week state, so a component test could render the component
 * bare. Those now come from context, and every test that renders a shell or a
 * context consumer needs the providers above it — which is why a batch of
 * suites failed with `useViewer must be used inside a <ViewerProvider>` and
 * `useDarkMode must be used within a DarkModeProvider`.
 *
 * Each call builds its own QueryClient so cached data cannot leak between
 * tests, and retries are off so a deliberately-failing query fails once.
 */

import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { DarkModeProvider } from '../contexts/DarkModeContext.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { ViewerProvider } from '../contexts/ViewerContext.jsx';
import { ViewedWeekProvider } from '../../hooks/queries/useWeek.jsx';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false }
    },
    // Tests assert on rendered output, not on console noise from expected
    // query failures.
    logger: { log: () => {}, warn: () => {}, error: () => {} }
  });
}

export function AllProviders({ children, queryClient = createTestQueryClient() }) {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <DarkModeProvider>
          <AuthProvider>
            <ViewedWeekProvider>
              <ViewerProvider>{children}</ViewerProvider>
            </ViewedWeekProvider>
          </AuthProvider>
        </DarkModeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

/** Drop-in replacement for `render` from @testing-library/react. */
export function renderWithProviders(ui, { queryClient, ...options } = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders queryClient={queryClient}>{children}</AllProviders>
    ),
    ...options
  });
}

export * from '@testing-library/react';
export { renderWithProviders as render };
