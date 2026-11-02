import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { FranchiseAvatarsContext } from '../../../contexts/FranchiseAvatarsContext.jsx';
import { TeamAvatar } from '../team-identity.jsx';

const URL = 'https://cdn.test/f1/a.webp';
const TEAM = { franchiseId: 'f1', owner_name: 'Humza Khalil' };

const mount = (team, value) =>
  render(
    <FranchiseAvatarsContext.Provider value={value}>
      <TeamAvatar team={team} data-testid="chip" />
    </FranchiseAvatarsContext.Provider>
  );

const AVATARS = {
  canOpenProfiles: true,
  byFranchise: new Map([['f1', URL]]),
  byOwner: new Map([['humza khalil', URL]])
};

describe('TeamAvatar', () => {
  it('draws the franchise avatar in place of the initials', () => {
    mount(TEAM, AVATARS);
    expect(screen.getByTestId('chip').querySelector('img')).toHaveAttribute('src', URL);
    expect(screen.queryByText('HK')).not.toBeInTheDocument();
  });

  it('finds a row with no franchise id by its owner', () => {
    mount({ owner: 'humza khalil' }, AVATARS);
    expect(screen.getByTestId('chip').querySelector('img')).toHaveAttribute('src', URL);
  });

  it('keeps the initials with no provider, which is also a masked viewer', () => {
    render(<TeamAvatar team={TEAM} data-testid="chip" />);
    expect(screen.getByTestId('chip').querySelector('img')).toBeNull();
    expect(screen.getByText('HK')).toBeInTheDocument();
  });

  it('falls back to the initials when the picture will not load', () => {
    mount(TEAM, AVATARS);
    fireEvent.error(screen.getByTestId('chip').querySelector('img'));
    expect(screen.getByText('HK')).toBeInTheDocument();
  });
});
