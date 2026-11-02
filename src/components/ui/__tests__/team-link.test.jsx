import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FranchiseAvatarsContext } from '../../../contexts/FranchiseAvatarsContext.jsx';
import { TeamLink } from '../team-link.jsx';

const viewer = { canOpenProfiles: true };

const renderLink = (props, children = <TeamLink {...props}>Team name</TeamLink>) =>
  render(
    <MemoryRouter>
      <FranchiseAvatarsContext.Provider
        value={{ byFranchise: new Map(), byOwner: new Map(), canOpenProfiles: viewer.canOpenProfiles }}
      >
        {children}
      </FranchiseAvatarsContext.Provider>
    </MemoryRouter>
  );

describe('TeamLink', () => {
  beforeEach(() => {
    viewer.canOpenProfiles = true;
  });

  it('opens the profile for an approved member', () => {
    renderLink({ team: { franchise_id: 'f1' }, fallbackTo: '/teams?team=1' });
    expect(screen.getByRole('link', { name: 'Team name' })).toHaveAttribute('href', '/profile/f1');
  });

  it('reads either casing of the franchise id', () => {
    renderLink({ team: { franchiseId: 'f2' } });
    expect(screen.getByRole('link', { name: 'Team name' })).toHaveAttribute('href', '/profile/f2');
  });

  it('keeps the old destination for a viewer who cannot open a profile', () => {
    viewer.canOpenProfiles = false;
    renderLink({ team: { franchise_id: 'f1' }, fallbackTo: '/teams?team=1' });
    expect(screen.getByRole('link', { name: 'Team name' })).toHaveAttribute('href', '/teams?team=1');
  });

  it('is plain text with nowhere to go', () => {
    viewer.canOpenProfiles = false;
    renderLink({ team: { franchise_id: 'f1' } });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Team name')).toBeInTheDocument();
  });

  it('is plain text for a team with no franchise', () => {
    renderLink({ team: { franchise_id: null } });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not fire a clickable row behind it', () => {
    const onRow = vi.fn();
    renderLink(
      {},
      <div onClick={onRow}>
        <TeamLink franchiseId="f1">Team name</TeamLink>
      </div>
    );

    screen.getByRole('link', { name: 'Team name' }).click();
    expect(onRow).not.toHaveBeenCalled();
  });
});
