import { supabase, supabaseAdmin, isSupabaseConfigured } from '../config/database.js';
import tmdbService from './tmdbService.js';

class MovieService {
  /**
   * Check if database is available
   */
  _checkDatabase() {
    if (!isSupabaseConfigured) {
      throw new Error('Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
    }
  }

  /**
   * Create or update a movie in the diary table
   */
  async upsertMovie(movieData) {
    this._checkDatabase();
    
    try {
      // If we have an ID, update the existing entry
      if (movieData.id) {
        const { data, error } = await supabaseAdmin
          .from('diary')
          .update(movieData)
          .eq('id', movieData.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // If no ID, insert a new entry
        const { data, error } = await supabaseAdmin
          .from('diary')
          .insert(movieData)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error('Error upserting movie:', error);
      throw error;
    }
  }

  /**
   * Create or update a director in the database
   */
  async upsertDirector(directorData) {
    this._checkDatabase();
    
    try {
      const { data, error } = await supabaseAdmin
        .from('directors')
        .upsert(directorData, {
          onConflict: 'tmdb_id',
          returning: 'representation'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error upserting director:', error);
      throw error;
    }
  }

  /**
   * Create or update a genre in the database
   */
  async upsertGenre(genreData) {
    this._checkDatabase();
    
    try {
      const { data, error } = await supabaseAdmin
        .from('genres')
        .upsert(genreData, {
          onConflict: 'tmdb_id',
          returning: 'representation'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error upserting genre:', error);
      throw error;
    }
  }

  /**
   * Link a movie to its directors
   */
  async linkMovieDirectors(movieId, directorIds) {
    this._checkDatabase();
    
    try {
      // First, remove existing links
      await supabaseAdmin
        .from('movie_directors')
        .delete()
        .eq('movie_id', movieId);

      // Then create new links
      if (directorIds.length > 0) {
        const links = directorIds.map(directorId => ({
          movie_id: movieId,
          director_id: directorId
        }));

        const { error } = await supabaseAdmin
          .from('movie_directors')
          .insert(links);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error linking movie directors:', error);
      throw error;
    }
  }

  /**
   * Link a movie to its genres
   */
  async linkMovieGenres(movieId, genreIds) {
    this._checkDatabase();
    
    try {
      // First, remove existing links
      await supabaseAdmin
        .from('movie_genres')
        .delete()
        .eq('movie_id', movieId);

      // Then create new links
      if (genreIds.length > 0) {
        const links = genreIds.map(genreId => ({
          movie_id: movieId,
          genre_id: genreId
        }));

        const { error } = await supabaseAdmin
          .from('movie_genres')
          .insert(links);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error linking movie genres:', error);
      throw error;
    }
  }

  /**
   * Add or update a user rating for a movie (update existing diary entry)
   */
  async upsertUserRating(ratingData) {
    this._checkDatabase();
    
    try {
      const { data, error } = await supabaseAdmin
        .from('diary')
        .update({
          rating: ratingData.user_rating,
          ratings100: ratingData.detailed_rating,
          watched_date: ratingData.watch_date,
          rewatch: ratingData.is_rewatch ? 'Yes' : 'No',
          reviews: ratingData.notes,
          tags: ratingData.tags,
          updated_at: new Date().toISOString()
        })
        .eq('id', ratingData.movie_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error upserting user rating:', error);
      throw error;
    }
  }

  /**
   * Fetch movie data from TMDB and save to database
   */
  async fetchAndSaveMovie(title, year = null, userRating = null, detailedRating = null, watchDate = null, isRewatch = false, notes = null, tags = null) {
    this._checkDatabase();
    
    try {
      // Fetch movie data from TMDB
      const tmdbData = await tmdbService.fetchMovieData(title, year);
      
      if (!tmdbData) {
        throw new Error(`Could not find movie data for: ${title}`);
      }

      // Map TMDB data to diary table structure
      const movieRecord = {
        tmdb_id: tmdbData.tmdb_id,
        title: tmdbData.title,
        original_title: tmdbData.original_title,
        release_date: tmdbData.release_date,
        release_year: tmdbData.release_year,
        runtime: tmdbData.runtime,
        overview: tmdbData.overview,
        poster_url: tmdbData.poster_path ? tmdbService.getImageUrl(tmdbData.poster_path) : null,
        backdrop_path: tmdbData.backdrop_path,
        vote_average: tmdbData.vote_average,
        vote_count: tmdbData.vote_count,
        popularity: tmdbData.popularity,
        original_language: tmdbData.original_language,
        tagline: tmdbData.tagline,
        status: tmdbData.status,
        budget: tmdbData.budget,
        revenue: tmdbData.revenue,
        imdb_id: tmdbData.imdb_id,
        homepage: tmdbData.homepage,
        director: tmdbData.directors?.map(d => d.name).join(', ') || null,
        genres: tmdbData.genres?.map(g => g.name) || [],
        rating: userRating,
        ratings100: detailedRating,
        watched_date: watchDate,
        rewatch: isRewatch ? 'Yes' : 'No',
        reviews: notes,
        tags: tags
      };

      // Save movie to database
      const movie = await this.upsertMovie(movieRecord);

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

      // Save genres if supporting tables exist
      const genreIds = [];
      for (const genreData of tmdbData.genres) {
        try {
          const genre = await this.upsertGenre({
            tmdb_id: genreData.id,
            name: genreData.name
          });
          genreIds.push(genre.id);
        } catch (error) {
          // Ignore if genres table doesn't exist
        }
      }

      // Link movie to directors and genres if tables exist
      try {
        await this.linkMovieDirectors(movie.id, directorIds);
        await this.linkMovieGenres(movie.id, genreIds);
      } catch (error) {
        // Ignore if relationship tables don't exist
      }

      return {
        success: true,
        movie: movie,
        tmdb_data: tmdbData
      };

    } catch (error) {
      console.error('Error fetching and saving movie:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all movies with details and pagination
   */
  async getAllMoviesWithDetailsPaginated(limit = 50, offset = 0) {
    this._checkDatabase();
    
    try {
      // First, get the total count
      const { count, error: countError } = await supabaseAdmin
        .from('diary')
        .select('id', { count: 'exact', head: true });

      if (countError) throw countError;

      // Then get the paginated data
      const { data, error } = await supabaseAdmin
        .from('diary')
        .select(`
          *,
          movie_directors (
            directors (*)
          ),
          movie_genres (
            genres (*)
          )
        `)
        .order('watched_date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        movies: data.map(movie => this.transformDiaryEntry(movie)),
        total: count || 0
      };

    } catch (error) {
      console.error('Error fetching movies with details (paginated):', error);
      // Fallback to simple query if relationship tables don't exist
      try {
        const { count, error: countError } = await supabaseAdmin
          .from('diary')
          .select('id', { count: 'exact', head: true });

        if (countError) throw countError;

        const { data: simpleData, error: simpleError } = await supabaseAdmin
          .from('diary')
          .select('*')
          .order('watched_date', { ascending: false })
          .range(offset, offset + limit - 1);

        if (simpleError) throw simpleError;
        
        return {
          movies: simpleData.map(movie => this.transformDiaryEntry(movie)),
          total: count || 0
        };
      } catch (fallbackError) {
        console.error('Error with fallback paginated query:', fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Get top rated movies with pagination (unique titles only) above a minimum rating
   */
  async getTopRatedMoviesPaginated(minRating = 90, limit = 50, offset = 0) {
    this._checkDatabase();
    
    try {
      // Get all unique movies first (we need to process all to find unique)
      const uniqueMovies = await this.getUniqueMovies();
      
      // Filter by rating
      const topRatedMovies = uniqueMovies
        .filter(movie => (movie.detailed_rating || 0) >= minRating)
        .sort((a, b) => {
          // Sort by detailed rating descending, then by user rating descending
          const aDetailedRating = a.detailed_rating || 0;
          const bDetailedRating = b.detailed_rating || 0;
          
          if (aDetailedRating !== bDetailedRating) {
            return bDetailedRating - aDetailedRating;
          }
          
          return (b.rating || 0) - (a.rating || 0);
        });

      // Apply pagination
      const paginatedMovies = topRatedMovies.slice(offset, offset + limit);

      return {
        movies: paginatedMovies,
        total: topRatedMovies.length
      };

    } catch (error) {
      console.error('Error fetching top rated movies (paginated):', error);
      throw error;
    }
  }

  /**
   * Get all movies with their details
   */
  async getAllMoviesWithDetails() {
    this._checkDatabase();
    
    try {
      const { data, error } = await supabaseAdmin
        .from('diary')
        .select(`
          *,
          movie_directors (
            directors (*)
          ),
          movie_genres (
            genres (*)
          )
        `)
        .order('watched_date', { ascending: false });

      if (error) throw error;

      // Transform the data for easier frontend consumption
      return data.map(movie => this.transformDiaryEntry(movie));

    } catch (error) {
      console.error('Error fetching movies with details:', error);
      // Fallback to simple query if relationship tables don't exist
      try {
        const { data: simpleData, error: simpleError } = await supabaseAdmin
          .from('diary')
          .select('*')
          .order('watched_date', { ascending: false });

        if (simpleError) throw simpleError;
        
        return simpleData.map(movie => this.transformDiaryEntry(movie));
      } catch (fallbackError) {
        console.error('Error with fallback query:', fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Get unique movies (no duplicates based on title)
   * Returns the best-rated instance of each movie
   */
  async getUniqueMovies() {
    this._checkDatabase();
    
    try {
      const { data, error } = await supabaseAdmin
        .from('diary')
        .select('*')
        .order('title', { ascending: true });

      if (error) throw error;

      // Group by title and keep the highest rated instance
      const uniqueMoviesMap = new Map();
      
      data.forEach(movie => {
        const title = movie.title.toLowerCase();
        
        if (!uniqueMoviesMap.has(title)) {
          uniqueMoviesMap.set(title, movie);
        } else {
          const existing = uniqueMoviesMap.get(title);
          // Prefer higher detailed rating, then higher user rating, then most recent
          if ((movie.ratings100 || 0) > (existing.ratings100 || 0) ||
              ((movie.ratings100 || 0) === (existing.ratings100 || 0) && (movie.rating || 0) > (existing.rating || 0)) ||
              ((movie.ratings100 || 0) === (existing.ratings100 || 0) && (movie.rating || 0) === (existing.rating || 0) && 
               new Date(movie.watched_date) > new Date(existing.watched_date))) {
            uniqueMoviesMap.set(title, movie);
          }
        }
      });

      return Array.from(uniqueMoviesMap.values()).map(movie => this.transformDiaryEntry(movie));

    } catch (error) {
      console.error('Error fetching unique movies:', error);
      throw error;
    }
  }

  /**
   * Get top rated movies (unique titles only) above a minimum rating
   */
  async getTopRatedMovies(minRating = 90) {
    this._checkDatabase();
    
    try {
      const uniqueMovies = await this.getUniqueMovies();
      
      return uniqueMovies
        .filter(movie => (movie.detailed_rating || 0) >= minRating)
        .sort((a, b) => {
          // Sort by detailed rating descending, then by user rating descending
          const aDetailedRating = a.detailed_rating || 0;
          const bDetailedRating = b.detailed_rating || 0;
          
          if (aDetailedRating !== bDetailedRating) {
            return bDetailedRating - aDetailedRating;
          }
          
          return (b.rating || 0) - (a.rating || 0);
        });

    } catch (error) {
      console.error('Error fetching top rated movies:', error);
      throw error;
    }
  }

  /**
   * Get movies by rating range for comparison
   */
  async getMoviesByRatingRange(minRating, maxRating, targetRating) {
    this._checkDatabase();
    
    try {
      const { data, error } = await supabaseAdmin
        .from('diary')
        .select('*')
        .gte('ratings100', minRating)
        .lte('ratings100', maxRating)
        .not('ratings100', 'is', null)
        .order('ratings100', { ascending: false }); // Order by rating descending in the database

      if (error) throw error;

      // The data is already sorted by rating descending from the database
      // No need for additional JavaScript sorting
      return data.map(movie => this.transformDiaryEntry(movie));

    } catch (error) {
      console.error('Error fetching movies by rating range:', error);
      throw error;
    }
  }

  /**
   * Transform diary entry to match expected movie format
   */
  transformDiaryEntry(diaryEntry) {
    return {
      id: diaryEntry.id,
      title: diaryEntry.title,
      rating: diaryEntry.rating,
      detailed_rating: diaryEntry.ratings100,
      watch_date: diaryEntry.watched_date,
      is_rewatch: diaryEntry.rewatch === 'Yes',
      notes: diaryEntry.reviews,
      tags: diaryEntry.tags,
      release_date: diaryEntry.release_date,
      release_year: diaryEntry.release_year,
      runtime: diaryEntry.runtime,
      overview: diaryEntry.overview,
      poster_url: diaryEntry.poster_url,
      backdrop_url: diaryEntry.backdrop_path ? tmdbService.getImageUrl(diaryEntry.backdrop_path) : null,
      vote_average: diaryEntry.vote_average,
      tmdb_id: diaryEntry.tmdb_id,
      director: diaryEntry.director,
      genres: Array.isArray(diaryEntry.genres) ? diaryEntry.genres.map(name => ({ name })) : [],
      directors: diaryEntry.movie_directors?.map(md => md.directors) || 
                 (diaryEntry.director ? [{ name: diaryEntry.director }] : []),
      ratings: [{
        user_rating: diaryEntry.rating,
        detailed_rating: diaryEntry.ratings100,
        watch_date: diaryEntry.watched_date,
        is_rewatch: diaryEntry.rewatch === 'Yes'
      }]
    };
  }

  /**
   * Get a single movie by ID with all details
   */
  async getMovieById(movieId) {
    this._checkDatabase();
    
    try {
      const { data, error } = await supabaseAdmin
        .from('diary')
        .select('*')
        .eq('id', movieId)
        .single();

      if (error) throw error;

      return this.transformDiaryEntry(data);

    } catch (error) {
      console.error('Error fetching movie by ID:', error);
      throw error;
    }
  }

  /**
   * Search movies by title, director, tags, or reviews
   */
  async searchMovies(query) {
    this._checkDatabase();
    
    try {
      const { data, error } = await supabaseAdmin
        .from('diary')
        .select('*')
        .or(`title.ilike.%${query}%,director.ilike.%${query}%,tags.ilike.%${query}%,reviews.ilike.%${query}%,overview.ilike.%${query}%`)
        .order('watched_date', { ascending: false });

      if (error) throw error;

      return data.map(movie => this.transformDiaryEntry(movie));

    } catch (error) {
      console.error('Error searching movies:', error);
      throw error;
    }
  }

  /**
   * Get movie statistics
   */
  async getMovieStats() {
    this._checkDatabase();
    
    try {
      // Get all diary entries for general stats
      const { data: movies, error } = await supabaseAdmin
        .from('diary')
        .select('rating, ratings100, watched_date, rewatch, genres, release_year');

      if (error) throw error;

      // Get unique movies for 5-star count (no duplicates)
      const uniqueMovies = await this.getUniqueMovies();

      const totalMovies = movies.length;
      const avgUserRating = movies.reduce((sum, m) => sum + (m.rating || 0), 0) / totalMovies;
      const avgDetailedRating = movies.reduce((sum, m) => sum + (m.ratings100 || 0), 0) / totalMovies;

      // Count 5-star movies from unique movies only (no duplicates)
      const fiveStarMovies = uniqueMovies.filter(m => m.rating === 5).length;

      // Get rating distribution
      const ratingDistribution = {};
      movies.forEach(movie => {
        const rounded = Math.round(movie.rating);
        ratingDistribution[rounded] = (ratingDistribution[rounded] || 0) + 1;
      });

      // Get genre distribution
      const genreDistribution = {};
      movies.forEach(movie => {
        if (Array.isArray(movie.genres)) {
          movie.genres.forEach(genre => {
            genreDistribution[genre] = (genreDistribution[genre] || 0) + 1;
          });
        }
      });

      // Get year distribution
      const yearCounts = {};
      movies.forEach(movie => {
        const year = new Date(movie.watched_date).getFullYear();
        yearCounts[year] = (yearCounts[year] || 0) + 1;
      });

      const rewatchCount = movies.filter(m => m.rewatch === 'Yes').length;

      return {
        totalMovies,
        totalRatings: totalMovies,
        uniqueMovies: uniqueMovies.length, // Use actual unique movies count
        averageUserRating: Math.round(avgUserRating * 100) / 100,
        averageDetailedRating: Math.round(avgDetailedRating * 100) / 100,
        fiveStarMovies,
        ratingDistribution,
        genreDistribution,
        yearCounts,
        rewatchCount
      };

    } catch (error) {
      console.error('Error fetching movie stats:', error);
      throw error;
    }
  }
}

export default new MovieService(); 