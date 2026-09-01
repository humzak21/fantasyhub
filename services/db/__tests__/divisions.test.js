/**
 * A team's division must be its own season's.
 *
 * `teams.division_id` is a plain FK to `divisions.id`, which says only that
 * the division exists — not that it belongs to the team's season. With a
 * season picker on the standings drawer, the wrong pair is one stale cache
 * away, and a team pointed at another year's division disappears from both
 * years' standings without any error. The check lives in the data layer so
 * every caller gets it.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { assignTeamToDivision } from '../divisions.js';

const TEAM_2024 = { id: 'team-2024', season_id: 'season-2024' };
const DIVISION_2024 = { id: 41, season_id: 'season-2024' };
const DIVISION_2026 = { id: 61, season_id: 'season-2026' };

function handlers(division) {
  return {
    'teams.select': () => TEAM_2024,
    'divisions.select': () => division,
    'teams.update': ({ filters }) => ({ season_id: filters.season_id })
  };
}

describe('assignTeamToDivision', () => {
  it('writes when the division is the same season as the team', async () => {
    const ctx = makeCtx(handlers(DIVISION_2024));

    await expect(assignTeamToDivision(ctx, TEAM_2024.id, DIVISION_2024.id)).resolves.toBe(true);

    const [update] = ctx.client.callsFor('teams', 'update');
    expect(update.payload).toEqual({ division_id: DIVISION_2024.id });
    // Filtered on the team's own season as well as its id.
    expect(update.filters).toEqual({ id: TEAM_2024.id, season_id: TEAM_2024.season_id });
  });

  it('refuses a division from another season and writes nothing', async () => {
    const ctx = makeCtx(handlers(DIVISION_2026));

    await expect(assignTeamToDivision(ctx, TEAM_2024.id, DIVISION_2026.id)).rejects.toThrow(
      /different season/
    );
    expect(ctx.client.callsFor('teams', 'update')).toHaveLength(0);
  });

  it('allows unassigning without looking a division up', async () => {
    const ctx = makeCtx(handlers(DIVISION_2024));

    await expect(assignTeamToDivision(ctx, TEAM_2024.id, null)).resolves.toBe(true);

    expect(ctx.client.callsFor('divisions', 'select')).toHaveLength(0);
    const [update] = ctx.client.callsFor('teams', 'update');
    expect(update.payload).toEqual({ division_id: null });
  });
});
