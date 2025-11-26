import { supabaseAdmin, isSupabaseConfigured } from '../config/database.js';

class StatsService {
  /**
   * Check if database is available
   */
  _checkDatabase() {
    if (!isSupabaseConfigured) {
      throw new Error('Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
    }
  }

  /**
   * Execute a database function and return results
   */
  async _executeFunction(functionName, params = {}) {
    this._checkDatabase();
    
    try {
      const { data, error } = await supabaseAdmin.rpc(functionName, params);
      
      if (error) {
        console.error(`Error executing ${functionName}:`, error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error(`Error in _executeFunction(${functionName}):`, error);
      throw error;
    }
  }

  // ==========================================
  // BASIC WATCH METRICS
  // ==========================================

  /**
   * Get total viewing sessions (including rewatches)
   */
  async getTotalViewingSessions() {
    return await this._executeFunction('get_total_viewing_sessions');
  }

  /**
   * Get unique films count (no duplicates)
   */
  async getUniqueFilmsCount() {
    return await this._executeFunction('get_unique_films_count');
  }

  /**
   * Get films logged in a specific period
   */
  async getFilmsLoggedPeriod(periodType = 'year', targetYear = null, targetMonth = null) {
    return await this._executeFunction('get_films_logged_period', {
      period_type: periodType,
      target_year: targetYear,
      target_month: targetMonth
    });
  }

  /**
   * Get comprehensive rating statistics
   */
  async getRatingStats() {
    try {
      const result = await this._executeFunction('get_rating_stats');
      const data = Array.isArray(result) ? result[0] : result;
      
      // Transform the data to match frontend expectations
      if (data) {
        return {
          average_rating: data.avg_rating || data.average_rating,
          median_rating: data.median_rating,
          mode_rating: parseInt(data.mode_rating || 0),
          standard_deviation: data.standard_deviation || 0,
          total_rated: data.total_rated,
          five_star_percentage: data.five_star_percentage || 0
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting rating stats:', error);
      // Return default values if function fails
      return {
        average_rating: 0,
        median_rating: 0,
        mode_rating: 0,
        standard_deviation: 0,
        total_rated: 0,
        five_star_percentage: 0
      };
    }
  }

  /**
   * Get rating distribution histogram
   */
  async getRatingDistribution() {
    return await this._executeFunction('get_rating_distribution');
  }

  // ==========================================
  // TEMPORAL ANALYSIS
  // ==========================================

  /**
   * Get watch span (first to last watch date)
   */
  async getWatchSpan() {
    const result = await this._executeFunction('get_watch_span');
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Get earliest and latest films watched
   */
  async getEarliestLatestFilms() {
    try {
      const result = await this._executeFunction('get_earliest_latest_films');
      const data = Array.isArray(result) ? result[0] : result;
      
      if (data) {
        return {
          earliest_film: data.earliest_film,
          latest_film: data.latest_film
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting earliest/latest films:', error);
      // Fallback: calculate from raw data
      return await this._calculateEarliestLatestFallback();
    }
  }

  /**
   * Fallback calculation for earliest/latest films if function doesn't exist
   */
  async _calculateEarliestLatestFallback() {
    try {
      this._checkDatabase();
      
      // Get earliest film
      const { data: earliestData, error: earliestError } = await supabaseAdmin
        .from('diary')
        .select('title, watched_date, poster_url, release_year, id')
        .not('watched_date', 'is', null)
        .order('watched_date', { ascending: true })
        .order('id', { ascending: true })
        .limit(1);

      if (earliestError) throw earliestError;

      // Get latest film
      const { data: latestData, error: latestError } = await supabaseAdmin
        .from('diary')
        .select('title, watched_date, poster_url, release_year, id')
        .not('watched_date', 'is', null)
        .order('watched_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);

      if (latestError) throw latestError;

      return {
        earliest_film: earliestData?.[0] || null,
        latest_film: latestData?.[0] || null
      };
    } catch (error) {
      console.error('Error in earliest/latest films fallback:', error);
      return {
        earliest_film: null,
        latest_film: null
      };
    }
  }

  /**
   * Get films watched per year
   */
  async getFilmsPerYear() {
    return await this._executeFunction('get_films_per_year');
  }

  /**
   * Get films watched per month (heat map data)
   */
  async getFilmsPerMonth() {
    return await this._executeFunction('get_films_per_month');
  }

  /**
   * Get daily watch counts with binge detection
   */
  async getDailyWatchCounts() {
    return await this._executeFunction('get_daily_watch_counts');
  }

  /**
   * Get watching gaps and streaks analysis
   */
  async getWatchingGapsAnalysis() {
    const result = await this._executeFunction('get_watching_gaps_analysis');
    return Array.isArray(result) ? result[0] : result;
  }

  // ==========================================
  // RUNTIME ANALYSIS
  // ==========================================

  /**
   * Get runtime statistics
   */
  async getRuntimeStats() {
    try {
      const result = await this._executeFunction('get_runtime_stats');
      const data = Array.isArray(result) ? result[0] : result;
      
      if (data) {
        return {
          total_runtime: data.total_runtime,
          average_runtime: data.average_runtime,
          median_runtime: data.median_runtime,
          longest_runtime: data.longest_runtime,
          longest_title: data.longest_title,
          shortest_runtime: data.shortest_runtime,
          shortest_title: data.shortest_title
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting runtime stats:', error);
      // Fallback: calculate from raw data
      return await this._calculateRuntimeStatsFallback();
    }
  }

  /**
   * Fallback runtime calculation if function doesn't exist
   */
  async _calculateRuntimeStatsFallback() {
    try {
      this._checkDatabase();
      
      const { data, error } = await supabaseAdmin
        .from('diary')
        .select('runtime, title')
        .not('runtime', 'is', null)
        .gt('runtime', 0);

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          total_runtime: 0,
          average_runtime: 0,
          median_runtime: 0,
          longest_runtime: 0,
          longest_title: 'N/A',
          shortest_runtime: 0,
          shortest_title: 'N/A'
        };
      }

      const runtimes = data.map(d => d.runtime).sort((a, b) => a - b);
      const total = runtimes.reduce((sum, r) => sum + r, 0);
      const average = total / runtimes.length;
      const median = runtimes[Math.floor(runtimes.length / 2)];
      
      const longest = data.reduce((max, d) => d.runtime > max.runtime ? d : max);
      const shortest = data.reduce((min, d) => d.runtime < min.runtime ? d : min);

      return {
        total_runtime: total,
        average_runtime: parseFloat(average.toFixed(2)),
        median_runtime: median,
        longest_runtime: longest.runtime,
        longest_title: longest.title,
        shortest_runtime: shortest.runtime,
        shortest_title: shortest.title
      };
    } catch (error) {
      console.error('Error in runtime stats fallback:', error);
      return {
        total_runtime: 0,
        average_runtime: 0,
        median_runtime: 0,
        longest_runtime: 0,
        longest_title: 'N/A',
        shortest_runtime: 0,
        shortest_title: 'N/A'
      };
    }
  }

  /**
   * Get runtime distribution by bins
   */
  async getRuntimeDistribution() {
    return await this._executeFunction('get_runtime_distribution');
  }

  // ==========================================
  // CONTENT ANALYSIS
  // ==========================================

  /**
   * Get genre statistics
   */
  async getGenreStats() {
    return await this._executeFunction('get_genre_stats');
  }

  /**
   * Get director statistics
   */
  async getDirectorStats() {
    return await this._executeFunction('get_director_stats');
  }

  /**
   * Get films by decade
   */
  async getFilmsByDecade() {
    return await this._executeFunction('get_films_by_decade');
  }

  /**
   * Get release year analysis
   */
  async getReleaseYearAnalysis() {
    try {
      const result = await this._executeFunction('get_release_year_analysis');
      const data = Array.isArray(result) ? result[0] : result;
      
      if (data) {
        return {
          average_release_year: data.average_release_year || data.avg_year,
          median_release_year: data.median_release_year,
          oldest_year: data.oldest_year,
          oldest_title: data.oldest_title,
          newest_year: data.newest_year,
          newest_title: data.newest_title
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting release year analysis:', error);
      // Return default values if function fails
      return {
        average_release_year: 0,
        median_release_year: 0,
        oldest_year: 0,
        oldest_title: 'N/A',
        newest_year: 0,
        newest_title: 'N/A'
      };
    }
  }

  // ==========================================
  // REWATCH ANALYSIS
  // ==========================================

  /**
   * Get rewatch statistics
   */
  async getRewatchStats() {
    const result = await this._executeFunction('get_rewatch_stats');
    return Array.isArray(result) ? result[0] : result;
  }

  // ==========================================
  // BEHAVIORAL PATTERNS
  // ==========================================

  /**
   * Get day of week patterns
   */
  async getDayOfWeekPatterns() {
    return await this._executeFunction('get_day_of_week_patterns');
  }

  /**
   * Get seasonal patterns
   */
  async getSeasonalPatterns() {
    return await this._executeFunction('get_seasonal_patterns');
  }

  // ==========================================
  // COMPREHENSIVE STATS
  // ==========================================

  /**
   * Get dashboard overview statistics
   */
  async getDashboardStats() {
    const result = await this._executeFunction('get_dashboard_stats');
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Get review length statistics
   */
  async getReviewLengthStats() {
    const result = await this._executeFunction('get_review_length_stats');
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Get viewing velocity analysis
   */
  async getViewingVelocity(daysPeriod = 30) {
    return await this._executeFunction('get_viewing_velocity', { days_period: daysPeriod });
  }

  // ==========================================
  // AGGREGATED STATS FOR FRONTEND
  // ==========================================

  /**
   * Get all basic statistics in one call
   */
  async getAllBasicStats() {
    try {
      const [
        totalSessions,
        uniqueFilms,
        ratingStats,
        ratingDistribution,
        watchSpan
      ] = await Promise.all([
        this.getTotalViewingSessions(),
        this.getUniqueFilmsCount(),
        this.getRatingStats(),
        this.getRatingDistribution(),
        this.getWatchSpan()
      ]);

      return {
        totalSessions: totalSessions || 0,
        uniqueFilms: uniqueFilms || 0,
        ratingStats: ratingStats || {
          average_rating: 0,
          median_rating: 0,
          mode_rating: 0,
          standard_deviation: 0,
          total_rated: 0,
          five_star_percentage: 0
        },
        ratingDistribution: ratingDistribution || [],
        watchSpan: watchSpan || {
          first_watch_date: null,
          last_watch_date: null,
          watch_span: '—',
          total_days: 0
        }
      };
    } catch (error) {
      console.error('Error fetching basic stats:', error);
      // Return structured fallback data
      return {
        totalSessions: 0,
        uniqueFilms: 0,
        ratingStats: {
          average_rating: 0,
          median_rating: 0,
          mode_rating: 0,
          standard_deviation: 0,
          total_rated: 0,
          five_star_percentage: 0
        },
        ratingDistribution: [],
        watchSpan: {
          first_watch_date: null,
          last_watch_date: null,
          watch_span: '—',
          total_days: 0
        }
      };
    }
  }

  /**
   * Get all temporal statistics in one call
   */
  async getAllTemporalStats() {
    try {
      const [
        filmsPerYear,
        filmsPerMonth,
        dailyCounts,
        gapsAndStreaks,
        dayOfWeekPatterns,
        seasonalPatterns,
        runtimeStats
      ] = await Promise.all([
        this.getFilmsPerYear(),
        this.getFilmsPerMonth(),
        this.getDailyWatchCounts(),
        this.getWatchingGapsAnalysis(),
        this.getDayOfWeekPatterns(),
        this.getSeasonalPatterns(),
        this.getRuntimeStats()
      ]);

      return {
        filmsPerYear: filmsPerYear || [],
        filmsPerMonth: filmsPerMonth || [],
        dailyCounts: dailyCounts || [],
        gapsAndStreaks: gapsAndStreaks || {},
        dayOfWeekPatterns: dayOfWeekPatterns || [],
        seasonalPatterns: seasonalPatterns || [],
        runtimeStats: runtimeStats || {
          total_runtime: 0,
          average_runtime: 0,
          median_runtime: 0,
          longest_runtime: 0,
          longest_title: 'N/A',
          shortest_runtime: 0,
          shortest_title: 'N/A'
        }
      };
    } catch (error) {
      console.error('Error fetching temporal stats:', error);
      // Return structured fallback data
      return {
        filmsPerYear: [],
        filmsPerMonth: [],
        dailyCounts: [],
        gapsAndStreaks: {},
        dayOfWeekPatterns: [],
        seasonalPatterns: [],
        runtimeStats: {
          total_runtime: 0,
          average_runtime: 0,
          median_runtime: 0,
          longest_runtime: 0,
          longest_title: 'N/A',
          shortest_runtime: 0,
          shortest_title: 'N/A'
        }
      };
    }
  }

  /**
   * Get all content analysis statistics in one call
   */
  async getAllContentStats() {
    try {
      const [
        genreStats,
        directorStats,
        filmsByDecade,
        releaseYearAnalysis,
        runtimeStats,
        runtimeDistribution
      ] = await Promise.all([
        this.getGenreStats(),
        this.getDirectorStats(),
        this.getFilmsByDecade(),
        this.getReleaseYearAnalysis(),
        this.getRuntimeStats(),
        this.getRuntimeDistribution()
      ]);

      return {
        genreStats,
        directorStats,
        filmsByDecade,
        releaseYearAnalysis,
        runtimeStats,
        runtimeDistribution
      };
    } catch (error) {
      console.error('Error fetching content stats:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive statistics for dashboard
   */
  async getComprehensiveStats() {
    try {
      const [
        dashboardStats,
        basicStats,
        temporalStats,
        contentStats,
        rewatchStats,
        reviewLengthStats
      ] = await Promise.all([
        this.getDashboardStats(),
        this.getAllBasicStats(),
        this.getAllTemporalStats(),
        this.getAllContentStats(),
        this.getRewatchStats(),
        this.getReviewLengthStats()
      ]);

      return {
        dashboard: dashboardStats,
        basic: basicStats,
        temporal: temporalStats,
        content: contentStats,
        rewatches: rewatchStats,
        reviews: reviewLengthStats,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching comprehensive stats:', error);
      throw error;
    }
  }

  // ==========================================
  // CUSTOM QUERIES AND ANALYSIS
  // ==========================================

  /**
   * Get films for a specific time period with custom analysis
   */
  async getCustomPeriodAnalysis(startDate, endDate) {
    this._checkDatabase();
    
    try {
      const { data, error } = await supabaseAdmin
        .from('diary')
        .select('*')
        .gte('watched_date', startDate)
        .lte('watched_date', endDate)
        .order('watched_date');

      if (error) throw error;

      // Custom analysis on the filtered data
      const analysis = {
        totalFilms: data.length,
        uniqueFilms: new Set(data.map(d => d.title.toLowerCase())).size,
        averageRating: data.reduce((sum, d) => sum + (d.rating || 0), 0) / data.length,
        genreBreakdown: this._analyzeGenres(data),
        directorBreakdown: this._analyzeDirectors(data),
        runtimeAnalysis: this._analyzeRuntime(data),
        periodStart: startDate,
        periodEnd: endDate
      };

      return analysis;
    } catch (error) {
      console.error('Error in custom period analysis:', error);
      throw error;
    }
  }

  /**
   * Helper function to analyze genres from raw data
   */
  _analyzeGenres(data) {
    const genreCounts = {};
    
    data.forEach(film => {
      if (film.genres && Array.isArray(film.genres)) {
        film.genres.forEach(genre => {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
      }
    });

    return Object.entries(genreCounts)
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Helper function to analyze directors from raw data
   */
  _analyzeDirectors(data) {
    const directorCounts = {};
    
    data.forEach(film => {
      if (film.director) {
        directorCounts[film.director] = (directorCounts[film.director] || 0) + 1;
      }
    });

    return Object.entries(directorCounts)
      .map(([director, count]) => ({ director, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 directors
  }

  /**
   * Helper function to analyze runtime from raw data
   */
  _analyzeRuntime(data) {
    const runtimes = data.filter(d => d.runtime && d.runtime > 0).map(d => d.runtime);
    
    if (runtimes.length === 0) {
      return { totalMinutes: 0, averageMinutes: 0, totalHours: 0 };
    }

    const totalMinutes = runtimes.reduce((sum, runtime) => sum + runtime, 0);
    const averageMinutes = totalMinutes / runtimes.length;

    return {
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      averageMinutes: Math.round(averageMinutes * 10) / 10,
      longestFilm: Math.max(...runtimes),
      shortestFilm: Math.min(...runtimes)
    };
  }

  /**
   * Get binge watching sessions (days with 3+ films)
   */
  async getBingeSessions() {
    try {
      const dailyData = await this.getDailyWatchCounts();
      return dailyData.filter(day => day.is_binge_day);
    } catch (error) {
      console.error('Error fetching binge sessions:', error);
      throw error;
    }
  }

  /**
   * Get watching streaks (consecutive days with films)
   */
  async getWatchingStreaks() {
    this._checkDatabase();
    
    try {
      // Get all films with their watch dates, titles, and posters
      const { data: allFilms, error } = await supabaseAdmin
        .from('diary')
        .select('watched_date, title, poster_url, rating, director, release_year')
        .order('watched_date');

      if (error) throw error;

      // Group films by date
      const filmsByDate = {};
      allFilms.forEach(film => {
        const date = film.watched_date;
        if (!filmsByDate[date]) {
          filmsByDate[date] = [];
        }
        filmsByDate[date].push(film);
      });

      const uniqueDates = Object.keys(filmsByDate).sort();
      const streaks = [];
      let currentStreak = { dates: [uniqueDates[0]], films: [filmsByDate[uniqueDates[0]]] };

      for (let i = 1; i < uniqueDates.length; i++) {
        const prevDate = new Date(uniqueDates[i - 1]);
        const currentDate = new Date(uniqueDates[i]);
        const daysDiff = (currentDate - prevDate) / (1000 * 60 * 60 * 24);

        if (daysDiff === 1) {
          // Consecutive day
          currentStreak.dates.push(uniqueDates[i]);
          currentStreak.films.push(filmsByDate[uniqueDates[i]]);
        } else {
          // Streak broken
          if (currentStreak.dates.length > 1) {
            const allStreakFilms = currentStreak.films.flat();
            const firstDateFilms = currentStreak.films[0];
            const lastDateFilms = currentStreak.films[currentStreak.films.length - 1];
            
            streaks.push({
              startDate: currentStreak.dates[0],
              endDate: currentStreak.dates[currentStreak.dates.length - 1],
              length: currentStreak.dates.length,
              totalFilms: allStreakFilms.length,
              firstFilm: firstDateFilms[0], // First film on the first day
              lastFilm: lastDateFilms[lastDateFilms.length - 1], // Last film on the last day
              allFilms: allStreakFilms, // All films in the streak
              filmsByDate: currentStreak.films.map((dayFilms, index) => ({
                date: currentStreak.dates[index],
                films: dayFilms
              })),
              allDates: currentStreak.dates
            });
          }
          currentStreak = { dates: [uniqueDates[i]], films: [filmsByDate[uniqueDates[i]]] };
        }
      }

      // Don't forget the last streak
      if (currentStreak.dates.length > 1) {
        const allStreakFilms = currentStreak.films.flat();
        const firstDateFilms = currentStreak.films[0];
        const lastDateFilms = currentStreak.films[currentStreak.films.length - 1];
        
        streaks.push({
          startDate: currentStreak.dates[0],
          endDate: currentStreak.dates[currentStreak.dates.length - 1],
          length: currentStreak.dates.length,
          totalFilms: allStreakFilms.length,
          firstFilm: firstDateFilms[0], // First film on the first day
          lastFilm: lastDateFilms[lastDateFilms.length - 1], // Last film on the last day
          allFilms: allStreakFilms, // All films in the streak
          filmsByDate: currentStreak.films.map((dayFilms, index) => ({
            date: currentStreak.dates[index],
            films: dayFilms
          })),
          allDates: currentStreak.dates
        });
      }

      return streaks.sort((a, b) => b.length - a.length);
    } catch (error) {
      console.error('Error calculating watching streaks:', error);
      throw error;
    }
  }
}

export default new StatsService(); 