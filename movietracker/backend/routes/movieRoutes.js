import express from 'express';
import movieController from '../controllers/movieController.js';
import tmdbController from '../controllers/tmdbController.js';
import quotesController from '../controllers/quotesController.js';

const router = express.Router();

// Diary/Movie routes - specific routes MUST come before parameterized routes
router.get('/', movieController.getAllMovies);
router.get('/unique', movieController.getUniqueMovies);
router.get('/top-rated', movieController.getTopRatedMovies);
router.get('/rating-range', movieController.getMoviesByRatingRange);
router.get('/search', movieController.searchMovies);
router.get('/stats', movieController.getMovieStats);
router.post('/add', movieController.addMovie);

// Quotes routes
router.get('/quotes/random', quotesController.getRandomQuote);
router.get('/quotes', quotesController.getAllQuotes);

// TMDB routes (also specific routes)
router.get('/tmdb/search', tmdbController.searchMovies);
router.get('/tmdb/trending', tmdbController.getTrendingMovies);
router.get('/tmdb/genres', tmdbController.getGenres);

// Parameterized routes MUST come last to avoid conflicts
router.get('/:id', movieController.getMovieById);
router.put('/:id', movieController.updateMovie);
router.patch('/:id/rating', movieController.updateUserRating);
router.delete('/:id', movieController.deleteMovie);
router.post('/:id/enhance', movieController.enhanceWithTMDB);

export default router; 