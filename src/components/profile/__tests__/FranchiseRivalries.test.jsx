import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FranchiseAvatarsContext } from '../../../contexts/FranchiseAvatarsContext.jsx';
import { FranchiseRivalries } from '../FranchiseRivalries.jsx';

const OPPONENTS = Array.from({ length: 13 }, (_, index) => ({
  opponentId: `f${index}`,
  wins: 13 - index,
  losses: index,
  ties: 0,
  totalGames: 13,
  winPct: (13 - index) / 13
}));

const FRANCHISES = OPPONENTS.map((opponent, index) => ({
  id: opponent.opponentId,
  owner_name: `Owner ${index}`,
  display_name: `Owner ${index}`
}));

const VIEWER = { user: null, isAdmin: true, teamOwnerNames: [] };

const mount = (props = {}) =>
  render(
    <MemoryRouter>
      <FranchiseAvatarsContext.Provider value={{ byFranchise: new Map(), byOwner: new Map(), canOpenProfiles: true }}>
        <FranchiseRivalries
          franchiseId="me"
          rivalries={OPPONENTS}
          franchises={FRANCHISES}
          viewer={VIEWER}
          linkH2H
          {...props}
        />
      </FranchiseAvatarsContext.Provider>
    </MemoryRouter>
  );

describe('FranchiseRivalries', () => {
  it('shows every opponent, not a top three of each', () => {
    mount();
    for (const franchise of FRANCHISES) {
      expect(screen.getByRole('link', { name: franchise.owner_name })).toHaveAttribute(
        'href',
        `/profile/${franchise.id}`
      );
    }
  });

  it('files each opponent by who has the better of the series', () => {
    mount();
    expect(screen.getByRole('heading', { name: /Best matchups 7/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Toughest opponents 6/ })).toBeInTheDocument();
  });

  it('links each series to its head-to-head only for a viewer who can open History', () => {
    const { unmount } = mount();
    expect(screen.getByRole('link', { name: 'Head-to-head with Owner 0' })).toHaveAttribute(
      'href',
      '/history?tab=headtohead&franchise1=me&franchise2=f0'
    );
    unmount();

    mount({ linkH2H: false });
    expect(screen.queryByRole('link', { name: /Head-to-head with/ })).not.toBeInTheDocument();
  });

  it('renders nothing with no opponents', () => {
    const { container } = mount({ rivalries: [] });
    expect(container).toBeEmptyDOMElement();
  });
});
