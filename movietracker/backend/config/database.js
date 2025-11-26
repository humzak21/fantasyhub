import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load .env file if we're not on Railway (which sets RAILWAY_ENVIRONMENT)
if (!process.env.RAILWAY_ENVIRONMENT) {
  dotenv.config();
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check if Supabase is configured
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('⚠️  Supabase environment variables not configured. Database features will be disabled.');
}

// Client for regular operations (respects RLS policies)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Admin client for database operations that bypass RLS (use carefully)
export const supabaseAdmin = isSupabaseConfigured && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Database schema definition - using existing diary table structure
export const schema = {
  // Add missing columns to existing diary table
  enhanceDiary: `
    -- Add TMDB-related columns if they don't exist
    DO $$ 
    BEGIN
      -- Add tmdb_id column (no unique constraint - duplicates allowed)
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='tmdb_id') THEN
        ALTER TABLE diary ADD COLUMN tmdb_id INTEGER;
      END IF;
      
      -- Add overview column for movie descriptions
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='overview') THEN
        ALTER TABLE diary ADD COLUMN overview TEXT;
      END IF;
      
      -- Add backdrop_path column for background images
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='backdrop_path') THEN
        ALTER TABLE diary ADD COLUMN backdrop_path TEXT;
      END IF;
      
      -- Add vote_average for TMDB ratings
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='vote_average') THEN
        ALTER TABLE diary ADD COLUMN vote_average DECIMAL(3,1);
      END IF;
      
      -- Add vote_count for TMDB vote count
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='vote_count') THEN
        ALTER TABLE diary ADD COLUMN vote_count INTEGER;
      END IF;
      
      -- Add popularity for TMDB popularity score
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='popularity') THEN
        ALTER TABLE diary ADD COLUMN popularity DECIMAL(8,3);
      END IF;
      
      -- Add original_language
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='original_language') THEN
        ALTER TABLE diary ADD COLUMN original_language VARCHAR(10);
      END IF;
      
      -- Add original_title
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='original_title') THEN
        ALTER TABLE diary ADD COLUMN original_title TEXT;
      END IF;
      
      -- Add tagline
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='tagline') THEN
        ALTER TABLE diary ADD COLUMN tagline TEXT;
      END IF;
      
      -- Add status
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='status') THEN
        ALTER TABLE diary ADD COLUMN status VARCHAR(50);
      END IF;
      
      -- Add budget
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='budget') THEN
        ALTER TABLE diary ADD COLUMN budget BIGINT;
      END IF;
      
      -- Add revenue
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='revenue') THEN
        ALTER TABLE diary ADD COLUMN revenue BIGINT;
      END IF;
      
      -- Add imdb_id
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='imdb_id') THEN
        ALTER TABLE diary ADD COLUMN imdb_id VARCHAR(20);
      END IF;
      
      -- Add homepage
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='homepage') THEN
        ALTER TABLE diary ADD COLUMN homepage TEXT;
      END IF;
      
      -- Add timestamps
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='created_at') THEN
        ALTER TABLE diary ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
      END IF;
      
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diary' AND column_name='updated_at') THEN
        ALTER TABLE diary ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
      END IF;
    END $$;
  `,
  
  // Create supporting tables for directors and genres (optional for enhanced features)
  directors: `
    CREATE TABLE IF NOT EXISTS directors (
      id SERIAL PRIMARY KEY,
      tmdb_id INTEGER UNIQUE,
      name VARCHAR(200) NOT NULL,
      biography TEXT,
      birthday DATE,
      deathday DATE,
      place_of_birth VARCHAR(200),
      profile_path VARCHAR(500),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `,
  
  genres: `
    CREATE TABLE IF NOT EXISTS genres (
      id SERIAL PRIMARY KEY,
      tmdb_id INTEGER UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `,
  
  movie_directors: `
    CREATE TABLE IF NOT EXISTS movie_directors (
      id SERIAL PRIMARY KEY,
      movie_id INTEGER REFERENCES diary(id) ON DELETE CASCADE,
      director_id INTEGER REFERENCES directors(id) ON DELETE CASCADE,
      UNIQUE(movie_id, director_id)
    );
  `,
  
  movie_genres: `
    CREATE TABLE IF NOT EXISTS movie_genres (
      id SERIAL PRIMARY KEY,
      movie_id INTEGER REFERENCES diary(id) ON DELETE CASCADE,
      genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
      UNIQUE(movie_id, genre_id)
    );
  `
};

// Helper function to execute raw SQL
export const executeSQL = async (sql, params = []) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('execute_sql', {
      sql_query: sql,
      params: params
    });
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('SQL execution error:', error);
    throw error;
  }
};

export default supabase; 