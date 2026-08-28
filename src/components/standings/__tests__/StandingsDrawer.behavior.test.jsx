import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../../test/renderWithProviders.jsx';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StandingsDrawer from '../StandingsDrawer';

// Mock the child components
vi.mock('../StandingsDrawerTrigger', () => ({
  default: ({ onClick, isOpen }) => (
    <button 
      onClick={onClick}
      data-testid="drawer-trigger"
      aria-label={isOpen ? "Close standings" : "Open standings"}
    >
      {isOpen ? 'Close' : 'Open'} Standings
    </button>
  )
}));

vi.mock('../StandingsDrawerContent', () => ({
  default: ({ isOpen, onClose, children }) => (
    isOpen ? (
      <div data-testid="drawer-content" className="drawer-content">
        <button onClick={onClose} data-testid="close-button">Close</button>
        {children}
      </div>
    ) : null
  )
}));

vi.mock('../DrawerStandingsTable', () => ({
  default: ({ teams, divisions, loading }) => (
    <div data-testid="standings-table">
      <div>Teams: {teams?.length || 0}</div>
      <div>Divisions: {divisions?.length || 0}</div>
      {loading && <div>Loading...</div>}
    </div>
  )
}));

// jsdom has no layout engine: assigning window.innerWidth does not re-evaluate
// a single CSS media query, so a test that "simulates a 375px viewport" and then
// asserts the same things it asserts at 1024px is testing nothing. Three such
// tests lived here and passed at every width, including widths where the
// component was visibly broken. Real viewport coverage is the Playwright smoke
// job; what is left here is behaviour, which jsdom can actually observe.
describe('StandingsDrawer', () => {
  const mockProps = {
    teams: [
      { id: '1', name: 'Team 1', wins: 5, losses: 2, ties: 0 },
      { id: '2', name: 'Team 2', wins: 4, losses: 3, ties: 0 }
    ],
    divisions: [
      { id: 'div1', name: 'Division 1' }
    ],
    standings: { divisions: [], unassigned: [] },
    currentWeek: 8,
    loading: false,
    isAuthenticated: true,
    onDivisionRename: vi.fn(),
    onTeamDivisionChange: vi.fn(),
    onCreateDivision: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });


  it('renders trigger button and drawer content', () => {
    render(<StandingsDrawer {...mockProps} />);
    
    expect(screen.getByTestId('drawer-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('drawer-content')).not.toBeInTheDocument();
  });

  it('opens drawer when trigger is clicked', async () => {
    render(<StandingsDrawer {...mockProps} />);
    
    const trigger = screen.getByTestId('drawer-trigger');
    fireEvent.click(trigger);
    
    await waitFor(() => {
      expect(screen.getByTestId('drawer-content')).toBeInTheDocument();
    });
    
    expect(screen.getByTestId('standings-table')).toBeInTheDocument();
  });

  it('closes drawer when close button is clicked', async () => {
    render(<StandingsDrawer {...mockProps} />);
    
    // Open drawer
    fireEvent.click(screen.getByTestId('drawer-trigger'));
    
    await waitFor(() => {
      expect(screen.getByTestId('drawer-content')).toBeInTheDocument();
    });
    
    // Close drawer
    fireEvent.click(screen.getByTestId('close-button'));
    
    await waitFor(() => {
      expect(screen.queryByTestId('drawer-content')).not.toBeInTheDocument();
    });
  });

  it('passes correct props to DrawerStandingsTable', async () => {
    render(<StandingsDrawer {...mockProps} />);
    
    // Open drawer
    fireEvent.click(screen.getByTestId('drawer-trigger'));
    
    await waitFor(() => {
      const standingsTable = screen.getByTestId('standings-table');
      expect(standingsTable).toBeInTheDocument();
      expect(standingsTable).toHaveTextContent('Teams: 2');
      expect(standingsTable).toHaveTextContent('Divisions: 1');
    });
  });

  it('shows loading state in standings table', async () => {
    render(<StandingsDrawer {...mockProps} loading={true} />);
    
    // Open drawer
    fireEvent.click(screen.getByTestId('drawer-trigger'));
    
    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });



});