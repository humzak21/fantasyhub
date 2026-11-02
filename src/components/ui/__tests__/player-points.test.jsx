import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LiveSideNote, PlayerPoints } from '../player-points';

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

describe('PlayerPoints, live', () => {
  it('labels a figure on the field as live, not as a result or a guess', () => {
    render(<PlayerPoints actualPoints={6.2} projectedPoints={14} live="playing" />);

    expect(screen.getByText('live')).toBeInTheDocument();
    expect(screen.getByText('6.2')).toBeInTheDocument();
    expect(screen.queryByText('proj')).not.toBeInTheDocument();
  });

  it('says "so far" with nobody on the field', () => {
    render(<PlayerPoints actualPoints={12} live="between" />);
    expect(screen.getByText('so far')).toBeInTheDocument();
  });

  it('falls back to the projection until there is a figure', () => {
    render(<PlayerPoints actualPoints={null} projectedPoints={14} live="playing" />);

    expect(screen.getByText('proj')).toBeInTheDocument();
    expect(screen.queryByText('live')).not.toBeInTheDocument();
  });
});

describe('LiveSideNote', () => {
  it('says what a side has left', () => {
    render(<LiveSideNote total={{ liveState: 'playing', yetToPlay: 2 }} projected={132.84} />);
    expect(screen.getByText('2 yet to play · proj 132.8')).toBeInTheDocument();
  });

  it('renders nothing before a lineup is under way, or after it has finished', () => {
    const { container } = render(
      <>
        <LiveSideNote total={{ total: 100, isProjected: true }} projected={100} />
        <LiveSideNote total={{ liveState: 'done', yetToPlay: 0 }} projected={100} />
      </>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
