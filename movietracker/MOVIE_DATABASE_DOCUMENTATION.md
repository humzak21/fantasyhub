# Movie Database Documentation
## How New Movie Entries Are Written to Supabase SQL Database

### Table of Contents
1. [Database Schema Overview](#database-schema-overview)
2. [Movie Entry Workflow](#movie-entry-workflow)
3. [API Endpoints](#api-endpoints)
4. [Data Flow Process](#data-flow-process)
5. [Database Operations](#database-operations)
6. [TMDB Integration](#tmdb-integration)
7. [Error Handling](#error-handling)
8. [Migration and Setup](#migration-and-setup)
9. [Code Examples](#code-examples)
10. [Maintenance Notes](#maintenance-notes)

---

## Database Schema Overview

The movie tracking system uses a PostgreSQL database via Supabase with the following core structure:

### Primary Table: `diary`
The main table that stores all movie entries and user ratings:

```sql
-- Core columns (original structure)
id SERIAL PRIMARY KEY
title VARCHAR(255)
rating INTEGER                    -- User rating (1-5 stars)
ratings100 INTEGER               -- Detailed rating (0-100)
watched_date DATE
rewatch VARCHAR(10)              -- 'Yes' or 'No'
reviews TEXT                     -- User notes
tags TEXT
release_date DATE
release_year INTEGER
runtime INTEGER
director VARCHAR(255)
poster_url TEXT
genres TEXT[]                    -- Array of genre names

-- TMDB Enhancement columns (added via migration)
tmdb_id INTEGER
overview TEXT
backdrop_path TEXT
vote_average DECIMAL(3,1)
vote_count INTEGER
popularity DECIMAL(8,3)
original_language VARCHAR(10)
original_title TEXT
tagline TEXT
status VARCHAR(50)
budget BIGINT
revenue BIGINT
imdb_id VARCHAR(20)
homepage TEXT
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
```

### Supporting Tables (Optional)
These tables provide normalized storage for enhanced features:

```sql
-- Directors table
directors (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE,
  name VARCHAR(200) NOT NULL,
  biography TEXT,
  birthday DATE,
  deathday DATE,
  place_of_birth VARCHAR(200),
  profile_path VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)

-- Genres table
genres (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)

-- Many-to-many relationship tables
movie_directors (
  id SERIAL PRIMARY KEY,
  movie_id INTEGER REFERENCES diary(id) ON DELETE CASCADE,
  director_id INTEGER REFERENCES directors(id) ON DELETE CASCADE,
  UNIQUE(movie_id, director_id)
)

movie_genres (
  id SERIAL PRIMARY KEY,
  movie_id INTEGER REFERENCES diary(id) ON DELETE CASCADE,
  genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
  UNIQUE(movie_id, genre_id)
)
```

---

## Movie Entry Workflow

### 1. Frontend Request
A new movie entry starts with a POST request to `/api/movies/add`:

```javascript
// Request payload
{
  title: "Movie Title",
  year: 2023,                    // Optional
  user_rating: 4,               // 1-5 stars
  detailed_rating: 85,          // 0-100 rating
  watch_date: "2023-12-01",
  is_rewatch: false,
  notes: "Great movie!",
  tags: "action, thriller"
}
```

### 2. Controller Processing
The request is handled by `MovieController.addMovie()` in `/backend/controllers/movieController.js:71`:

```javascript
async addMovie(req, res) {
  const { title, year, user_rating, detailed_rating, watch_date, is_rewatch, notes, tags } = req.body;
  
  // Validation
  if (!title) {
    return res.status(400).json({ success: false, error: 'Movie title is required' });
  }

  // Delegate to service layer
  const result = await movieService.fetchAndSaveMovie(
    title, year, user_rating, detailed_rating, watch_date, is_rewatch, notes, tags
  );
}
```

### 3. Service Layer Processing
The core logic is in `MovieService.fetchAndSaveMovie()` in `/backend/services/movieService.js:194`:

```javascript
async fetchAndSaveMovie(title, year, userRating, detailedRating, watchDate, isRewatch, notes, tags) {
  // 1. Fetch TMDB data
  const tmdbData = await tmdbService.fetchMovieData(title, year);
  
  // 2. Map to database structure
  const movieRecord = {
    // TMDB data
    tmdb_id: tmdbData.tmdb_id,
    title: tmdbData.title,
    overview: tmdbData.overview,
    // ... other TMDB fields
    
    // User data
    rating: userRating,
    ratings100: detailedRating,
    watched_date: watchDate,
    rewatch: isRewatch ? 'Yes' : 'No',
    reviews: notes,
    tags: tags
  };

  // 3. Save to database
  const movie = await this.upsertMovie(movieRecord);
  
  // 4. Handle relationships (if supporting tables exist)
  await this.saveDirectorsAndGenres(movie.id, tmdbData);
}
```

---

## API Endpoints

### Movie Management Endpoints

| Method | Endpoint | Description | Location |
|--------|----------|-------------|----------|
| POST | `/api/movies/add` | Add new movie with TMDB data | `movieController.js:71` |
| GET | `/api/movies/` | Get all movies (paginated) | `movieController.js:9` |
| GET | `/api/movies/:id` | Get single movie by ID | `movieController.js:42` |
| PUT | `/api/movies/:id` | Update movie entry | `movieController.js:128` |
| PATCH | `/api/movies/:id/rating` | Update user rating only | `movieController.js:180` |
| DELETE | `/api/movies/:id` | Delete movie entry | `movieController.js:266` |
| POST | `/api/movies/:id/enhance` | Enhance with TMDB data | `movieController.js:295` |
| GET | `/api/movies/search?q=query` | Search movies | `movieController.js:213` |

### TMDB Integration Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/movies/tmdb/search?query=title&year=2023` | Search TMDB movies |
| GET | `/api/movies/tmdb/trending` | Get trending movies |
| GET | `/api/movies/tmdb/genres` | Get TMDB genres |

---

## Data Flow Process

### Complete Movie Entry Flow

```mermaid
graph TD
    A[Frontend Request] --> B[MovieController.addMovie]
    B --> C[Validate Required Fields]
    C --> D[MovieService.fetchAndSaveMovie]
    D --> E[TMDBService.fetchMovieData]
    E --> F[Search TMDB API]
    F --> G[Get Movie Details]
    G --> H[Extract Directors & Genres]
    H --> I[Map to Database Schema]
    I --> J[MovieService.upsertMovie]
    J --> K[Insert/Update diary table]
    K --> L[Save Directors (if table exists)]
    L --> M[Save Genres (if table exists)]
    M --> N[Link Movie to Directors/Genres]
    N --> O[Return Response to Frontend]
```

### 1. TMDB Data Fetching
**File:** `/backend/services/tmdbService.js:100`

```javascript
async fetchMovieData(title, year = null) {
  // 1. Search TMDB for matching movies
  const searchResults = await this.searchMovies(title, year);
  
  // 2. Find best match (exact year match if provided)
  let bestMatch = searchResults[0];
  if (year && searchResults.length > 1) {
    const exactYearMatch = searchResults.find(movie => {
      const releaseYear = new Date(movie.release_date).getFullYear();
      return releaseYear === parseInt(year);
    });
    if (exactYearMatch) bestMatch = exactYearMatch;
  }

  // 3. Get detailed information
  const movieDetails = await this.getMovieDetails(bestMatch.id);
  
  // 4. Extract and format data
  return {
    tmdb_id: movieDetails.id,
    title: movieDetails.title,
    directors: movieDetails.credits?.crew
      ?.filter(person => person.job === 'Director'),
    genres: movieDetails.genres || [],
    // ... all other TMDB fields
  };
}
```

### 2. Database Writing
**File:** `/backend/services/movieService.js:17`

```javascript
async upsertMovie(movieData) {
  if (movieData.id) {
    // Update existing entry
    const { data, error } = await supabaseAdmin
      .from('diary')
      .update(movieData)
      .eq('id', movieData.id)
      .select()
      .single();
  } else {
    // Insert new entry
    const { data, error } = await supabaseAdmin
      .from('diary')
      .insert(movieData)
      .select()
      .single();
  }
  return data;
}
```

### 3. Relationship Handling
The system handles director and genre relationships in two ways:

#### Simple Storage (Always Works)
- Directors: Stored as comma-separated string in `diary.director`
- Genres: Stored as array in `diary.genres`

#### Normalized Storage (If Supporting Tables Exist)
- Directors: Stored in `directors` table, linked via `movie_directors`
- Genres: Stored in `genres` table, linked via `movie_genres`

**Code Reference:** `/backend/services/movieService.js:239-274`

```javascript
// Save directors if supporting tables exist
const directorIds = [];
for (const directorData of tmdbData.directors) {
  try {
    const director = await this.upsertDirector({
      tmdb_id: directorData.tmdb_id,
      name: directorData.name,
      profile_path: directorData.profile_path
    });
    directorIds.push(director.id);
  } catch (error) {
    // Ignore if directors table doesn't exist
  }
}

// Link movie to directors
try {
  await this.linkMovieDirectors(movie.id, directorIds);
} catch (error) {
  // Ignore if relationship tables don't exist
}
```

---

## Database Operations

### Core Database Methods

#### 1. Upsert Movie
**Location:** `/backend/services/movieService.js:17`
- Handles both INSERT and UPDATE operations
- Uses movie ID to determine operation type
- Returns the saved movie record

#### 2. Upsert Director/Genre
**Location:** `/backend/services/movieService.js:52, 76`
- Uses `ON CONFLICT` with `tmdb_id` to prevent duplicates
- Only creates supporting table entries if tables exist

#### 3. Link Relationships
**Location:** `/backend/services/movieService.js:100, 132`
- Removes existing links before creating new ones
- Uses many-to-many junction tables
- Gracefully fails if relationship tables don't exist

### Database Connection Configuration
**File:** `/backend/config/database.js`

```javascript
// Admin client for database operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
```

---

## TMDB Integration

### API Configuration
**File:** `/backend/services/tmdbService.js:9-24`

```javascript
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Image base URL for poster/backdrop paths
const imageBaseUrl = 'https://image.tmdb.org/t/p/';
```

### Key TMDB Operations

#### 1. Movie Search
```javascript
// Search with title and optional year filter
async searchMovies(title, year = null) {
  const params = {
    query: title,
    include_adult: false,
    language: 'en-US'
  };
  if (year) params.year = year;
  
  const data = await this.makeRequest('/search/movie', params);
  return data.results || [];
}
```

#### 2. Detailed Movie Data
```javascript
// Get comprehensive movie details with credits, videos, etc.
async getMovieDetails(tmdbId) {
  return await this.makeRequest(`/movie/${tmdbId}`, {
    append_to_response: 'credits,videos,keywords,release_dates,images'
  });
}
```

#### 3. Rate Limiting
**File:** `/backend/services/tmdbService.js:181`
- Batch processing with configurable batch size and delays
- Prevents TMDB API rate limit violations
- Used in bulk enhancement scripts

---

## Error Handling

### Database Connection Errors
```javascript
_checkDatabase() {
  if (!isSupabaseConfigured) {
    throw new Error('Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
  }
}
```

### TMDB API Errors
```javascript
_checkTMDB() {
  if (!isTMDBConfigured) {
    throw new Error('TMDB API key not configured. Please set TMDB_API_KEY environment variable.');
  }
}
```

### Graceful Degradation
The system is designed to work even if:
- TMDB API is unavailable (manual movie entry)
- Supporting tables don't exist (falls back to simple storage)
- Relationship tables are missing (stores as strings/arrays)

### Error Response Format
```javascript
// Success response
{
  success: true,
  data: movieObject,
  tmdb_data: tmdbDataObject
}

// Error response
{
  success: false,
  error: "Error message",
  details: "Detailed error information"
}
```

---

## Migration and Setup

### Database Migration
**File:** `/backend/scripts/migrate.js`

The migration script adds TMDB columns to the existing `diary` table:

```bash
# Run migration
cd backend && npm run migrate
```

**Key Migration Operations:**
1. Add TMDB-related columns to `diary` table
2. Create supporting tables (directors, genres, relationships)
3. Create performance indexes
4. Handle existing data gracefully

### Manual SQL Commands
If automatic migration fails, these SQL commands can be run manually in Supabase SQL Editor:

```sql
-- Add TMDB columns
ALTER TABLE diary ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;
ALTER TABLE diary ADD COLUMN IF NOT EXISTS overview TEXT;
ALTER TABLE diary ADD COLUMN IF NOT EXISTS backdrop_path TEXT;
-- ... (see migrate.js for complete list)

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_diary_tmdb_id ON diary(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_diary_title ON diary(title);
```

### Enhancement Scripts
After migration, existing data can be enhanced with TMDB data:

```bash
# Enhance existing movies with TMDB data
cd backend && npm run enhance

# Backfill specific data
cd backend && npm run backfill:list-release-dates
cd backend && npm run backfill:list-backdrops
```

---

## Code Examples

### Adding a New Movie (Complete Flow)

#### 1. Frontend Request
```javascript
const response = await fetch('/api/movies/add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: "Inception",
    year: 2010,
    user_rating: 5,
    detailed_rating: 95,
    watch_date: "2023-12-01",
    is_rewatch: false,
    notes: "Mind-bending thriller",
    tags: "sci-fi, thriller"
  })
});
```

#### 2. Backend Processing
```javascript
// Controller receives and validates
async addMovie(req, res) {
  const result = await movieService.fetchAndSaveMovie(
    "Inception", 2010, 5, 95, "2023-12-01", false, "Mind-bending thriller", "sci-fi, thriller"
  );
}

// Service fetches TMDB data and saves
async fetchAndSaveMovie(title, year, userRating, ...) {
  const tmdbData = await tmdbService.fetchMovieData("Inception", 2010);
  const movieRecord = {
    tmdb_id: 27205,
    title: "Inception",
    overview: "Dom Cobb is a skilled thief...",
    poster_url: "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
    rating: 5,
    ratings100: 95,
    // ... other fields
  };
  
  return await this.upsertMovie(movieRecord);
}
```

### Updating an Existing Movie

#### 1. Update User Rating Only
```javascript
PUT /api/movies/123/rating
{
  "user_rating": 4,
  "detailed_rating": 88,
  "notes": "Updated review"
}
```

#### 2. Enhance with TMDB Data
```javascript
POST /api/movies/123/enhance
// No body required - uses existing title/year to fetch TMDB data
```

### Searching Movies
```javascript
// Search existing diary entries
GET /api/movies/search?q=inception

// Search TMDB for new movies
GET /api/movies/tmdb/search?query=inception&year=2010
```

---

## Maintenance Notes

### Performance Considerations
1. **Indexes:** Key indexes are created on frequently queried columns (`tmdb_id`, `title`, `watched_date`, `rating`)
2. **Pagination:** All list endpoints support pagination to handle large datasets
3. **TMDB Rate Limiting:** Batch operations include delays to respect API limits

### Data Consistency
1. **Duplicate Handling:** The system allows duplicate movie entries (same movie watched multiple times)
2. **Unique Movies:** Special handling for operations requiring unique movies (statistics, top-rated lists)
3. **TMDB ID Tracking:** Movies can be re-enhanced by TMDB ID to update metadata

### Backup and Recovery
1. **Database Schema:** All schema changes are versioned in migration scripts
2. **TMDB Data:** Can be re-fetched for any movie using the enhance endpoint
3. **User Data:** User ratings, notes, and watch dates are always preserved during enhancements

### Monitoring and Logging
1. **Error Logging:** All database and API errors are logged with context
2. **TMDB Usage:** API request failures are logged but don't prevent movie creation
3. **Performance:** Database query performance can be monitored via Supabase dashboard

### Future Extensions
1. **Additional APIs:** System can be extended to support other movie databases (OMDB, IMDb)
2. **More Relationships:** Cast, production companies, keywords can be added similarly to directors/genres
3. **User Management:** Multi-user support can be added with user authentication and RLS policies

---

This documentation provides a comprehensive guide for maintaining and extending the movie database functionality. The system is designed to be robust, with graceful fallbacks and clear separation of concerns between TMDB data fetching, database operations, and user data management.