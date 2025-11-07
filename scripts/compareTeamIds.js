import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function compare() {
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id')
    .limit(1);
  const seasonId = seasons[0].id;

  // Get team IDs from teams table
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, owner')
    .eq('season_id', seasonId);

  console.log(`\nTeams table (${teams.length} teams):`);
  teams.slice(0, 3).forEach(t => console.log(`  ${t.name}: ${t.id}`));

  // Get team IDs from week 5 history
  const { data: week5 } = await supabase
    .from('power_rankings_history')
    .select('team_id, rank')
    .eq('season_id', seasonId)
    .eq('week_number', 5)
    .order('rank');

  console.log(`\nWeek 5 history (${week5.length} teams):`);
  week5.slice(0, 3).forEach(t => console.log(`  Rank ${t.rank}: ${t.team_id}`));

  // Check if IDs match
  console.log('\nID Matching:');
  const historyIds = new Set(week5.map(h => h.team_id));
  const matchCount = teams.filter(t => historyIds.has(t.id)).length;
  console.log(`${matchCount}/${teams.length} teams match`);

  if (matchCount !== teams.length) {
    console.log('\n⚠️ MISMATCH FOUND!');
    const missing = teams.filter(t => !historyIds.has(t.id));
    console.log('Teams not in history:', missing.map(t => t.name));
  }
}

compare();
