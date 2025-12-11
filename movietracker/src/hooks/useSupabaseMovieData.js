import { useState, useEffect, useMemo, useCallback } from 'react';
import apiService from '../services/apiService';
import { parseESTDate } from '../utils/dateUtils';

export const useSupabaseMovieData = () => {
  const [movies, setMovies] = useState([]);
  const [moviesPagination, setMoviesPagination] = useState(null);
  const [uniqueMovies, setUniqueMovies] = useState([]);
  const [topRatedMovies, setTopRatedMovies] = useState([]);
  const [topRatedPagination, setTopRatedPagination] = useState(null);
  const [movieStats, setMovieStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Search states
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Pagination states
  const [currentMoviesPage, setCurrentMoviesPage] = useState(1);
  const [currentTopRatedPage, setCurrentTopRatedPage] = useState(1);
  const [loadingMoreMovies, setLoadingMoreMovies] = useState(false);
  const [loadingMoreTopRated, setLoadingMoreTopRated] = useState(false);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState(0);
  const [yearFilter, setYearFilter] = useState('all');

  // Transform Supabase data to match frontend expectations
  const transformMovie = useCallback((movie) => {
    const watchDate = parseESTDate(movie.watch_date);
    
    return {
      ...movie,
      // Frontend expects these specific field names
      rating: movie.rating || 0,
      detailedRating: movie.detailed_rating || null,
      date: movie.watch_date,
      month: watchDate.getMonth() + 1,
      day: watchDate.getDate(),
      year: watchDate.getFullYear(),
      watchYear: watchDate.getFullYear(),
      posterUrl: movie.poster_url,
      backdropUrl: movie.backdrop_url,
      isRewatch: movie.is_rewatch || false,
      // Keep original fields for compatibility
      title: movie.title,
      director: movie.director,
      genres: movie.genres || [],
      overview: movie.overview,
      runtime: movie.runtime,
      release_date: movie.release_date,
      release_year: movie.release_year,
      tmdb_id: movie.tmdb_id,
      vote_average: movie.vote_average
    };
  }, []);

  // Enhanced search query setter with debouncing
  const setSearchQueryWithSearch = useCallback((query) => {
    setSearchQuery(query);
    
    if (query.trim()) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
      setSearchResults([]);
    }
  }, []);

  // Handle search with debouncing
  useEffect(() => {
    if (searchQuery.trim()) {
      setSearchLoading(true);
      
      const timeoutId = setTimeout(async () => {
        try {
          const results = await apiService.searchMovies(searchQuery.trim());
          if (results.success) {
            setSearchResults(results.data.map(transformMovie));
          }
        } catch (err) {
          console.error('Search error:', err);
        } finally {
          setSearchLoading(false);
        }
      }, 300);
      
      return () => clearTimeout(timeoutId);
    } else {
      setSearchLoading(false);
    }
  }, [searchQuery, transformMovie]);

  // Load paginated movies
  const loadMovies = useCallback(async (page = 1, append = false) => {
    try {
      if (page === 1) {
        setLoading(true);
      } else {
        setLoadingMoreMovies(true);
      }
      
      const response = await apiService.getAllMovies(page, 50);
      
      if (response.success) {
        if (append) {
          setMovies(prev => [...prev, ...response.data]);
        } else {
          setMovies(response.data || []);
        }
        setMoviesPagination(response.pagination);
        setCurrentMoviesPage(page);
      }
    } catch (err) {
      console.error('Error loading movies:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMoreMovies(false);
    }
  }, []);

  // Load paginated top-rated movies
  const loadTopRatedMovies = useCallback(async (page = 1, append = false, minRating = 90) => {
    try {
      if (page === 1) {
        setLoading(true);
      } else {
        setLoadingMoreTopRated(true);
      }
      
      const response = await apiService.getTopRatedMovies(minRating, page, 50);
      
      if (response.success) {
        if (append) {
          setTopRatedMovies(prev => [...prev, ...response.data]);
        } else {
          setTopRatedMovies(response.data || []);
        }
        setTopRatedPagination(response.pagination);
        setCurrentTopRatedPage(page);
      }
    } catch (err) {
      console.error('Error loading top-rated movies:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMoreTopRated(false);
    }
  }, []);

  // Load more movies
  const loadMoreMovies = useCallback(() => {
    if (moviesPagination?.hasNextPage && !loadingMoreMovies && !isSearching) {
      loadMovies(currentMoviesPage + 1, true);
    }
  }, [moviesPagination, currentMoviesPage, loadingMoreMovies, loadMovies, isSearching]);

  // Load more top-rated movies
  const loadMoreTopRated = useCallback(() => {
    if (topRatedPagination?.hasNextPage && !loadingMoreTopRated) {
      loadTopRatedMovies(currentTopRatedPage + 1, true, 90);
    }
  }, [topRatedPagination, currentTopRatedPage, loadingMoreTopRated, loadTopRatedMovies]);

  // Load initial data on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch initial data in parallel
        const [
          uniqueMoviesResponse,
          statsResponse
        ] = await Promise.all([
          apiService.getUniqueMovies(),
          apiService.getMovieStats(),
          // Load first page of movies and top-rated movies
          loadMovies(1),
          loadTopRatedMovies(1, false, 90)
        ]);

        if (uniqueMoviesResponse.success) {
          setUniqueMovies(uniqueMoviesResponse.data || []);
        }

        if (statsResponse.success) {
          setMovieStats(statsResponse.data);
        }

      } catch (err) {
        console.error('Error loading initial movie data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [loadMovies, loadTopRatedMovies]);

  // Transform movies for frontend consumption
  const transformedMovies = useMemo(() => {
    return movies.map(transformMovie);
  }, [movies]);

  const transformedUniqueMovies = useMemo(() => {
    return uniqueMovies.map(transformMovie);
  }, [uniqueMovies]);

  const transformedTopRatedMovies = useMemo(() => {
    return topRatedMovies.map(transformMovie);
  }, [topRatedMovies]);

  // Get the appropriate movies data (search results or paginated movies)
  const currentMoviesData = useMemo(() => {
    return isSearching ? searchResults : transformedMovies;
  }, [isSearching, searchResults, transformedMovies]);

  // Filtered movies (for Movies page)
  const filteredMovies = useMemo(() => {
    let filtered = transformedUniqueMovies; // Use unique movies for Movies page

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(movie => 
        movie.title.toLowerCase().includes(query) ||
        (movie.director && movie.director.toLowerCase().includes(query)) ||
        (movie.overview && movie.overview.toLowerCase().includes(query)) ||
        (movie.notes && movie.notes.toLowerCase().includes(query))
      );
    }

    // Apply rating filter
    if (ratingFilter > 0) {
      filtered = filtered.filter(movie => (movie.rating || 0) >= ratingFilter);
    }

    // Apply year filter
    if (yearFilter !== 'all') {
      const year = parseInt(yearFilter);
      filtered = filtered.filter(movie => movie.year === year);
    }

    return filtered;
  }, [transformedUniqueMovies, searchQuery, ratingFilter, yearFilter]);

  // Recent movies (show all entries including duplicates)
  const recentMovies = useMemo(() => {
    return transformedMovies
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 50);
  }, [transformedMovies]);

  // Available years for filtering - now based on release years
  const availableYears = useMemo(() => {
    const years = [...new Set(transformedMovies.map(movie => movie.year).filter(year => year))].sort((a, b) => b - a);
    return years;
  }, [transformedMovies]);

  // Placeholder function for poster loading (not needed with Supabase as posters are already stored)
  const observeMovieCards = () => {
    return () => {}; // No-op cleanup function
  };

  // Search function for real-time search
  const searchMovies = async (query) => {
    try {
      const response = await apiService.searchMovies(query);
      if (response.success) {
        return response.data.map(transformMovie);
      }
      return [];
    } catch (err) {
      console.error('Error searching movies:', err);
      return [];
    }
  };

  return {
    // Data
    movies: currentMoviesData, // Use current movies data (search results or paginated)
    uniqueMovies: transformedUniqueMovies, // Unique movies only
    movieStats,
    topRatedMovies: transformedTopRatedMovies, // Top-rated movies (paginated)
    recentMovies,
    filteredMovies, // Filtered unique movies for Movies page
    availableYears,
    
    // Search data
    searchResults,
    isSearching,
    searchLoading,
    
    // Pagination data
    moviesPagination: isSearching ? null : moviesPagination, // Disable pagination during search
    topRatedPagination,
    currentMoviesPage,
    currentTopRatedPage,
    
    // Loading states
    loading: loading || searchLoading,
    error,
    loadingMoreMovies,
    loadingMoreTopRated,
    isLoadingPosters: false, // Not needed with Supabase
    loadingMovieTitles: new Set(), // Not needed with Supabase
    
    // Filters
    searchQuery,
    setSearchQuery: setSearchQueryWithSearch,
    ratingFilter,
    setRatingFilter,
    yearFilter,
    setYearFilter,
    
    // Functions
    searchMovies,
    loadMoreMovies,
    loadMoreTopRated,
    observeMovieCards, // Placeholder for compatibility
    loadPostersProgressively: () => {}, // Not needed with Supabase
  };
}; 