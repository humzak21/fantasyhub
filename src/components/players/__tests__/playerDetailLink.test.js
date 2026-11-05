import { describe, it, expect } from 'vitest';

import { PLAYER_PARAM, playerIdFrom, withPlayer, withoutPlayer } from '../playerDetailLink.js';

describe('playerDetailLink', () => {
  it('names the param', () => {
    expect(PLAYER_PARAM).toBe('player');
  });

  it('reads the open player, and a blank param as none', () => {
    expect(playerIdFrom(new URLSearchParams('player=p1&view=statistics'))).toBe('p1');
    expect(playerIdFrom(new URLSearchParams('player='))).toBeNull();
    expect(playerIdFrom(new URLSearchParams('view=statistics'))).toBeNull();
    expect(playerIdFrom(null)).toBeNull();
  });

  it('opens a player and keeps every other param', () => {
    const before = new URLSearchParams('view=statistics&tab=records');
    const next = withPlayer(before, 'p1');
    expect(next.get('player')).toBe('p1');
    expect(next.get('view')).toBe('statistics');
    expect(next.get('tab')).toBe('records');
    expect(before.has('player')).toBe(false);
  });

  it('replaces an open player', () => {
    expect(withPlayer(new URLSearchParams('player=p1'), 'p2').toString()).toBe('player=p2');
  });

  it('closes the player and keeps every other param', () => {
    const before = new URLSearchParams('view=statistics&player=p1');
    expect(withoutPlayer(before).toString()).toBe('view=statistics');
    expect(before.get('player')).toBe('p1');
  });
});
