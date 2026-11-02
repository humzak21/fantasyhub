#!/usr/bin/env node

/**
 * How far a player's week lands from his projection, by position.
 *
 * Prints the spreads behind `POSITION_SPREADS` in
 * `src/components/pickems/pickOutlook.js`, measured from this season's settled
 * weeks of `player_week_stats`. Read-only, over a public table, so it needs no
 * service key. The numbers go in by hand: a person should look at a change
 * before it moves every chip in the league. Worth re-running once mid-season.
 *
 * `actual_points` being set is what makes a row a real starter here. A settled
 * week also holds rows for players who were dropped or benched after Tuesday's
 * projection write: still `started`, with no actual, and only their projection.
 *
 * Usage: node scripts/calibrate-outlook-spreads.js [season-id]
 */

import { getAnonClient } from '../services/db/client.server.js';
import { selectAll } from '../services/db/paging.js';
import { calibrateSpreads } from '../src/components/pickems/pickOutlook.js';

async function main() {
  const client = getAnonClient();

  const seasonId =
    process.argv[2] ??
    (await client.from('v_active_season').select('id').single().then(({ data, error }) => {
      if (error) throw error;
      return data.id;
    }));

  const rows = await selectAll(() =>
    client
      .from('player_week_stats')
      .select('id, position, actual_points, projected_points')
      .eq('season_id', seasonId)
      .eq('started', true)
      .not('actual_points', 'is', null)
      .not('projected_points', 'is', null)
      .order('id')
  );

  const spreads = calibrateSpreads(
    rows.map((row) => ({
      position: row.position,
      actualPoints: row.actual_points,
      projectedPoints: row.projected_points
    }))
  );

  console.table(spreads);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
