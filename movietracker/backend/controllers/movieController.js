import movieService from '../services/movieService.js';
import tmdbService from '../services/tmdbService.js';
import { supabaseAdmin } from '../config/database.js';

class MovieController {
  /**
   * Get all movies from diary with pagination
   */
  async getAllMovies(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const result = await movieService.getAllMoviesWithDetailsPaginated(limit, offset);
      
      res.json({
        success: true,
        data: result.movies,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
          hasNextPage: page < Math.ceil(result.total / limit),
          hasPreviousPage: page > 1
        }
      });
    } catch (error) {
      console.error('Error getting all movies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch movies',
        details: error.message
      });
    }
  }

  /**
   * Get a single movie by ID
   */
  async getMovieById(req, res) {
    try {
      const { id } = req.params;
      const movie = await movieService.getMovieById(id);
      
      if (!movie) {
        return res.status(404).json({
          success: false,
          error: 'Movie not found'
        });
      }

      res.json({
        success: true,
        data: movie
      });
    } catch (error) {
      console.error('Error getting movie by ID:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch movie',
        details: error.message
      });
    }
  }

  /**
   * Add a new movie to diary with TMDB data
   */
  async addMovie(req, res) {
    try {
      const { 
        title, 
        year, 
        user_rating, 
        detailed_rating, 
        watch_date, 
        is_rewatch = false,
        notes,
        tags
      } = req.body;

      if (!title) {
        return res.status(400).json({
          success: false,
          error: 'Movie title is required'
        });
      }

      const result = await movieService.fetchAndSaveMovie(
        title, 
        year, 
        user_rating, 
        detailed_rating, 
        watch_date,
        is_rewatch,
        notes,
        tags
      );

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: result.error
        });
      }

      res.status(201).json({
        success: true,
        data: result.movie,
        tmdb_data: result.tmdb_data
      });

    } catch (error) {
      console.error('Error adding movie:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add movie',
        details: error.message
      });
    }
  }

  /**
   * Update a diary entry
   */
  async updateMovie(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Map frontend fields to diary table fields
      const diaryUpdateData = {
        title: updateData.title,
        rating: updateData.user_rating || updateData.rating,
        ratings100: updateData.detailed_rating || updateData.ratings100,
        watched_date: updateData.watch_date || updateData.watched_date,
        rewatch: updateData.is_rewatch ? 'Yes' : 'No',
        reviews: updateData.notes,
        tags: updateData.tags,
        release_date: updateData.release_date,
        release_year: updateData.release_year,
        runtime: updateData.runtime,
        director: updateData.director,
        poster_url: updateData.poster_url,
        updated_at: new Date().toISOString()
      };

      // Remove undefined values
      Object.keys(diaryUpdateData).forEach(key => {
        if (diaryUpdateData[key] === undefined) {
          delete diaryUpdateData[key];
        }
      });

      const result = await movieService.upsertMovie({
        id: parseInt(id),
        ...diaryUpdateData
      });

      res.json({
        success: true,
        data: movieService.transformDiaryEntry(result)
      });

    } catch (error) {
      console.error('Error updating movie:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update movie',
        details: error.message
      });
    }
  }

  /**
   * Update user rating for a diary entry
   */
  async updateUserRating(req, res) {
    try {
      const { id } = req.params;
      const { user_rating, detailed_rating, watch_date, is_rewatch, notes, tags } = req.body;

      const result = await movieService.upsertUserRating({
        movie_id: parseInt(id),
        user_rating,
        detailed_rating,
        watch_date,
        is_rewatch,
        notes,
        tags
      });

      res.json({
        success: true,
        data: movieService.transformDiaryEntry(result)
      });

    } catch (error) {
      console.error('Error updating user rating:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update rating',
        details: error.message
      });
    }
  }

  /**
   * Search movies in diary
   */
  async searchMovies(req, res) {
    try {
      const { q: query } = req.query;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required'
        });
      }

      const movies = await movieService.searchMovies(query);

      res.json({
        success: true,
        data: movies
      });

    } catch (error) {
      console.error('Error searching movies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search movies',
        details: error.message
      });
    }
  }

  /**
   * Get movie statistics from diary
   */
  async getMovieStats(req, res) {
    try {
      const stats = await movieService.getMovieStats();

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Error getting movie stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
        details: error.message
      });
    }
  }

  /**
   * Delete a diary entry
   */
  async deleteMovie(req, res) {
    try {
      const { id } = req.params;

      const { error } = await supabaseAdmin
        .from('diary')
        .delete()
        .eq('id', id);

      if (error) throw error;

      res.json({
        success: true,
        message: 'Movie deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting movie:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete movie',
        details: error.message
      });
    }
  }

  /**
   * Enhance existing diary entry with TMDB data
   */
  async enhanceWithTMDB(req, res) {
    try {
      const { id } = req.params;

      // Get existing diary entry
      const movie = await movieService.getMovieById(id);
      if (!movie) {
        return res.status(404).json({
          success: false,
          error: 'Movie not found'
        });
      }

      // Fetch TMDB data
      const tmdbData = await tmdbService.fetchMovieData(movie.title, movie.release_year);
      
      if (!tmdbData) {
        return res.status(404).json({
          success: false,
          error: 'Could not find TMDB data for this movie'
        });
      }

      // Update diary entry with TMDB data while preserving user data
      const updateData = {
        id: parseInt(id),
        tmdb_id: tmdbData.tmdb_id,
        overview: tmdbData.overview,
        poster_url: tmdbData.poster_path ? tmdbService.getImageUrl(tmdbData.poster_path) : null,
        backdrop_path: tmdbData.backdrop_path,
        vote_average: tmdbData.vote_average,
        vote_count: tmdbData.vote_count,
        popularity: tmdbData.popularity,
        original_language: tmdbData.original_language,
        original_title: tmdbData.original_title,
        tagline: tmdbData.tagline,
        status: tmdbData.status,
        budget: tmdbData.budget,
        revenue: tmdbData.revenue,
        imdb_id: tmdbData.imdb_id,
        homepage: tmdbData.homepage,
        director: tmdbData.directors?.map(d => d.name).join(', ') || movie.director,
        genres: tmdbData.genres?.map(g => g.name) || movie.genres,
        release_date: tmdbData.release_date || movie.release_date,
        runtime: tmdbData.runtime || movie.runtime,
        updated_at: new Date().toISOString()
      };

      const result = await movieService.upsertMovie(updateData);

      res.json({
        success: true,
        data: movieService.transformDiaryEntry(result),
        tmdb_data: tmdbData
      });

    } catch (error) {
      console.error('Error enhancing with TMDB:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to enhance movie with TMDB data',
        details: error.message
      });
    }
  }

  /**
   * Get unique movies (no duplicates based on title)
   */
  async getUniqueMovies(req, res) {
    try {
      const movies = await movieService.getUniqueMovies();
      res.json({
        success: true,
        data: movies
      });
    } catch (error) {
      console.error('Error getting unique movies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch unique movies',
        details: error.message
      });
    }
  }

  /**
   * Get movies by rating range for comparison
   */
  async getMoviesByRatingRange(req, res) {
    try {
      const { rating } = req.query;
      const targetRating = parseInt(rating);
      
      if (!rating || isNaN(targetRating) || targetRating < 0 || targetRating > 100) {
        return res.status(400).json({
          success: false,
          error: 'Valid rating (0-100) is required'
        });
      }

      // Define range based on 10-point brackets (40-49, 50-59, etc.)
      const minRating = Math.floor(targetRating / 10) * 10;
      const maxRating = minRating + 9;

      const movies = await movieService.getMoviesByRatingRange(minRating, maxRating, targetRating);
      
      res.json({
        success: true,
        data: movies,
        range: { min: minRating, max: maxRating, target: targetRating }
      });

    } catch (error) {
      console.error('Error getting movies by rating range:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch movies by rating range',
        details: error.message
      });
    }
  }

  /**
   * Get top rated movies (unique titles only) with pagination
   */
  async getTopRatedMovies(req, res) {
    try {
      const minRating = parseInt(req.query.minRating) || 90;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const result = await movieService.getTopRatedMoviesPaginated(minRating, limit, offset);
      
      res.json({
        success: true,
        data: result.movies,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
          hasNextPage: page < Math.ceil(result.total / limit),
          hasPreviousPage: page > 1
        }
      });
    } catch (error) {
      console.error('Error getting top rated movies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch top rated movies',
        details: error.message
      });
    }
  }
}

export default new MovieController(); 