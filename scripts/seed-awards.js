import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const awardsList = `Non-voted-on awards:

Champion
Highest Scorer
Lowest Scorer
Regular season merchant
Survivor (lowest PA)
Highest score of the year
Lowest score of the year
Efficiency goat (optimal lineup week to week)
Waiver wire merchant (most waiver pickups)
Punishee
Swiss Cheese D (most PA)
Benchwarmer (left the most pts on bench)
INOVA (most injured players)
The "My Draft Was Fire I don't need to trade" award (least trades/waivers)
The Heartbreaker (most losses by less than 5-10 pts)
The "Should've won way more" (most avoidable losses)
The guy everyone shit on (faced the highest scorer of the week the most)
The comeback kid (most comebacks on MNF/in general)
The choke artist (most losses on MNF)
Ass but should've been good (highest PF outside of playoffs)
Most wins with less than 9 players scoring more than 0 pts.

Voted on awards:

Waiver wire demon (best waiver pickup, have player + owner for each nominee)
Worst draft award (have dropdown lists of each person's draft, DO NOT IMPLEMENT DROPDOWNS YET)
Bust of the year (player + owner for each nominee)
The Greatest Trade Deal in the History of Trade Deals (best trade of the year)
Best Trash Talker (game of the week + GC)
Most Fake Humble
Best Team Name
Worst Team Name
The Donation (who donated their buy in)
Biggest fleece
Worst trade of the year
Worst trader
Best trader/negotiator (executive of the year)
Most likely to lose round 1 this year
Most likely to make playoffs next year (hadn't made it this year)
Most likely to get punished next year
Most likely to win the championship next year
Most likely to autodraft next year`;

async function seedAwards() {
    console.log('Seeding awards...');

    // Get active season
    const { data: season, error: seasonError } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single();

    if (seasonError || !season) {
        console.error('No active season found');
        return;
    }

    console.log('Active season:', season.id);

    // Parse awards list
    const lines = awardsList.split('\n').map(l => l.trim()).filter(l => l);
    let category = 'non-voted';
    let displayOrder = 1;
    const awardsToInsert = [];

    for (const line of lines) {
        if (line.toLowerCase().includes('non-voted-on awards')) {
            category = 'non-voted';
            continue;
        }
        if (line.toLowerCase().includes('voted on awards')) {
            category = 'voted';
            continue;
        }

        awardsToInsert.push({
            season_id: season.id,
            title: line,
            category: category,
            display_order: displayOrder++,
            icon: 'Trophy' // Default icon
        });
    }

    // Insert awards
    const { error } = await supabase
        .from('awards_2025')
        .insert(awardsToInsert);

    if (error) {
        console.error('Error inserting awards:', error);
    } else {
        console.log(`Successfully inserted ${awardsToInsert.length} awards`);
    }
}

seedAwards();
