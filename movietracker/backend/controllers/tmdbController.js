import tmdbService from '../services/tmdbService.js';

class TMDBController {
  /**
   * Search TMDB for movies
   */
  async searchMovies(req, res) {
    try {
      const { q: query, year } = req.query;

      if (!query || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required'
        });
      }

      const results = await tmdbService.searchMovies(query.trim(), year);

      // Add poster URLs to results
      const enhancedResults = results.map(movie => ({
        ...movie,
        poster_url: movie.poster_path ? tmdbService.getImageUrl(movie.poster_path) : null,
        backdrop_url: movie.backdrop_path ? tmdbService.getImageUrl(movie.backdrop_path) : null
      }));

      res.json({
        success: true,
        data: enhancedResults,
        count: enhancedResults.length
      });

    } catch (error) {
      console.error('Error in searchMovies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search TMDB',
        details: error.message
      });
    }
  }

  /**
   * Get trending movies from TMDB
   */
  async getTrendingMovies(req, res) {
    try {
      const { timeWindow = 'week' } = req.query;
      const data = await tmdbService.getTrendingMovies(timeWindow);

      // Add poster URLs to results
      const enhancedResults = data.results?.map(movie => ({
        ...movie,
        poster_url: movie.poster_path ? tmdbService.getImageUrl(movie.poster_path) : null,
        backdrop_url: movie.backdrop_path ? tmdbService.getImageUrl(movie.backdrop_path) : null
      })) || [];

      res.json({
        success: true,
        data: enhancedResults,
        count: enhancedResults.length
      });

    } catch (error) {
      console.error('Error in getTrendingMovies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch trending movies',
        details: error.message
      });
    }
  }

  /**
   * Get movie genres from TMDB
   */
  async getGenres(req, res) {
    try {
      const genres = await tmdbService.getGenres();

      res.json({
        success: true,
        data: genres,
        count: genres.length
      });

    } catch (error) {
      console.error('Error in getGenres:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch genres',
        details: error.message
      });
    }
  }
}

export default new TMDBController(); 