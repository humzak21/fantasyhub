import express from 'express';
import statsController from '../controllers/statsController.js';

const router = express.Router();

// ==========================================
// COMPREHENSIVE STATS ENDPOINTS
// ==========================================

/**
 * Get dashboard overview statistics
 * Returns all key metrics for the main dashboard
 */
router.get('/dashboard', statsController.getDashboardStats);

/**
 * Get all basic watch metrics
 * Returns total sessions, unique films, ratings, etc.
 */
router.get('/basic', statsController.getBasicStats);

/**
 * Get all temporal analysis statistics
 * Returns time-based patterns and trends
 */
router.get('/temporal', statsController.getTemporalStats);

/**
 * Get all content analysis statistics
 * Returns genre, director, runtime analysis
 */
router.get('/content', statsController.getContentStats);

/**
 * Get comprehensive statistics (all categories)
 * Returns everything - use for full analytics page
 */
router.get('/comprehensive', statsController.getComprehensiveStats);

// ==========================================
// SPECIFIC METRICS ENDPOINTS
// ==========================================

// Basic Metrics
router.get('/counts', statsController.getBasicCounts);
router.get('/ratings', statsController.getRatingStats);
router.get('/rating-distribution', statsController.getRatingDistribution);
router.get('/watch-span', statsController.getWatchSpan);

// Temporal Analysis
router.get('/films-per-year', statsController.getFilmsPerYear);
router.get('/films-per-month', statsController.getFilmsPerMonth);
router.get('/daily-counts', statsController.getDailyWatchCounts);
router.get('/gaps-and-streaks', statsController.getGapsAndStreaks);
router.get('/day-of-week', statsController.getDayOfWeekPatterns);
router.get('/seasonal', statsController.getSeasonalPatterns);

// Content Analysis
router.get('/genres', statsController.getGenreStats);
router.get('/directors', statsController.getDirectorStats);
router.get('/runtime', statsController.getRuntimeStats);
router.get('/decades', statsController.getFilmsByDecade);
router.get('/release-years', statsController.getReleaseYearAnalysis);

// Behavioral Analysis
router.get('/rewatches', statsController.getRewatchStats);
router.get('/earliest-latest-films', statsController.getEarliestLatestFilms);
router.get('/binge-sessions', statsController.getBingeSessions);
router.get('/viewing-velocity', statsController.getViewingVelocity);
router.get('/review-length', statsController.getReviewLengthStats);

// Custom Analysis
router.get('/custom-period', statsController.getCustomPeriodAnalysis);
router.get('/films-logged', statsController.getFilmsLoggedPeriod);

export default router; 