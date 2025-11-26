import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Only load .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';

// Check if TMDB is configured
export const isTMDBConfigured = !!TMDB_API_KEY;

if (!isTMDBConfigured) {
  console.warn('⚠️  TMDB API key not configured. Movie data fetching will be disabled.');
}

class TMDBService {
  constructor() {
    this.apiKey = TMDB_API_KEY;
    this.baseUrl = TMDB_BASE_URL;
    this.imageBaseUrl = 'https://image.tmdb.org/t/p/';
  }

  /**
   * Check if TMDB is available
   */
  _checkTMDB() {
    if (!isTMDBConfigured) {
      throw new Error('TMDB API key not configured. Please set TMDB_API_KEY environment variable.');
    }
  }

  /**
   * Make a request to TMDB API with error handling and rate limiting
   */
  async makeRequest(endpoint, params = {}) {
    this._checkTMDB();
    
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.append('api_key', this.apiKey);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        url.searchParams.append(key, value);
      }
    });

    try {
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('TMDB API request failed:', error);
      throw error;
    }
  }

  /**
   * Search for movies by title and optional year
   */
  async searchMovies(title, year = null) {
    this._checkTMDB();
    
    const params = {
      query: title,
      include_adult: false,
      language: 'en-US'
    };
    
    if (year) {
      params.year = year;
    }

    const data = await this.makeRequest('/search/movie', params);
    return data.results || [];
  }

  /**
   * Get detailed movie information by TMDB ID
   */
  async getMovieDetails(tmdbId) {
    this._checkTMDB();
    
    const params = {
      append_to_response: 'credits,videos,keywords,release_dates,images'
    };
    
    return await this.makeRequest(`/movie/${tmdbId}`, params);
  }

  /**
   * Find and fetch comprehensive movie data by title and year
   */
  async fetchMovieData(title, year = null) {
    this._checkTMDB();
    
    try {
      // Search for the movie
      const searchResults = await this.searchMovies(title, year);
      
      if (searchResults.length === 0) {
        console.warn(`No TMDB results found for: ${title}${year ? ` (${year})` : ''}`);
        return null;
      }

      // Get the best match (first result, or exact year match if provided)
      let bestMatch = searchResults[0];
      
      if (year && searchResults.length > 1) {
        const exactYearMatch = searchResults.find(movie => {
          const releaseYear = new Date(movie.release_date).getFullYear();
          return releaseYear === parseInt(year);
        });
        
        if (exactYearMatch) {
          bestMatch = exactYearMatch;
        }
      }

      // Get detailed movie information
      const movieDetails = await this.getMovieDetails(bestMatch.id);
      
      // Extract director information
      const directors = movieDetails.credits?.crew
        ?.filter(person => person.job === 'Director')
        ?.map(director => ({
          tmdb_id: director.id,
          name: director.name,
          profile_path: director.profile_path
        })) || [];

      // Process and return comprehensive movie data
      return {
        tmdb_id: movieDetails.id,
        title: movieDetails.title,
        original_title: movieDetails.original_title,
        release_date: movieDetails.release_date,
        release_year: movieDetails.release_date ? new Date(movieDetails.release_date).getFullYear() : null,
        runtime: movieDetails.runtime,
        overview: movieDetails.overview,
        poster_path: movieDetails.poster_path,
        backdrop_path: movieDetails.backdrop_path,
        vote_average: movieDetails.vote_average,
        vote_count: movieDetails.vote_count,
        popularity: movieDetails.popularity,
        original_language: movieDetails.original_language,
        tagline: movieDetails.tagline,
        status: movieDetails.status,
        budget: movieDetails.budget,
        revenue: movieDetails.revenue,
        imdb_id: movieDetails.imdb_id,
        homepage: movieDetails.homepage,
        genres: movieDetails.genres || [],
        directors: directors,
        cast: movieDetails.credits?.cast?.slice(0, 10).map(actor => ({
          tmdb_id: actor.id,
          name: actor.name,
          character: actor.character,
          profile_path: actor.profile_path
        })) || [],
        videos: movieDetails.videos?.results?.filter(video => 
          video.site === 'YouTube' && (video.type === 'Trailer' || video.type === 'Teaser')
        ).slice(0, 3) || []
      };
      
    } catch (error) {
      console.error(`Error fetching TMDB data for ${title}:`, error);
      return null;
    }
  }

  /**
   * Batch fetch movie data with rate limiting
   */
  async batchFetchMovies(movieTitles, batchSize = 5, delayMs = 1000) {
    const results = [];
    
    for (let i = 0; i < movieTitles.length; i += batchSize) {
      const batch = movieTitles.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(movieTitles.length / batchSize)}`);
      
      const batchPromises = batch.map(async (movieInfo) => {
        const { title, year } = typeof movieInfo === 'string' 
          ? { title: movieInfo, year: null } 
          : movieInfo;
          
        try {
          const data = await this.fetchMovieData(title, year);
          return { title, year, data, success: true };
        } catch (error) {
          console.error(`Failed to fetch ${title}:`, error);
          return { title, year, data: null, success: false, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Rate limiting delay between batches
      if (i + batchSize < movieTitles.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return results;
  }

  /**
   * Get trending movies
   */
  async getTrendingMovies(timeWindow = 'week') {
    return await this.makeRequest(`/trending/movie/${timeWindow}`);
  }

  /**
   * Get all movie genres from TMDB
   */
  async getGenres() {
    const data = await this.makeRequest('/genre/movie/list');
    return data.genres || [];
  }

  /**
   * Get full image URL for different sizes
   */
  getImageUrl(path, size = 'w500') {
    if (!path) return null;
    return `${this.imageBaseUrl}${size}${path}`;
  }

  /**
   * Get multiple image sizes for responsive design
   */
  getImageSizes(path) {
    if (!path) return null;
    
    return {
      small: this.getImageUrl(path, 'w185'),
      medium: this.getImageUrl(path, 'w342'),
      large: this.getImageUrl(path, 'w500'),
      xlarge: this.getImageUrl(path, 'w780'),
      original: this.getImageUrl(path, 'original')
    };
  }
}

export default new TMDBService(); 