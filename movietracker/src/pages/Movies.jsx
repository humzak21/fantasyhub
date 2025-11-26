import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Star, Film, RotateCcw, ChevronDown, Search, X, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import { motion, useAnimation, useInView } from 'framer-motion';
import { useSupabaseMovieData } from '../hooks/useSupabaseMovieData';
import MovieDetailsModal from '../components/MovieDetailsModal';
import StarDisplay from '../components/StarDisplay';

function Movies() {
  const { 
    movies, // Use current movies data (search results or paginated movies)
    moviesPagination,
    loadingMoreMovies,
    loadMoreMovies,
    searchQuery, 
    setSearchQuery, 
    ratingFilter, 
    setRatingFilter, 
    yearFilter, 
    setYearFilter,
    availableYears,
    observeMovieCards,
    loading,
    error,
    isSearching,
    searchLoading
  } = useSupabaseMovieData();

  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedMovieIndex, setSelectedMovieIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Enhanced filter states
  const [ratingFilterType, setRatingFilterType] = useState('minimum'); // 'minimum', 'exact', 'range'
  const [exactRating, setExactRating] = useState(0);
  const [ratingRangeMin, setRatingRangeMin] = useState(0);
  const [ratingRangeMax, setRatingRangeMax] = useState(5);
  const [detailedRatingMin, setDetailedRatingMin] = useState(0);
  const [detailedRatingMax, setDetailedRatingMax] = useState(100);
  const [useDetailedRating, setUseDetailedRating] = useState(false);

  // Animation controls and refs
  const movieGridControls = useAnimation();
  const movieGridRef = useRef(null);
  const movieGridInView = useInView(movieGridRef, { once: true, threshold: 0.1 });
  
  // Track animated cards to prevent re-animation during pagination
  const animatedCardsRef = useRef(new Set());
  const [initialAnimationComplete, setInitialAnimationComplete] = useState(false);

  const loadMoreTriggerRef = useRef(null);

  // Animation variants
  const fadeInUp = {
    hidden: { 
      opacity: 0, 
      y: 60,
      scale: 0.95
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.8,
        ease: [0.25, 0.1, 0.25, 1]
      }
    }
  };

  const staggerContainer = {
    hidden: { opacity: 1 }, // Keep container visible
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1
      }
    }
  };

  const movieCardVariant = {
    hidden: { 
      opacity: 0, 
      y: 30,
      scale: 0.95
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.1, 0.25, 1]
      }
    }
  };

  // Function to determine if a card should animate
  const shouldAnimateCard = (movieId) => {
    if (!initialAnimationComplete) return true; // Initial load - animate all
    if (isSearching) return true; // Search results - animate all
    return !animatedCardsRef.current.has(movieId); // Pagination - only new cards
  };

  // Apply enhanced filters to movies
  const filteredMovies = useMemo(() => {
    let filtered = movies;

    // Apply star rating filters
    if (useDetailedRating) {
      // Filter by detailed rating (percentage)
      filtered = filtered.filter(movie => {
        const detailedRating = movie.detailedRating || 0;
        return detailedRating >= detailedRatingMin && detailedRating <= detailedRatingMax;
      });
    } else {
      // Filter by star rating
      if (ratingFilterType === 'minimum' && ratingFilter > 0) {
        filtered = filtered.filter(movie => (movie.rating || 0) >= ratingFilter);
      } else if (ratingFilterType === 'exact' && exactRating > 0) {
        filtered = filtered.filter(movie => (movie.rating || 0) === exactRating);
      } else if (ratingFilterType === 'range') {
        filtered = filtered.filter(movie => {
          const rating = movie.rating || 0;
          return rating >= ratingRangeMin && rating <= ratingRangeMax;
        });
      }
    }

    // Apply year filter
    if (yearFilter !== 'all') {
      const year = parseInt(yearFilter);
      filtered = filtered.filter(movie => movie.year === year);
    }

    // Don't apply additional sorting - preserve backend order (latest watched first)
    return filtered;
  }, [movies, ratingFilter, ratingFilterType, exactRating, ratingRangeMin, ratingRangeMax, detailedRatingMin, detailedRatingMax, useDetailedRating, yearFilter]);

  // Get unique movies count for display
  const uniqueMoviesCount = useMemo(() => {
    const uniqueTitles = new Set();
    filteredMovies.forEach(movie => {
      uniqueTitles.add(movie.title.toLowerCase());
    });
    return uniqueTitles.size;
  }, [filteredMovies]);

  // Trigger initial animations when movie grid comes into view
  useEffect(() => {
    if (movieGridInView && !initialAnimationComplete) {
      movieGridControls.start('visible').then(() => {
        setInitialAnimationComplete(true);
        // Mark all current movies as animated
        filteredMovies.forEach(movie => {
          animatedCardsRef.current.add(movie.id || `${movie.title}-${movie.date}`);
        });
      });
    }
  }, [movieGridInView, movieGridControls, initialAnimationComplete, filteredMovies]);

  // Also trigger animations immediately when movies first load (don't wait for intersection)
  useEffect(() => {
    if (!initialAnimationComplete && filteredMovies.length > 0 && !loading) {
      movieGridControls.start('visible').then(() => {
        setInitialAnimationComplete(true);
        // Mark all current movies as animated
        filteredMovies.forEach(movie => {
          animatedCardsRef.current.add(movie.id || `${movie.title}-${movie.date}`);
        });
      });
    }
  }, [filteredMovies.length, loading, initialAnimationComplete, movieGridControls, filteredMovies]);

  // Handle search - reset and animate all cards
  useEffect(() => {
    if (isSearching) {
      animatedCardsRef.current.clear();
      setInitialAnimationComplete(false);
      movieGridControls.set('hidden');
      movieGridControls.start('visible').then(() => {
        setInitialAnimationComplete(true);
        filteredMovies.forEach(movie => {
          animatedCardsRef.current.add(movie.id || `${movie.title}-${movie.date}`);
        });
      });
    }
  }, [isSearching, movieGridControls, filteredMovies]);

  // Handle new movies from pagination - only animate new ones
  useEffect(() => {
    if (initialAnimationComplete && !isSearching && filteredMovies.length > 0) {
      // Find new movies that haven't been animated
      const newMovies = filteredMovies.filter(movie => 
        !animatedCardsRef.current.has(movie.id || `${movie.title}-${movie.date}`)
      );
      
      if (newMovies.length > 0) {
        // Mark new movies as animated
        newMovies.forEach(movie => {
          animatedCardsRef.current.add(movie.id || `${movie.title}-${movie.date}`);
        });
      }
    }
  }, [filteredMovies.length, initialAnimationComplete, isSearching, filteredMovies]);

  // Set up intersection observer for movie cards
  useEffect(() => {
    const cleanup = observeMovieCards();
    return cleanup;
  }, [observeMovieCards]);

  // Infinite scroll intersection observer (disabled during search)
  const handleIntersection = useCallback((entries) => {
    const [entry] = entries;
    if (entry.isIntersecting && moviesPagination?.hasNextPage && !loadingMoreMovies && !isSearching) {
      loadMoreMovies();
    }
  }, [moviesPagination, loadingMoreMovies, loadMoreMovies, isSearching]);

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersection, {
      threshold: 0.1,
      rootMargin: '100px'
    });

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [handleIntersection]);

  // Handle movie card click
  const handleMovieClick = (movie, index) => {
    setSelectedMovie(movie);
    setSelectedMovieIndex(index);
    setIsModalOpen(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedMovie(null);
  };

  // Handle navigation in modal
  const handleModalNavigate = (newIndex) => {
    if (newIndex >= 0 && newIndex < filteredMovies.length) {
      setSelectedMovie(filteredMovies[newIndex]);
      setSelectedMovieIndex(newIndex);
    }
  };

  // Reset enhanced filters when switching rating types
  const handleRatingTypeChange = (newType) => {
    setRatingFilterType(newType);
    // Reset the original rating filter when switching to enhanced filters
    if (newType !== 'minimum') {
      setRatingFilter(0);
    }
    // Reset enhanced filters when switching back to minimum
    if (newType === 'minimum') {
      setExactRating(0);
      setRatingRangeMin(0);
      setRatingRangeMax(5);
    }
  };

  if (error) {
    return (
      <div className="section">
        <div className="container">
          <h2 className="section-title">Error Loading Movies</h2>
          <p style={{ color: '#ff4444' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container">
        <h2 className="section-title">All Movies</h2>
        
        {/* Enhanced Filters */}
        <div className="filters-container">
          <div className="search-filter-wrapper">
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search movies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input-modern"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="search-clear-btn"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          
          <div className="filter-pills-container">
            {/* Year Filter Pill */}
            <div className="filter-pill">
              <ChevronDown size={14} className="filter-pill-icon" />
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="filter-pill-select"
              >
                <option value="all">All Years</option>
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* Rating Type Filter Pill */}
            <div className="filter-pill">
              <Star size={14} className="filter-pill-icon" />
              <select
                value={useDetailedRating ? 'detailed' : ratingFilterType}
                onChange={(e) => {
                  if (e.target.value === 'detailed') {
                    setUseDetailedRating(true);
                    setRatingFilterType('minimum');
                    setRatingFilter(0);
                  } else {
                    setUseDetailedRating(false);
                    handleRatingTypeChange(e.target.value);
                  }
                }}
                className="filter-pill-select"
              >
                <option value="minimum">Min Rating</option>
                <option value="exact">Exact Rating</option>
                <option value="range">Rating Range</option>
                <option value="detailed">Score (%)</option>
              </select>
            </div>

            {/* Rating Value Filters */}
            {!useDetailedRating && ratingFilterType === 'minimum' && (
              <div className="filter-pill">
                <Star size={14} className="filter-pill-icon" />
                <select
                  value={ratingFilter}
                  onChange={(e) => setRatingFilter(Number(e.target.value))}
                  className="filter-pill-select"
                >
                  <option value={0}>Any Rating</option>
                  <option value={1}>1+ ⭐</option>
                  <option value={2}>2+ ⭐</option>
                  <option value={3}>3+ ⭐</option>
                  <option value={4}>4+ ⭐</option>
                  <option value={5}>5 ⭐</option>
                </select>
              </div>
            )}

            {!useDetailedRating && ratingFilterType === 'exact' && (
              <div className="filter-pill">
                <Star size={14} className="filter-pill-icon" />
                <select
                  value={exactRating}
                  onChange={(e) => setExactRating(Number(e.target.value))}
                  className="filter-pill-select"
                >
                  <option value={0}>Any Rating</option>
                  <option value={1}>Exactly 1 ⭐</option>
                  <option value={2}>Exactly 2 ⭐</option>
                  <option value={3}>Exactly 3 ⭐</option>
                  <option value={4}>Exactly 4 ⭐</option>
                  <option value={5}>Exactly 5 ⭐</option>
                </select>
              </div>
            )}

            {!useDetailedRating && ratingFilterType === 'range' && (
              <>
                <div className="filter-pill">
                  <TrendingUp size={14} className="filter-pill-icon" />
                  <select
                    value={ratingRangeMin}
                    onChange={(e) => setRatingRangeMin(Number(e.target.value))}
                    className="filter-pill-select"
                  >
                    <option value={0}>Min: Any</option>
                    <option value={1}>Min: 1⭐</option>
                    <option value={2}>Min: 2⭐</option>
                    <option value={3}>Min: 3⭐</option>
                    <option value={4}>Min: 4⭐</option>
                    <option value={5}>Min: 5⭐</option>
                  </select>
                </div>
                <div className="filter-pill">
                  <TrendingDown size={14} className="filter-pill-icon" />
                  <select
                    value={ratingRangeMax}
                    onChange={(e) => setRatingRangeMax(Number(e.target.value))}
                    className="filter-pill-select"
                  >
                    <option value={1}>Max: 1⭐</option>
                    <option value={2}>Max: 2⭐</option>
                    <option value={3}>Max: 3⭐</option>
                    <option value={4}>Max: 4⭐</option>
                    <option value={5}>Max: 5⭐</option>
                  </select>
                </div>
              </>
            )}

            {/* Detailed Rating Filters */}
            {useDetailedRating && (
              <>
                <div className="filter-pill-input">
                  <Percent size={14} className="filter-pill-icon" />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={detailedRatingMin}
                    onChange={(e) => setDetailedRatingMin(Number(e.target.value))}
                    className="filter-pill-number-input"
                    placeholder="Min"
                  />
                  <span className="filter-pill-unit">%</span>
                </div>
                <div className="filter-pill-input">
                  <Percent size={14} className="filter-pill-icon" />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={detailedRatingMax}
                    onChange={(e) => setDetailedRatingMax(Number(e.target.value))}
                    className="filter-pill-number-input"
                    placeholder="Max"
                  />
                  <span className="filter-pill-unit">%</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Results count */}
        <p style={{ marginBottom: '30px', color: '#666' }}>
          {isSearching && searchQuery ? 'Search results: ' : ''}
          {filteredMovies.length} movie{filteredMovies.length !== 1 ? 's' : ''} 
          {uniqueMoviesCount !== filteredMovies.length && ` (${uniqueMoviesCount} unique film${uniqueMoviesCount !== 1 ? 's' : ''})`}
          {searchLoading && ' (searching...)'}
        </p>
        
        <motion.div 
          ref={movieGridRef}
          className="movie-grid"
          variants={staggerContainer}
          initial="visible"
          animate="visible"
        >
          {filteredMovies.map((movie, index) => {
            const movieKey = movie.id || `${movie.title}-${movie.date}`;
            const isNewCard = !animatedCardsRef.current.has(movieKey);
            
            return (
              <motion.div 
                key={movieKey} 
                className="movie-card"
                data-movie-title={movie.title}
                onClick={() => handleMovieClick(movie, index)}
                variants={movieCardVariant}
                initial={initialAnimationComplete && isNewCard ? "hidden" : "visible"}
                animate="visible"
                whileHover={{ 
                  scale: 1.05,
                  y: -8,
                  transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }
                }}
                whileTap={{ 
                  scale: 0.98,
                  transition: { duration: 0.1 }
                }}
              >
                <div className="movie-poster">
                  {movie.posterUrl ? (
                    <img
                      src={movie.posterUrl}
                      alt={`${movie.title} poster`}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div className="poster-fallback" style={{ display: movie.posterUrl ? 'none' : 'flex' }}>
                    <Film size={48} />
                  </div>
                  
                  {/* Rewatch indicator overlay */}
                  {(movie.rewatch || movie.isRewatch) && (
                    <div className="rewatch-indicator">
                      <RotateCcw size={16} />
                    </div>
                  )}
                </div>
                <div className="movie-info">
                  <div className="movie-header">
                    <h4 className="movie-title">{movie.title}</h4>
                    <div className="movie-year">{movie.year}</div>
                  </div>
                  
                  <div className="movie-ratings">
                    <StarDisplay rating={movie.rating} />
                    <div className="detailed-rating">
                      {movie.detailedRating || '—'}
                    </div>
                  </div>
                  
                  <div className="movie-date">
                    {movie.month}/{movie.day}/{movie.year}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Show message when no results found */}
        {filteredMovies.length === 0 && !loading && !searchLoading && (
          <div style={{ 
            textAlign: 'center', 
            marginTop: '40px', 
            color: '#666',
            fontSize: '16px'
          }}>
            {isSearching ? 'No movies found matching your search and filters.' : 'No movies found with the selected filters.'}
          </div>
        )}

        {/* Infinite scroll trigger (only when not searching) */}
        {!isSearching && moviesPagination?.hasNextPage && (
          <div
            ref={loadMoreTriggerRef}
            style={{
              height: '20px',
              margin: '40px 0',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            {loadingMoreMovies && (
              <div style={{ color: '#666', fontSize: '14px' }}>
                Loading more movies...
              </div>
            )}
          </div>
        )}

        {/* Manual Load More Button (as fallback) */}
        {!isSearching && moviesPagination?.hasNextPage && !loadingMoreMovies && (
          <div style={{ textAlign: 'center', marginTop: '40px' }}>
            <button
              onClick={loadMoreMovies}
              style={{
                background: 'var(--primary-blue)',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Load More Movies
            </button>
          </div>
        )}
      </div>

      {/* Movie Details Modal */}
      <MovieDetailsModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        movie={selectedMovie}
        movies={filteredMovies}
        currentIndex={selectedMovieIndex}
        onNavigate={handleModalNavigate}
      />
    </div>
  );
}

export default Movies; 