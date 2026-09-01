import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PlayerPoints } from '../player-points';

describe('PlayerPoints', () => {
  it('shows an actual with no label', () => {
    render(<PlayerPoints actualPoints={18.4} projectedPoints={12.1} />);

    expect(screen.getByText('18.4')).toBeInTheDocument();
    expect(screen.queryByText('proj')).not.toBeInTheDocument();
    // The projection is not shown at all once the result exists.
    expect(screen.queryByText('12.1')).not.toBeInTheDocument();
  });

  it('labels a projection', () => {
    render(<PlayerPoints actualPoints={null} projectedPoints={12.1} />);

    expect(screen.getByText('proj')).toBeInTheDocument();
    expect(screen.getByText('12.1')).toBeInTheDocument();
  });

  it('shows an actual of zero rather than falling through to the projection', () => {
    // 0 is a result — a starter who was inactive scored nothing, which is not
    // the same as having no figure. `!= null`, never a truthiness test.
    render(<PlayerPoints actualPoints={0} projectedPoints={12.1} />);

    expect(screen.getByText('0.0')).toBeInTheDocument();
    expect(screen.queryByText('proj')).not.toBeInTheDocument();
  });

  it('shows an em dash, unlabelled, when nothing is known', () => {
    render(<PlayerPoints actualPoints={null} projectedPoints={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    // "proj —" would assert a projection that does not exist.
    expect(screen.queryByText('proj')).not.toBeInTheDocument();
  });
});
