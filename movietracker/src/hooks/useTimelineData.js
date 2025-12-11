import { useState, useEffect, useMemo, useCallback } from 'react';
import apiService from '../services/apiService';

export const useTimelineData = () => {
  const [timelineMovies, setTimelineMovies] = useState([]);
  const [timelinePagination, setTimelinePagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Search states
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState(0);
  const [yearFilter, setYearFilter] = useState('all');

  // Transform Supabase data to match frontend expectations
  const transformMovie = useCallback((movie) => {
    // Simple date parsing - just use the YYYY-MM-DD string as-is
    const watchDateString = movie.watch_date; // e.g., "2025-02-01"
    const [year, month, day] = watchDateString.split('-').map(Number);
    
    return {
      ...movie,
      rating: movie.rating || 0,
      detailedRating: movie.detailed_rating || null,
      date: movie.watch_date, // Keep the original YYYY-MM-DD format
      watchedDate: movie.watch_date, // Also store as watchedDate for timeline
      month: month,
      day: day,
      year: year,
      posterUrl: movie.poster_url,
      backdropUrl: movie.backdrop_url,
      isRewatch: movie.is_rewatch || false,
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

  // Load paginated timeline movies (includes duplicates for timeline view)
  const loadTimelineMovies = useCallback(async (page = 1, append = false) => {
    try {
      if (page === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      const response = await apiService.getAllMovies(page, 50);
      
      if (response.success) {
        const transformedData = response.data.map(transformMovie);
        
        if (append) {
          setTimelineMovies(prev => [...prev, ...transformedData]);
        } else {
          setTimelineMovies(transformedData);
        }
        setTimelinePagination(response.pagination);
        setCurrentPage(page);
      }
    } catch (err) {
      console.error('Error loading timeline movies:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [transformMovie]);

  // Load more movies
  const loadMoreMovies = useCallback(() => {
    if (timelinePagination?.hasNextPage && !loadingMore && !isSearching) {
      loadTimelineMovies(currentPage + 1, true);
    }
  }, [timelinePagination, currentPage, loadingMore, loadTimelineMovies, isSearching]);

  // Load initial data on component mount
  useEffect(() => {
    loadTimelineMovies(1);
  }, [loadTimelineMovies]);

  // Get the appropriate movies data (search results or paginated movies)
  const currentMoviesData = useMemo(() => {
    return isSearching ? searchResults : timelineMovies;
  }, [isSearching, searchResults, timelineMovies]);

  // Apply filters to movies (search is handled separately)
  const filteredMovies = useMemo(() => {
    let filtered = currentMoviesData;

    // Apply rating filter
    if (ratingFilter > 0) {
      filtered = filtered.filter(movie => (movie.rating || 0) >= ratingFilter);
    }

    // Apply year filter
    if (yearFilter !== 'all') {
      const year = parseInt(yearFilter);
      filtered = filtered.filter(movie => movie.year === year);
    }

    // Sort by date (latest first) - preserve backend order
    return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [currentMoviesData, ratingFilter, yearFilter]);

  // Available years for filtering
  const availableYears = useMemo(() => {
    const years = [...new Set(timelineMovies.map(movie => movie.year))].sort((a, b) => b - a);
    return years;
  }, [timelineMovies]);

  // Group movies by date for timeline display
  const timelineEntries = useMemo(() => {
    const grouped = filteredMovies.reduce((acc, movie) => {
      const date = movie.date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(movie);
      return acc;
    }, {});

    return Object.entries(grouped);
  }, [filteredMovies]);

  return {
    // Data
    timelineMovies: filteredMovies,
    timelineEntries,
    availableYears,
    
    // Search data
    searchResults,
    isSearching,
    searchLoading,
    
    // Pagination data
    timelinePagination: isSearching ? null : timelinePagination,
    currentPage,
    
    // Loading states
    loading,
    loadingMore,
    error,
    
    // Filters
    searchQuery,
    setSearchQuery: setSearchQueryWithSearch,
    ratingFilter,
    setRatingFilter,
    yearFilter,
    setYearFilter,
    
    // Functions
    loadMoreMovies,
  };
}; 