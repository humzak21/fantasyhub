/**
 * Script to verify power rankings history data
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function verifyRankings() {
  // Get active season
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1);

  if (!seasons || seasons.length === 0) {
    console.error('No seasons found');
    return;
  }

  const seasonId = seasons[0].id;
  console.log(`Season: ${seasons[0].name} (${seasonId})\n`);

  // Check rankings history
  for (let week = 1; week <= 6; week++) {
    const { data, error } = await supabase
      .from('power_rankings_history')
      .select('team_id, rank, rank_change, previous_rank')
      .eq('season_id', seasonId)
      .eq('week_number', week)
      .order('rank', { ascending: true });

    if (error) {
      console.log(`Week ${week}: ERROR - ${error.message}`);
    } else if (!data || data.length === 0) {
      console.log(`Week ${week}: No data found`);
    } else {
      console.log(`Week ${week}: ${data.length} teams`);
      data.slice(0, 3).forEach(t => {
        console.log(`  Rank ${t.rank}: ${t.team_id.substring(0, 8)}... (change: ${t.rank_change || 0}, prev: ${t.previous_rank || 'N/A'})`);
      });
    }
  }
}

verifyRankings();
