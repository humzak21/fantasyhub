import { supabaseAdmin } from '../config/database.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testStatsDatabase() {
  console.log('🧪 Testing statistics database functions...');

  try {
    // Test a few key functions to make sure they work
    console.log('\n🔍 Testing key functions...');
    
    try {
      console.log('  Testing get_dashboard_stats...');
      const { data: dashboardData, error: dashboardError } = await supabaseAdmin.rpc('get_dashboard_stats');
      if (dashboardError) throw dashboardError;
      console.log('  ✅ Dashboard stats function works');
      console.log(`     Sample: ${dashboardData?.[0]?.total_films || 0} total films`);
      
      console.log('  Testing get_rating_distribution...');
      const { data: ratingData, error: ratingError } = await supabaseAdmin.rpc('get_rating_distribution');
      if (ratingError) throw ratingError;
      console.log('  ✅ Rating distribution function works');
      console.log(`     Sample: ${ratingData?.length || 0} rating categories`);
      
      console.log('  Testing get_genre_stats...');
      const { data: genreData, error: genreError } = await supabaseAdmin.rpc('get_genre_stats');
      if (genreError) throw genreError;
      console.log('  ✅ Genre stats function works');
      console.log(`     Sample: ${genreData?.length || 0} genres found`);
      
      console.log('  Testing get_films_per_year...');
      const { data: yearData, error: yearError } = await supabaseAdmin.rpc('get_films_per_year');
      if (yearError) throw yearError;
      console.log('  ✅ Films per year function works');
      console.log(`     Sample: ${yearData?.length || 0} years of data`);
      
      console.log('\n🎉 All test functions executed successfully!');
      console.log('\n🚀 Statistics system is ready!');
      
      return true;
      
    } catch (testError) {
      console.error('\n⚠️  Function test failed:', testError.message);
      console.log('\n🔧 This usually means:');
      console.log('   1. Functions were not created successfully');
      console.log('   2. There might be a syntax error in the SQL');
      console.log('   3. Your database schema might be different than expected');
      console.log('\n📋 Troubleshooting:');
      console.log('   1. Check Supabase Dashboard → SQL Editor for any error messages');
      console.log('   2. Verify your diary table has the expected columns');
      console.log('   3. Make sure you copied the ENTIRE stats_functions.sql file');
      
      return false;
    }

  } catch (error) {
    console.error('❌ Failed to test statistics database:', error);
    return false;
  }
}

async function setupStatsDatabase() {
  console.log('🚀 Setting up statistics database functions...');

  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'stats_functions.sql');
    const sqlContent = readFileSync(sqlFilePath, 'utf-8');

    console.log('📄 SQL file loaded successfully');

    // Since manual creation is required, skip SQL execution and go directly to testing
    console.log('📝 Skipping automatic SQL execution (manual creation required)');
    console.log('\n📋 Manual Setup Steps (if not done already):');
    console.log('   1. Open your Supabase project dashboard');
    console.log('   2. Go to SQL Editor');
    console.log('   3. Create a new query');
    console.log('   4. Copy the entire contents of: backend/scripts/stats_functions.sql');
    console.log('   5. Paste and execute the SQL');
    
    // Test if functions are working
    const functionsWork = await testStatsDatabase();
    
    if (functionsWork) {
      console.log('\n📖 Available Functions:');
      console.log('   • get_dashboard_stats() - Key overview metrics');
      console.log('   • get_rating_distribution() - Rating histogram');
      console.log('   • get_films_per_year() - Annual watch counts');
      console.log('   • get_genre_stats() - Genre analysis');
      console.log('   • get_director_stats() - Director analysis');
      console.log('   • get_day_of_week_patterns() - Weekly patterns');
      console.log('   • get_seasonal_patterns() - Seasonal analysis');
      console.log('   • get_rewatch_stats() - Rewatch behavior');
      console.log('   • get_runtime_stats() - Runtime analysis');
      console.log('   • get_films_by_decade() - Decade breakdown');
      console.log('   • get_watching_gaps_analysis() - Viewing patterns');
      console.log('   • And many more!');

      console.log('\n🚀 Next steps:');
      console.log('   1. Start your backend server: npm run dev');
      console.log('   2. Test the API endpoints: GET /api/stats/dashboard');
      console.log('   3. Integrate with your frontend components');
      
      console.log('\n📡 API Endpoints Available:');
      console.log('   GET /api/stats/dashboard         - Overview stats');
      console.log('   GET /api/stats/basic            - Basic metrics');
      console.log('   GET /api/stats/rating-distribution - Rating histogram');
      console.log('   GET /api/stats/genres           - Genre analysis');
      console.log('   GET /api/stats/directors        - Director stats');
      console.log('   GET /api/stats/comprehensive    - All statistics');
    }

  } catch (error) {
    console.error('❌ Failed to setup statistics database:', error);
    console.error('\nTroubleshooting:');
    console.error('   1. Make sure your Supabase connection is working');
    console.error('   2. Verify you have admin privileges on the database');
    console.error('   3. Check that the diary table exists and has data');
    console.error('   4. Try the manual SQL execution approach above');
  }
}

// Add a function to verify the current database state
async function verifyDatabaseState() {
  console.log('\n🔍 Verifying database state...');
  
  try {
    // Check if diary table exists and has data
    const { data: diaryData, error: diaryError } = await supabaseAdmin
      .from('diary')
      .select('count', { count: 'exact', head: true });
    
    if (diaryError) {
      console.error('❌ Error accessing diary table:', diaryError.message);
      return false;
    }
    
    console.log(`✅ Diary table found with ${diaryData || 0} entries`);
    
    // Check if we can access a few key columns
    const { data: sampleData, error: sampleError } = await supabaseAdmin
      .from('diary')
      .select('title, rating, watched_date, director, genres, runtime')
      .limit(1);
    
    if (sampleError) {
      console.error('❌ Error accessing diary columns:', sampleError.message);
      return false;
    }
    
    if (sampleData && sampleData.length > 0) {
      const sample = sampleData[0];
      console.log('✅ Sample diary entry:');
      console.log(`   Title: ${sample.title || 'N/A'}`);
      console.log(`   Rating: ${sample.rating || 'N/A'}`);
      console.log(`   Watch Date: ${sample.watched_date || 'N/A'}`);
      console.log(`   Director: ${sample.director || 'N/A'}`);
      console.log(`   Genres: ${sample.genres || 'N/A'}`);
      console.log(`   Runtime: ${sample.runtime || 'N/A'}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database verification failed:', error.message);
    return false;
  }
}

// Main execution
async function main() {
  console.log('🎬 Movie Tracker Statistics Setup');
  console.log('===================================');
  
  // Verify database state first
  const dbOk = await verifyDatabaseState();
  if (!dbOk) {
    console.error('\n❌ Database verification failed. Please check your Supabase configuration.');
    process.exit(1);
  }
  
  // Setup statistics functions
  await setupStatsDatabase();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { setupStatsDatabase, verifyDatabaseState }; 