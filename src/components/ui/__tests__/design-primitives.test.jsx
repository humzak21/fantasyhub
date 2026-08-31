import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Trophy } from 'lucide-react';

import { NumberText, RecordText } from '../number-text';
import { RankBadge } from '../rank-badge';
import { StreakChip } from '../streak-chip';
import { StatCard } from '../stat-card';
import { EmptyState } from '../empty-state';
import { TeamIdentity, TeamAvatar } from '../team-identity';
import { PageHeader } from '../../layout/PageHeader';
import { getTeamColor } from '../../../utils/teamColors';

// These are presentational and consume no context, so a bare render is
// correct here — renderWithProviders is for components that read
// ViewerContext, ViewedWeek or the query client.

describe('NumberText', () => {
  it('formats by variant so callers do not choose a precision', () => {
    render(<NumberText value={86.666} variant="percent" data-testid="n" />);
    expect(screen.getByTestId('n')).toHaveTextContent('86.7%');
  });

  it('is tabular, which is the whole reason it exists', () => {
    render(<NumberText value={1} data-testid="n" />);
    expect(screen.getByTestId('n').className).toContain('tabular');
  });

  it('colours by sign only when asked', () => {
    const { rerender } = render(<NumberText value={-5} variant="delta" data-testid="n" />);
    expect(screen.getByTestId('n').className).not.toContain('text-destructive');

    rerender(<NumberText value={-5} variant="delta" emphasis="signed" data-testid="n" />);
    expect(screen.getByTestId('n').className).toContain('text-destructive');

    rerender(<NumberText value={5} variant="delta" emphasis="signed" data-testid="n" />);
    expect(screen.getByTestId('n').className).toContain('text-success');
  });

  it('leaves zero uncoloured', () => {
    render(<NumberText value={0} variant="delta" emphasis="signed" data-testid="n" />);
    const el = screen.getByTestId('n');
    expect(el.className).not.toContain('text-success');
    expect(el.className).not.toContain('text-destructive');
  });

  it('renders a record without a sign colour', () => {
    render(<RecordText wins={13} losses={2} data-testid="r" />);
    expect(screen.getByTestId('r')).toHaveTextContent('13–2');
  });
});

describe('RankBadge', () => {
  it('shows the rank as its content', () => {
    render(<RankBadge rank={7} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('describes movement in words for a screen reader', () => {
    render(<RankBadge rank={4} delta={2} />);
    expect(screen.getByText(/2 places up from last week/i)).toBeInTheDocument();
  });

  it('says unchanged rather than showing a bare zero', () => {
    render(<RankBadge rank={4} delta={0} />);
    expect(screen.getByText(/unchanged from last week/i)).toBeInTheDocument();
  });

  it('omits movement entirely when there is none to report', () => {
    const { container } = render(<RankBadge rank={4} />);
    expect(container.textContent).toBe('4');
  });
});

describe('StreakChip', () => {
  it('labels a winning streak', () => {
    render(<StreakChip streak={{ type: 'win', length: 3 }} data-testid="s" />);
    expect(screen.getByTestId('s')).toHaveTextContent('W3');
    expect(screen.getByTestId('s').className).toContain('text-success');
  });

  it('renders nothing when there is no streak', () => {
    const { container } = render(<StreakChip streak={{ type: 'none' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TeamIdentity', () => {
  const team = { franchiseId: 4, name: 'Lightskin Empire', ownerName: 'Humza Khalil', wins: 10, losses: 6 };

  it('shows the team name, and the owner only when asked', () => {
    const { rerender } = render(<TeamIdentity team={team} />);
    expect(screen.getByText('Lightskin Empire')).toBeInTheDocument();
    expect(screen.queryByText('Humza Khalil')).not.toBeInTheDocument();

    rerender(<TeamIdentity team={team} showOwner />);
    expect(screen.getByText('Humza Khalil')).toBeInTheDocument();
  });

  it('carries the franchise colour, so the chip matches the chart series', () => {
    const { container } = render(<TeamAvatar team={team} />);
    expect(container.firstChild.className).toContain(getTeamColor(team).text);
  });

  it('builds initials from the owner, which survives a team rename', () => {
    render(<TeamAvatar team={team} data-testid="a" />);
    expect(screen.getByTestId('a')).toHaveTextContent('HK');
  });

  it('marks the viewer\'s own team', () => {
    render(<TeamIdentity team={team} isViewer />);
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('renders nothing without a team rather than throwing', () => {
    const { container } = render(<TeamIdentity team={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('StatCard', () => {
  it('labels the figure and formats it', () => {
    render(<StatCard label="League PPG" value={112.86} format="points" icon={Trophy} />);
    expect(screen.getByText('League PPG')).toBeInTheDocument();
    expect(screen.getByText('112.9')).toBeInTheDocument();
  });

  it('accepts a ready-made node for the value', () => {
    render(<StatCard label="Total games" value="111" footer="Completed" />);
    expect(screen.getByText('111')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('uses literal accent classes, not interpolated ones', () => {
    // The cards this replaces built `bg-${color}-50` at runtime, which Tailwind
    // never generated.
    const { container } = render(<StatCard label="x" value="1" accent="success" />);
    expect(container.innerHTML).not.toMatch(/\$\{/);
  });
});

describe('EmptyState', () => {
  it('states what is missing and what to do about it', () => {
    render(
      <EmptyState
        icon={Trophy}
        title="No games yet"
        description="Games appear once the first week syncs."
        action={<button type="button">Sync now</button>}
      />
    );
    expect(screen.getByText('No games yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('renders one h1 per page, with its actions', () => {
    render(
      <PageHeader
        title="Power Rankings"
        description="Week 17"
        actions={<button type="button">Advanced</button>}
      />
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Power Rankings');
    expect(screen.getByRole('button', { name: 'Advanced' })).toBeInTheDocument();
  });

  it('puts a toolbar row below the title block', () => {
    render(
      <PageHeader title="Statistics">
        <div data-testid="filters">filters</div>
      </PageHeader>
    );
    expect(screen.getByTestId('filters')).toBeInTheDocument();
  });
});
