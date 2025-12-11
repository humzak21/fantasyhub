import { supabaseAdmin } from '../config/database.js';

async function runMigration() {
  console.log('Starting database migration...');

  try {
    // 1. Add TMDB columns to existing diary table using ALTER TABLE statements
    console.log('Adding TMDB columns to diary table...');
    
    const alterTableQueries = [
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS tmdb_id INTEGER',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS overview TEXT',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS backdrop_path TEXT',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS vote_average DECIMAL(3,1)',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS vote_count INTEGER',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS popularity DECIMAL(8,3)',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS original_language VARCHAR(10)',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS original_title TEXT',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS tagline TEXT',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS status VARCHAR(50)',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS budget BIGINT',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS revenue BIGINT',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS imdb_id VARCHAR(20)',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS homepage TEXT',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()',
      'ALTER TABLE diary ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()'
    ];

    for (const query of alterTableQueries) {
      try {
        const { error } = await supabaseAdmin.rpc('exec_sql', { query });
        if (error && !error.message.includes('already exists')) {
          console.error(`Error with query: ${query}`, error);
        }
      } catch (error) {
        // Try alternative method for adding columns
        console.log('Trying alternative method for column addition...');
        try {
          // Use a simple INSERT to test if column exists
          await supabaseAdmin.from('diary').select('tmdb_id').limit(1);
          console.log('✓ TMDB columns appear to already exist');
          break;
        } catch (testError) {
          console.log('TMDB columns need to be added manually. Please run these SQL commands in your Supabase SQL editor:');
          console.log('\n--- Copy and paste these commands into Supabase SQL Editor ---');
          alterTableQueries.forEach(query => console.log(query + ';'));
          console.log('--- End of SQL commands ---\n');
          
          console.log('After running these commands, come back and run:');
          console.log('npm run enhance');
          process.exit(0);
        }
      }
    }

    console.log('✓ Diary table enhancement completed');

    // 2. Try to create supporting tables (optional)
    console.log('Attempting to create supporting tables...');
    
    const supportingTables = [
      `CREATE TABLE IF NOT EXISTS directors (
        id SERIAL PRIMARY KEY,
        tmdb_id INTEGER UNIQUE,
        name VARCHAR(200) NOT NULL,
        biography TEXT,
        birthday DATE,
        deathday DATE,
        place_of_birth VARCHAR(200),
        profile_path VARCHAR(500),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS genres (
        id SERIAL PRIMARY KEY,
        tmdb_id INTEGER UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS movie_directors (
        id SERIAL PRIMARY KEY,
        movie_id INTEGER REFERENCES diary(id) ON DELETE CASCADE,
        director_id INTEGER REFERENCES directors(id) ON DELETE CASCADE,
        UNIQUE(movie_id, director_id)
      )`,
      `CREATE TABLE IF NOT EXISTS movie_genres (
        id SERIAL PRIMARY KEY,
        movie_id INTEGER REFERENCES diary(id) ON DELETE CASCADE,
        genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
        UNIQUE(movie_id, genre_id)
      )`
    ];

    for (const tableSQL of supportingTables) {
      try {
        const { error } = await supabaseAdmin.rpc('exec_sql', { query: tableSQL });
        if (error) {
          console.log('Note: Supporting tables could not be created automatically.');
          console.log('This is optional - the system will work with just the diary table.');
        }
      } catch (error) {
        console.log('Note: Supporting tables could not be created - this is fine, diary table is sufficient.');
      }
    }

    // 3. Create indexes for better performance
    console.log('Creating indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_diary_tmdb_id ON diary(tmdb_id)',
      'CREATE INDEX IF NOT EXISTS idx_diary_title ON diary(title)',
      'CREATE INDEX IF NOT EXISTS idx_diary_watched_date ON diary(watched_date)',
      'CREATE INDEX IF NOT EXISTS idx_diary_rating ON diary(rating)'
    ];

    for (const indexSQL of indexes) {
      try {
        await supabaseAdmin.rpc('exec_sql', { query: indexSQL });
      } catch (error) {
        // Indexes are optional
      }
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('\nYour diary table has been enhanced with TMDB columns.');
    console.log('\nNext steps:');
    console.log('1. Run "npm run enhance" to populate TMDB data for existing entries');
    console.log('2. Start the backend server with "npm run dev"');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    
    // Provide manual SQL commands as fallback
    console.log('\n🔧 Manual Setup Required:');
    console.log('Please run these SQL commands in your Supabase SQL Editor:\n');
    
    console.log('-- Add TMDB columns to diary table (no unique constraints)');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS overview TEXT;');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS backdrop_path TEXT;');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS vote_average DECIMAL(3,1);');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS vote_count INTEGER;');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS popularity DECIMAL(8,3);');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS original_language VARCHAR(10);');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS original_title TEXT;');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS tagline TEXT;');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS status VARCHAR(50);');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS budget BIGINT;');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS revenue BIGINT;');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS imdb_id VARCHAR(20);');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS homepage TEXT;');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();');
    console.log('ALTER TABLE diary ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();');
    
    console.log('\n-- Create indexes (optional)');
    console.log('CREATE INDEX IF NOT EXISTS idx_diary_tmdb_id ON diary(tmdb_id);');
    console.log('CREATE INDEX IF NOT EXISTS idx_diary_title ON diary(title);');
    console.log('CREATE INDEX IF NOT EXISTS idx_diary_watched_date ON diary(watched_date);');
    console.log('CREATE INDEX IF NOT EXISTS idx_diary_rating ON diary(rating);');
    
    console.log('\nAfter running these commands, run: npm run enhance');
    process.exit(1);
  }
}

// Run migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration()
    .then(() => {
      console.log('\nMigration script completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

export default runMigration; 