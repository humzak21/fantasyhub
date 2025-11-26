import { readFileSync } from 'fs';
import { supabaseAdmin } from './config/database.js';

async function updateStatsFunctions() {
  console.log('📝 Applying updated statistics functions...');
  
  try {
    const sql = readFileSync('./scripts/stats_functions.sql', 'utf8');
    
    // Extract individual function definitions
    const functions = [
      'get_genre_stats',
      'get_director_stats', 
      'get_films_by_decade'
    ];
    
    for (const funcName of functions) {
      const regex = new RegExp(`CREATE OR REPLACE FUNCTION ${funcName}\\(.*?\\).*?\\$\\$ LANGUAGE plpgsql;`, 'gs');
      const match = sql.match(regex);
      
      if (match && match[0]) {
        console.log(`Updating ${funcName}...`);
        const { error } = await supabaseAdmin.rpc('exec_sql', { sql: match[0] });
        if (error) {
          console.error(`Error updating ${funcName}:`, error);
        } else {
          console.log(`✅ ${funcName} updated successfully`);
        }
      }
    }
    
    // Test the functions
    console.log('\n🧪 Testing functions...');
    
    const { data: genreData, error: genreError } = await supabaseAdmin.rpc('get_genre_stats');
    console.log(`Genre stats: ${genreData?.length || 0} genres`);
    
    const { data: directorData, error: directorError } = await supabaseAdmin.rpc('get_director_stats');
    console.log(`Director stats: ${directorData?.length || 0} directors`);
    
    const { data: decadeData, error: decadeError } = await supabaseAdmin.rpc('get_films_by_decade');
    console.log(`Decade stats: ${decadeData?.length || 0} decades`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

updateStatsFunctions(); 