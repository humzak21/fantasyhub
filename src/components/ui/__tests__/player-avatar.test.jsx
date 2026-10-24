/**
 * JITS-47: the avatar and the logo never show a broken image, and never move
 * the row: a fixed box, a lazy image, and a fallback for every missing case.
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { PlayerAvatar } from '../player-avatar.jsx';
import { NflTeamLogo } from '../nfl-team-logo.jsx';

describe('PlayerAvatar', () => {
  it("draws the player's headshot, lazily, in a fixed box", () => {
    const { container } = render(<PlayerAvatar name="Ja'Marr Chase" espnPlayerId={4362628} size={28} />);
    const box = container.firstChild;
    expect(box).toHaveStyle({ width: '28px', height: '28px' });
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img.getAttribute('src')).toContain('/headshots/nfl/players/full/4362628.png');
    // Hidden until it loads, so nothing shows through a transparent face.
    expect(img).toHaveClass('opacity-0');
    fireEvent.load(img);
    expect(img).not.toHaveClass('opacity-0');
  });

  it('falls back to initials when the CDN has no headshot', () => {
    const { container } = render(<PlayerAvatar name="Ja'Marr Chase" espnPlayerId={99999999} />);
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('JC');
  });

  it('shows initials straight away for a free-text pick', () => {
    const { container } = render(<PlayerAvatar name="Some Goal-line Back" espnPlayerId={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('SB');
  });

  it("shows a defence's team logo instead of a face", () => {
    const { container } = render(<PlayerAvatar name="Jets D/ST" espnPlayerId={-16020} position="D/ST" team="NYJ" showTeam />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toContain('/teamlogos/nfl/500/nyj.png');
  });

  it("finds a defence's logo from its ESPN id when the row has no team", () => {
    const { container } = render(<PlayerAvatar name="Titans D/ST" espnPlayerId={-16010} position="D/ST" />);
    expect(container.querySelector('img').getAttribute('src')).toContain('/teamlogos/nfl/500/ten.png');
  });

  it('carries a team badge when asked', () => {
    const { container } = render(<PlayerAvatar name="Patrick Mahomes" espnPlayerId={3139477} team="KC" showTeam />);
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs.some((src) => src.includes('/headshots/'))).toBe(true);
    expect(srcs.some((src) => src.includes('/teamlogos/nfl/500/kc.png'))).toBe(true);
  });

  it('is hidden from screen readers, since the name is beside it', () => {
    const { container } = render(<PlayerAvatar name="A B" espnPlayerId={1} />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('NflTeamLogo', () => {
  it('keeps its box when the team is unknown or the logo fails', () => {
    const { container, rerender } = render(<NflTeamLogo team="XYZ" size={14} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstChild).toHaveStyle({ width: '14px', height: '14px' });

    rerender(<NflTeamLogo team="BUF" size={14} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('width', '14');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstChild).toHaveStyle({ width: '14px' });
  });

  it('names the team when it stands for it', () => {
    const { getByAltText } = render(<NflTeamLogo team="wsh" label />);
    expect(getByAltText('WAS')).toBeInTheDocument();
  });
});
