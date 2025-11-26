import statsService from '../services/statsService.js';

class StatsController {
  /**
   * Get dashboard overview statistics
   * GET /api/stats/dashboard
   */
  async getDashboardStats(req, res) {
    try {
      const stats = await statsService.getDashboardStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dashboard statistics',
        details: error.message
      });
    }
  }

  /**
   * Get all basic watch metrics
   * GET /api/stats/basic
   */
  async getBasicStats(req, res) {
    try {
      const stats = await statsService.getAllBasicStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting basic stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch basic statistics',
        details: error.message
      });
    }
  }

  /**
   * Get all temporal analysis statistics
   * GET /api/stats/temporal
   */
  async getTemporalStats(req, res) {
    try {
      const stats = await statsService.getAllTemporalStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting temporal stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch temporal statistics',
        details: error.message
      });
    }
  }

  /**
   * Get all content analysis statistics
   * GET /api/stats/content
   */
  async getContentStats(req, res) {
    try {
      const stats = await statsService.getAllContentStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting content stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch content statistics',
        details: error.message
      });
    }
  }

  /**
   * Get comprehensive statistics (all categories)
   * GET /api/stats/comprehensive
   */
  async getComprehensiveStats(req, res) {
    try {
      const stats = await statsService.getComprehensiveStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting comprehensive stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch comprehensive statistics',
        details: error.message
      });
    }
  }

  // ==========================================
  // SPECIFIC STAT ENDPOINTS
  // ==========================================

  /**
   * Get rating distribution histogram
   * GET /api/stats/rating-distribution
   */
  async getRatingDistribution(req, res) {
    try {
      const distribution = await statsService.getRatingDistribution();
      
      res.json({
        success: true,
        data: distribution
      });
    } catch (error) {
      console.error('Error getting rating distribution:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rating distribution',
        details: error.message
      });
    }
  }

  /**
   * Get films watched per year
   * GET /api/stats/films-per-year
   */
  async getFilmsPerYear(req, res) {
    try {
      const yearData = await statsService.getFilmsPerYear();
      
      res.json({
        success: true,
        data: yearData
      });
    } catch (error) {
      console.error('Error getting films per year:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch films per year data',
        details: error.message
      });
    }
  }

  /**
   * Get films watched per month (heat map data)
   * GET /api/stats/films-per-month
   */
  async getFilmsPerMonth(req, res) {
    try {
      const monthData = await statsService.getFilmsPerMonth();
      
      res.json({
        success: true,
        data: monthData
      });
    } catch (error) {
      console.error('Error getting films per month:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch films per month data',
        details: error.message
      });
    }
  }

  /**
   * Get genre statistics
   * GET /api/stats/genres
   */
  async getGenreStats(req, res) {
    try {
      const genreStats = await statsService.getGenreStats();
      
      res.json({
        success: true,
        data: genreStats
      });
    } catch (error) {
      console.error('Error getting genre stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch genre statistics',
        details: error.message
      });
    }
  }

  /**
   * Get director statistics
   * GET /api/stats/directors
   */
  async getDirectorStats(req, res) {
    try {
      const directorStats = await statsService.getDirectorStats();
      
      res.json({
        success: true,
        data: directorStats
      });
    } catch (error) {
      console.error('Error getting director stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch director statistics',
        details: error.message
      });
    }
  }

  /**
   * Get runtime statistics and distribution
   * GET /api/stats/runtime
   */
  async getRuntimeStats(req, res) {
    try {
      const [runtimeStats, runtimeDistribution] = await Promise.all([
        statsService.getRuntimeStats(),
        statsService.getRuntimeDistribution()
      ]);
      
      res.json({
        success: true,
        data: {
          stats: runtimeStats,
          distribution: runtimeDistribution
        }
      });
    } catch (error) {
      console.error('Error getting runtime stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch runtime statistics',
        details: error.message
      });
    }
  }

  /**
   * Get rewatch analysis
   * GET /api/stats/rewatches
   */
  async getRewatchStats(req, res) {
    try {
      const rewatchStats = await statsService.getRewatchStats();
      
      res.json({
        success: true,
        data: rewatchStats
      });
    } catch (error) {
      console.error('Error getting rewatch stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rewatch statistics',
        details: error.message
      });
    }
  }

  /**
   * Get earliest and latest films watched
   * GET /api/stats/earliest-latest-films
   */
  async getEarliestLatestFilms(req, res) {
    try {
      const films = await statsService.getEarliestLatestFilms();
      
      res.json({
        success: true,
        data: films
      });
    } catch (error) {
      console.error('Error getting earliest/latest films:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch earliest/latest films',
        details: error.message
      });
    }
  }

  /**
   * Get day of week patterns
   * GET /api/stats/day-of-week
   */
  async getDayOfWeekPatterns(req, res) {
    try {
      const patterns = await statsService.getDayOfWeekPatterns();
      
      res.json({
        success: true,
        data: patterns
      });
    } catch (error) {
      console.error('Error getting day of week patterns:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch day of week patterns',
        details: error.message
      });
    }
  }

  /**
   * Get seasonal patterns
   * GET /api/stats/seasonal
   */
  async getSeasonalPatterns(req, res) {
    try {
      const patterns = await statsService.getSeasonalPatterns();
      
      res.json({
        success: true,
        data: patterns
      });
    } catch (error) {
      console.error('Error getting seasonal patterns:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch seasonal patterns',
        details: error.message
      });
    }
  }

  /**
   * Get films by decade
   * GET /api/stats/decades
   */
  async getFilmsByDecade(req, res) {
    try {
      const decadeData = await statsService.getFilmsByDecade();
      
      res.json({
        success: true,
        data: decadeData
      });
    } catch (error) {
      console.error('Error getting films by decade:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch films by decade',
        details: error.message
      });
    }
  }

  /**
   * Get watching gaps and streaks analysis
   * GET /api/stats/gaps-and-streaks
   */
  async getGapsAndStreaks(req, res) {
    try {
      const [gapsAnalysis, watchingStreaks] = await Promise.all([
        statsService.getWatchingGapsAnalysis(),
        statsService.getWatchingStreaks()
      ]);
      
      res.json({
        success: true,
        data: {
          gaps: gapsAnalysis,
          streaks: watchingStreaks
        }
      });
    } catch (error) {
      console.error('Error getting gaps and streaks:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch gaps and streaks analysis',
        details: error.message
      });
    }
  }

  /**
   * Get binge watching sessions
   * GET /api/stats/binge-sessions
   */
  async getBingeSessions(req, res) {
    try {
      const bingeSessions = await statsService.getBingeSessions();
      
      res.json({
        success: true,
        data: bingeSessions
      });
    } catch (error) {
      console.error('Error getting binge sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch binge sessions',
        details: error.message
      });
    }
  }

  /**
   * Get daily watch counts
   * GET /api/stats/daily-counts
   */
  async getDailyWatchCounts(req, res) {
    try {
      const dailyCounts = await statsService.getDailyWatchCounts();
      
      res.json({
        success: true,
        data: dailyCounts
      });
    } catch (error) {
      console.error('Error getting daily watch counts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch daily watch counts',
        details: error.message
      });
    }
  }

  /**
   * Get viewing velocity analysis
   * GET /api/stats/viewing-velocity?period=30
   */
  async getViewingVelocity(req, res) {
    try {
      const period = parseInt(req.query.period) || 30;
      const velocity = await statsService.getViewingVelocity(period);
      
      res.json({
        success: true,
        data: velocity,
        period: period
      });
    } catch (error) {
      console.error('Error getting viewing velocity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch viewing velocity',
        details: error.message
      });
    }
  }

  /**
   * Get review length statistics
   * GET /api/stats/review-length
   */
  async getReviewLengthStats(req, res) {
    try {
      const reviewStats = await statsService.getReviewLengthStats();
      
      res.json({
        success: true,
        data: reviewStats
      });
    } catch (error) {
      console.error('Error getting review length stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch review length statistics',
        details: error.message
      });
    }
  }

  /**
   * Get release year analysis
   * GET /api/stats/release-years
   */
  async getReleaseYearAnalysis(req, res) {
    try {
      const releaseYearData = await statsService.getReleaseYearAnalysis();
      
      res.json({
        success: true,
        data: releaseYearData
      });
    } catch (error) {
      console.error('Error getting release year analysis:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch release year analysis',
        details: error.message
      });
    }
  }

  /**
   * Get custom period analysis
   * GET /api/stats/custom-period?start=2024-01-01&end=2024-12-31
   */
  async getCustomPeriodAnalysis(req, res) {
    try {
      const { start, end } = req.query;
      
      if (!start || !end) {
        return res.status(400).json({
          success: false,
          error: 'Both start and end dates are required',
          details: 'Please provide start and end query parameters in YYYY-MM-DD format'
        });
      }

      const analysis = await statsService.getCustomPeriodAnalysis(start, end);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Error getting custom period analysis:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch custom period analysis',
        details: error.message
      });
    }
  }

  /**
   * Get films logged in a specific period
   * GET /api/stats/films-logged?type=year&year=2024&month=6
   */
  async getFilmsLoggedPeriod(req, res) {
    try {
      const { type = 'year', year, month } = req.query;
      
      const count = await statsService.getFilmsLoggedPeriod(
        type,
        year ? parseInt(year) : null,
        month ? parseInt(month) : null
      );
      
      res.json({
        success: true,
        data: {
          count,
          period: {
            type,
            year: year ? parseInt(year) : null,
            month: month ? parseInt(month) : null
          }
        }
      });
    } catch (error) {
      console.error('Error getting films logged period:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch films logged in period',
        details: error.message
      });
    }
  }

  /**
   * Get watch span information
   * GET /api/stats/watch-span
   */
  async getWatchSpan(req, res) {
    try {
      const watchSpan = await statsService.getWatchSpan();
      
      res.json({
        success: true,
        data: watchSpan
      });
    } catch (error) {
      console.error('Error getting watch span:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch watch span',
        details: error.message
      });
    }
  }

  /**
   * Get basic counts (total sessions and unique films)
   * GET /api/stats/counts
   */
  async getBasicCounts(req, res) {
    try {
      const [totalSessions, uniqueFilms] = await Promise.all([
        statsService.getTotalViewingSessions(),
        statsService.getUniqueFilmsCount()
      ]);
      
      res.json({
        success: true,
        data: {
          totalSessions,
          uniqueFilms
        }
      });
    } catch (error) {
      console.error('Error getting basic counts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch basic counts',
        details: error.message
      });
    }
  }

  /**
   * Get rating statistics
   * GET /api/stats/ratings
   */
  async getRatingStats(req, res) {
    try {
      const ratingStats = await statsService.getRatingStats();
      
      res.json({
        success: true,
        data: ratingStats
      });
    } catch (error) {
      console.error('Error getting rating stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rating statistics',
        details: error.message
      });
    }
  }
}

export default new StatsController(); 