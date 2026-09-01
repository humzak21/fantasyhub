import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { OpponentChip } from '../opponent-chip';

/**
 * The whole point of this component is the distinction between "off this week"
 * and "we have no calendar entry for this team". A chip that guessed would
 * tell a manager their starter is on a bye when he is playing, so the null
 * case is asserted as hard as the positive ones.
 */
describe('OpponentChip', () => {
  it('renders nothing for a missing entry', () => {
    const { container } = render(<OpponentChip entry={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an entry with no opponent abbreviation', () => {
    // A row exists but the pro team id is one we cannot name. Still not a bye.
    const { container } = render(
      <OpponentChip entry={{ bye: false, isHome: true, opponentAbbrev: null }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "vs" at home and "@" away', () => {
    const { rerender } = render(
      <OpponentChip entry={{ bye: false, isHome: true, opponentAbbrev: 'BUF' }} />
    );
    expect(screen.getByText('vs BUF')).toBeInTheDocument();

    rerender(<OpponentChip entry={{ bye: false, isHome: false, opponentAbbrev: 'KC' }} />);
    expect(screen.getByText('@ KC')).toBeInTheDocument();
  });

  it('renders BYE, and only colours it when asked to warn', () => {
    const bye = { bye: true, isHome: false, opponentAbbrev: null };

    const { rerender } = render(<OpponentChip entry={bye} />);
    expect(screen.getByText('BYE').className).toContain('text-muted-foreground');

    rerender(<OpponentChip entry={bye} warnOnBye />);
    expect(screen.getByText('BYE').className).toContain('text-warning');
  });
});
