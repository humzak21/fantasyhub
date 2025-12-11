// Movie data utilities using the backend API
import apiService from '../services/apiService.js';
import { parseESTDate } from './dateUtils';

/**
 * Parse movie data from the backend API
 */
export const parseMovieData = async () => {
  try {
    const response = await apiService.getAllMovies();
    return response.data || [];
  } catch (error) {
    console.error('Error fetching movie data from backend:', error);
    return [];
  }
};

/**
 * Get movie statistics from the backend
 */
export const getMovieStats = async () => {
  try {
    const response = await apiService.getMovieStats();
    return response.data;
  } catch (error) {
    console.error('Error fetching movie stats from backend:', error);
    return {
      totalMovies: 0,
      uniqueMovies: 0,
      averageRating: 0,
      fiveStarMovies: 0,
      yearCounts: {},
      ratingCounts: {},
      monthCounts: {},
      rewatchPercentage: 0
    };
  }
};

/**
 * Search movies using the backend
 */
export const searchMovies = async (query) => {
  try {
    const response = await apiService.searchMovies(query);
    return response.data || [];
  } catch (error) {
    console.error('Error searching movies:', error);
    return [];
  }
};

/**
 * Add a new movie with rating
 */
export const addMovie = async (movieData) => {
  try {
    const response = await apiService.addMovie(movieData);
    return response;
  } catch (error) {
    console.error('Error adding movie:', error);
    throw error;
  }
};

/**
 * Search TMDB for movies (for adding new ones)
 */
export const searchTMDB = async (query, year = null) => {
  try {
    const response = await apiService.searchTMDB(query, year);
    return response.data || [];
  } catch (error) {
    console.error('Error searching TMDB:', error);
    return [];
  }
};

/**
 * Get trending movies from TMDB
 */
export const getTrendingMovies = async (timeWindow = 'week') => {
  try {
    const response = await apiService.getTrendingMovies(timeWindow);
    return response.data || [];
  } catch (error) {
    console.error('Error fetching trending movies:', error);
    return [];
  }
};

/**
 * Get top rated movies (5 stars or 90+ detailed rating)
 */
export const getTopRatedMovies = (movies) => {
  return movies
    .filter(m => {
      return m.ratings?.some(r => r.user_rating === 5 || (r.detailed_rating && r.detailed_rating >= 90));
    })
    .sort((a, b) => {
      // Sort by highest rating first, then by most recent watch date
      const aMaxRating = Math.max(...(a.ratings?.map(r => r.user_rating || 0) || [0]));
      const bMaxRating = Math.max(...(b.ratings?.map(r => r.user_rating || 0) || [0]));
      
      if (aMaxRating !== bMaxRating) {
        return bMaxRating - aMaxRating;
      }
      
      const aDate = Math.max(...(a.ratings?.map(r => parseESTDate(r.watch_date).getTime()) || [0]));
      const bDate = Math.max(...(b.ratings?.map(r => parseESTDate(r.watch_date).getTime()) || [0]));
      return bDate - aDate;
    });
};

/**
 * Get perfect rated movies (5 stars or 100/100)
 */
export const getPerfectRatedMovies = (movies) => {
  return movies
    .filter(m => {
      return m.ratings?.some(r => r.user_rating === 5 || r.detailed_rating === 100);
    })
    .sort((a, b) => {
      // Sort by most recent watch date
      const aDate = Math.max(...(a.ratings?.map(r => parseESTDate(r.watch_date).getTime()) || [0]));
      const bDate = Math.max(...(b.ratings?.map(r => parseESTDate(r.watch_date).getTime()) || [0]));
      return bDate - aDate;
    });
};

/**
 * Get recent movies (most recently watched)
 */
export const getRecentMovies = (movies, limit = 20) => {
  return movies
    .sort((a, b) => {
      const aDate = Math.max(...(a.ratings?.map(r => parseESTDate(r.watch_date).getTime()) || [0]));
      const bDate = Math.max(...(b.ratings?.map(r => parseESTDate(r.watch_date).getTime()) || [0]));
      return bDate - aDate;
    })
    .slice(0, limit);
};

/**
 * Get movies by release year
 */
export const getMoviesByYear = (movies, year) => {
  return movies.filter(m => m.release_year === parseInt(year));
};

/**
 * Filter movies by minimum rating
 */
export const filterMoviesByRating = (movies, minRating) => {
  return movies.filter(m => {
    const bestRating = Math.max(...(m.ratings?.map(r => r.user_rating) || [0]));
    return bestRating >= minRating;
  });
};

/**
 * Get movies by genre
 */
export const getMoviesByGenre = (movies, genreName) => {
  return movies.filter(m => 
    m.genres?.some(genre => genre.name.toLowerCase() === genreName.toLowerCase())
  );
};

/**
 * Get movies by director
 */
export const getMoviesByDirector = (movies, directorName) => {
  return movies.filter(m =>
    m.directors?.some(director => 
      director.name.toLowerCase().includes(directorName.toLowerCase())
    )
  );
};

/**
 * Convert detailed rating (0-100) to star rating (0-5)
 */
export const convertDetailedRatingToStars = (detailedRating) => {
  if (!detailedRating) return 0;
  return Math.round((detailedRating / 100) * 5 * 2) / 2; // Round to nearest 0.5
};

/**
 * Get TMDB image URL with different sizes
 */
export const getTMDBImageUrl = (path, size = 'w500') => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

/**
 * Get multiple image sizes for a TMDB image path
 */
export const getTMDBImageSizes = (path) => {
  if (!path) return null;
  
  return {
    small: getTMDBImageUrl(path, 'w185'),
    medium: getTMDBImageUrl(path, 'w342'),
    large: getTMDBImageUrl(path, 'w500'),
    xlarge: getTMDBImageUrl(path, 'w780'),
    original: getTMDBImageUrl(path, 'original')
  };
};

/**
 * Transform backend movie data to match frontend expectations
 */
export const transformMovieData = (movies) => {
  return movies.map(movie => {
    // Get the most recent rating for this movie
    const latestRating = movie.ratings?.sort((a, b) => 
      parseESTDate(b.watch_date) - parseESTDate(a.watch_date)
    )[0];

    const watchDate = parseESTDate(latestRating?.watch_date || movie.release_date);

    return {
      // Keep original movie data
      ...movie,
      
      // Add compatibility fields for existing frontend code
      title: movie.title,
      rating: latestRating?.user_rating || 0,
      detailedRating: latestRating?.detailed_rating || null,
      date: latestRating?.watch_date || movie.release_date,
      year: watchDate.getFullYear(),
      month: watchDate.getMonth() + 1,
      day: watchDate.getDate(),
      
      // Enhanced data from backend
      posterUrl: movie.poster_url,
      backdropUrl: movie.backdrop_url,
      tmdbRating: movie.vote_average,
      overview: movie.overview,
      genres: movie.genres || [],
      directors: movie.directors || [],
      runtime: movie.runtime,
      releaseYear: movie.release_year,
      
      // For compatibility with existing TMDB integration
      tmdb: {
        id: movie.tmdb_id,
        title: movie.title,
        overview: movie.overview,
        releaseDate: movie.release_date,
        runtime: movie.runtime,
        genres: movie.genres || [],
        voteAverage: movie.vote_average,
        posterUrl: movie.poster_url,
        backdropUrl: movie.backdrop_url,
        cast: [], // Not stored in current schema
        crew: movie.directors?.map(d => ({ name: d.name, job: 'Director' })) || []
      }
    };
  });
};

/**
 * Backwards compatibility: Enhanced movie data function
 */
export const getEnhancedMovieData = async () => {
  const movies = await parseMovieData();
  return transformMovieData(movies);
};

// Export API service for direct use
export { apiService };

// Movie data utilities using the backend API
export const movieDataUtils = {
  // Get all movies from the backend
  async getAllMovies() {
    try {
      const response = await apiService.getAllMovies();
      return response.data || [];
    } catch (error) {
      console.error('Error fetching movies:', error);
      return [];
    }
  },

  // Add a new movie with TMDB data
  async addMovie(title, year = null, userRating = null, detailedRating = null, watchDate = null, isRewatch = false) {
    try {
      const movieData = {
        title,
        year,
        user_rating: userRating,
        detailed_rating: detailedRating,
        watch_date: watchDate,
        is_rewatch: isRewatch
      };

      const response = await apiService.addMovie(movieData);
      return {
        success: response.success,
        movie: response.data,
        error: response.error
      };
    } catch (error) {
      console.error('Error adding movie:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Update a movie entry
  async updateMovie(movieId, updateData) {
    try {
      const response = await apiService.updateMovie(movieId, updateData);
      return {
        success: response.success,
        movie: response.data,
        error: response.error
      };
    } catch (error) {
      console.error('Error updating movie:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Update user rating for a movie
  async updateUserRating(movieId, ratingData) {
    try {
      const response = await apiService.updateUserRating(movieId, ratingData);
      return {
        success: response.success,
        movie: response.data,
        error: response.error
      };
    } catch (error) {
      console.error('Error updating rating:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Delete a movie
  async deleteMovie(movieId) {
    try {
      const response = await apiService.deleteMovie(movieId);
      return {
        success: response.success,
        error: response.error
      };
    } catch (error) {
      console.error('Error deleting movie:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Search movies in the database
  async searchMovies(query) {
    try {
      const response = await apiService.searchMovies(query);
      return response.data || [];
    } catch (error) {
      console.error('Error searching movies:', error);
      return [];
    }
  },

  // Get movie statistics
  async getMovieStats() {
    try {
      const response = await apiService.getMovieStats();
      return response.data || {};
    } catch (error) {
      console.error('Error fetching movie stats:', error);
      return {};
    }
  },

  // Enhance existing movie with TMDB data
  async enhanceWithTMDB(movieId) {
    try {
      const response = await apiService.enhanceMovieWithTMDB(movieId);
      return {
        success: response.success,
        movie: response.data,
        tmdb_data: response.tmdb_data,
        error: response.error
      };
    } catch (error) {
      console.error('Error enhancing movie with TMDB:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Search TMDB for movies
  async searchTMDB(query, year = null) {
    try {
      const response = await apiService.searchTMDB(query, year);
      return response.data || [];
    } catch (error) {
      console.error('Error searching TMDB:', error);
      return [];
    }
  },

  // Get trending movies from TMDB
  async getTrendingMovies(timeWindow = 'week') {
    try {
      const response = await apiService.getTrendingMovies(timeWindow);
      return response.data || [];
    } catch (error) {
      console.error('Error fetching trending movies:', error);
      return [];
    }
  },

  // Get genres from TMDB
  async getGenres() {
    try {
      const response = await apiService.getGenres();
      return response.data || [];
    } catch (error) {
      console.error('Error fetching genres:', error);
      return [];
    }
  },

  // Transform movie data to match expected format
  transformMovieData(movie) {
    return {
      id: movie.id,
      title: movie.title,
      year: movie.release_year,
      rating: movie.rating,
      detailedRating: movie.detailed_rating || movie.ratings100,
      watchDate: movie.watch_date || movie.watched_date,
      isRewatch: movie.is_rewatch || movie.rewatch === 'Yes',
      notes: movie.notes || movie.tags,
      director: movie.director,
      runtime: movie.runtime,
      genres: Array.isArray(movie.genres) 
        ? movie.genres.map(g => typeof g === 'string' ? g : g.name)
        : [],
      posterUrl: movie.poster_url,
      backdropUrl: movie.backdrop_url,
      tmdbRating: movie.vote_average,
      overview: movie.overview,
      tmdbId: movie.tmdb_id,
      releaseDate: movie.release_date
    };
  },

  // Get movies with transformed data
  async getTransformedMovies() {
    const movies = await this.getAllMovies();
    return movies.map(movie => this.transformMovieData(movie));
  },

  // Calculate statistics from movies
  calculateStats(movies) {
    if (!movies || movies.length === 0) {
      return {
        totalMovies: 0,
        averageRating: 0,
        totalRuntime: 0,
        genreBreakdown: {},
        yearBreakdown: {},
        ratingDistribution: {}
      };
    }

    const totalMovies = movies.length;
    const ratingsSum = movies.reduce((sum, movie) => sum + (movie.rating || 0), 0);
    const averageRating = ratingsSum / totalMovies;
    const totalRuntime = movies.reduce((sum, movie) => sum + (movie.runtime || 0), 0);

    // Genre breakdown
    const genreBreakdown = {};
    movies.forEach(movie => {
      if (movie.genres && Array.isArray(movie.genres)) {
        movie.genres.forEach(genre => {
          genreBreakdown[genre] = (genreBreakdown[genre] || 0) + 1;
        });
      }
    });

    // Year breakdown
    const yearBreakdown = {};
    movies.forEach(movie => {
      const year = movie.year || new Date(movie.watchDate).getFullYear();
      if (year) {
        yearBreakdown[year] = (yearBreakdown[year] || 0) + 1;
      }
    });

    // Rating distribution
    const ratingDistribution = {};
    movies.forEach(movie => {
      if (movie.rating) {
        const roundedRating = Math.round(movie.rating);
        ratingDistribution[roundedRating] = (ratingDistribution[roundedRating] || 0) + 1;
      }
    });

    return {
      totalMovies,
      averageRating: Math.round(averageRating * 100) / 100,
      totalRuntime,
      genreBreakdown,
      yearBreakdown,
      ratingDistribution
    };
  }
};

export default movieDataUtils; 