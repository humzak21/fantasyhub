import { useState, useEffect, useMemo, useRef } from 'react';
import {
  parseMovieData,
  getEnhancedMovieData,
  getMovieStats,
  getTopMovies,
  getMoviesByDetailedRating,
  getRecentMovies,
  searchMovies,
  filterMoviesByRating,
  getGenreStats
} from '../utils/movieData';

export const useMovieData = () => {
  const [movies, setMovies] = useState([]);
  const [isLoadingPosters, setIsLoadingPosters] = useState(false);
  const [loadingMovieTitles, setLoadingMovieTitles] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState(0);
  const [yearFilter, setYearFilter] = useState('all');
  const [enhancedMovieMap, setEnhancedMovieMap] = useState(new Map());

  // Load movies on component mount
  useEffect(() => {
    const loadMovies = async () => {
      try {
        console.log('Loading movie data...');
        const csvMovies = await parseMovieData();
        console.log('CSV movies loaded:', csvMovies.length);
        
        if (csvMovies.length > 0) {
          setMovies(csvMovies);
          
          // Load enhanced data progressively in the background
          setTimeout(async () => {
            try {
              console.log('Loading enhanced movie data in background...');
              const uniqueTitles = [...new Set(csvMovies.map(m => m.title))];
              
              // Load enhanced data for unique titles only
              const enhancedMovies = await getEnhancedMovieData(csvMovies.filter((movie, index, arr) => 
                arr.findIndex(m => m.title === movie.title) === index
              ));
              
              console.log('Enhanced movies loaded:', enhancedMovies.length);
              
              // Create a map of enhanced data by title
              const enhancedMap = new Map();
              enhancedMovies.forEach(movie => {
                if (movie.tmdb) {
                  enhancedMap.set(movie.title.toLowerCase(), movie.tmdb);
                }
              });
              
              setEnhancedMovieMap(enhancedMap);
              console.log('Enhanced movie map created with', enhancedMap.size, 'entries');
            } catch (error) {
              console.error('Error loading enhanced movie data:', error);
            }
          }, 100);
        }
      } catch (error) {
        console.error('Error loading movies:', error);
      }
    };

    loadMovies();
  }, []);

  // Merge CSV movies with enhanced data
  const enhancedMovies = useMemo(() => {
    if (enhancedMovieMap.size === 0) {
      return movies;
    }

    return movies.map(csvMovie => {
      const tmdbMovie = enhancedMovieMap.get(csvMovie.title.toLowerCase());
      
      if (tmdbMovie) {
        return {
          ...csvMovie,
          tmdb: tmdbMovie,
          // Add convenient access to common TMDB fields
          genres: tmdbMovie.genres || [],
          posterUrl: tmdbMovie.posterUrl || null,
          backdropUrl: tmdbMovie.backdropUrl || null,
          overview: tmdbMovie.overview || null,
          tmdbRating: tmdbMovie.voteAverage || null,
          releaseDate: tmdbMovie.releaseDate || null,
          runtime: tmdbMovie.runtime || null
        };
      }
      
      return csvMovie;
    });
  }, [movies, enhancedMovieMap]);

  // Progressive poster loading function
  const loadPostersProgressively = async (moviesToEnhance, batchSize = 5) => {
    if (!moviesToEnhance || moviesToEnhance.length === 0) return;
    
    setIsLoadingPosters(true);
    
    try {
      // Get unique titles from the movies to enhance
      const uniqueTitles = [...new Set(moviesToEnhance.map(m => m.title))];
      
      // Load enhanced data for these specific titles
      const sampleMovies = uniqueTitles.map(title => 
        moviesToEnhance.find(m => m.title === title)
      );
      
      const enhancedMovies = await getEnhancedMovieData(sampleMovies);
      
      // Update the enhanced movie map with new data
      const newEnhancedMap = new Map(enhancedMovieMap);
      enhancedMovies.forEach(movie => {
        if (movie.tmdb) {
          newEnhancedMap.set(movie.title.toLowerCase(), movie.tmdb);
        }
      });
      
      setEnhancedMovieMap(newEnhancedMap);
      
      // Remove from loading titles
      setLoadingMovieTitles(prev => {
        const newSet = new Set(prev);
        uniqueTitles.forEach(title => newSet.delete(title));
        return newSet;
      });
      
      console.log('Loaded posters for:', uniqueTitles);
    } catch (error) {
      console.error('Error loading posters:', error);
    } finally {
      setIsLoadingPosters(false);
    }
  };

  // Observe movie cards for lazy loading
  const observeMovieCards = () => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const movieCard = entry.target;
            const movieTitle = movieCard.dataset.movieTitle;
            const needsPoster = movieCard.dataset.needsPoster === "true";
            
            if (needsPoster && movieTitle && !loadingMovieTitles.has(movieTitle)) {
              setLoadingMovieTitles(prev => new Set([...prev, movieTitle]));
              
              // Find the movie and load its poster
              const movieToEnhance = movies.find(m => m.title === movieTitle);
              if (movieToEnhance) {
                loadPostersProgressively([movieToEnhance], 1);
              }
            }
            
            observer.unobserve(movieCard);
          }
        });
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    // Observe all movie cards that need posters
    const movieCards = document.querySelectorAll('[data-needs-poster="true"]');
    movieCards.forEach(card => observer.observe(card));

    return () => observer.disconnect();
  };

  // Computed values using enhanced movies
  const movieStats = useMemo(() => {
    if (enhancedMovies.length === 0) return null;
    return getMovieStats(enhancedMovies);
  }, [enhancedMovies]);

  const topRatedMovies = useMemo(() => {
    return getMoviesByDetailedRating(enhancedMovies, 90);
  }, [enhancedMovies]);

  const recentMovies = useMemo(() => {
    return getRecentMovies(enhancedMovies, 50);
  }, [enhancedMovies]);

  const filteredMovies = useMemo(() => {
    let filtered = enhancedMovies;

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = searchMovies(filtered, searchQuery);
    }

    // Apply rating filter
    if (ratingFilter > 0) {
      filtered = filterMoviesByRating(filtered, ratingFilter);
    }

    // Apply year filter
    if (yearFilter !== 'all') {
      const year = parseInt(yearFilter);
      filtered = filtered.filter(movie => movie.year === year);
    }

    return filtered;
  }, [enhancedMovies, searchQuery, ratingFilter, yearFilter]);

  const availableYears = useMemo(() => {
    const years = [...new Set(enhancedMovies.map(movie => movie.year))].sort((a, b) => b - a);
    return years;
  }, [enhancedMovies]);

  return {
    // Data
    movies: enhancedMovies,
    movieStats,
    topRatedMovies,
    recentMovies,
    filteredMovies,
    availableYears,
    
    // Loading states
    isLoadingPosters,
    loadingMovieTitles,
    
    // Filters
    searchQuery,
    setSearchQuery,
    ratingFilter,
    setRatingFilter,
    yearFilter,
    setYearFilter,
    
    // Functions
    loadPostersProgressively,
    observeMovieCards
  };
}; 