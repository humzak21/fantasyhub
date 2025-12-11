import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Star, Film, RotateCcw, Trophy, Calendar, Users, Clock, Tag } from 'lucide-react';
import { motion, useAnimation, useInView } from 'framer-motion';
import { useSupabaseMovieData } from '../hooks/useSupabaseMovieData';
import MovieDetailsModal from '../components/MovieDetailsModal';
import StarDisplay from '../components/StarDisplay';

function TopRated() {
  const { 
    topRatedMovies,
    topRatedPagination,
    loadingMoreTopRated,
    loadMoreTopRated,
    observeMovieCards,
    loading,
    error
  } = useSupabaseMovieData();

  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedMovieIndex, setSelectedMovieIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
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
    return !animatedCardsRef.current.has(movieId); // Pagination - only new cards
  };

  // Trigger initial animations when movie grid comes into view
  useEffect(() => {
    if (movieGridInView && !initialAnimationComplete) {
      movieGridControls.start('visible').then(() => {
        setInitialAnimationComplete(true);
        // Mark all current movies as animated
        topRatedMovies.forEach(movie => {
          animatedCardsRef.current.add(movie.id || `${movie.title}-${movie.date}`);
        });
      });
    }
  }, [movieGridInView, movieGridControls, initialAnimationComplete, topRatedMovies]);

  // Also trigger animations immediately when movies first load (don't wait for intersection)
  useEffect(() => {
    if (!initialAnimationComplete && topRatedMovies.length > 0 && !loading) {
      movieGridControls.start('visible').then(() => {
        setInitialAnimationComplete(true);
        // Mark all current movies as animated
        topRatedMovies.forEach(movie => {
          animatedCardsRef.current.add(movie.id || `${movie.title}-${movie.date}`);
        });
      });
    }
  }, [topRatedMovies.length, loading, initialAnimationComplete, movieGridControls, topRatedMovies]);

  // Handle new movies from pagination - only animate new ones
  useEffect(() => {
    if (initialAnimationComplete && topRatedMovies.length > 0) {
      // Find new movies that haven't been animated
      const newMovies = topRatedMovies.filter(movie => 
        !animatedCardsRef.current.has(movie.id || `${movie.title}-${movie.date}`)
      );
      
      if (newMovies.length > 0) {
        // Mark new movies as animated
        newMovies.forEach(movie => {
          animatedCardsRef.current.add(movie.id || `${movie.title}-${movie.date}`);
        });
      }
    }
  }, [topRatedMovies.length, initialAnimationComplete, topRatedMovies]);

  // Set up intersection observer for movie cards
  useEffect(() => {
    const cleanup = observeMovieCards();
    return cleanup;
  }, [observeMovieCards]);

  // Infinite scroll intersection observer
  const handleIntersection = useCallback((entries) => {
    const [entry] = entries;
    if (entry.isIntersecting && topRatedPagination?.hasNextPage && !loadingMoreTopRated) {
      loadMoreTopRated();
    }
  }, [topRatedPagination, loadingMoreTopRated, loadMoreTopRated]);

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
    if (newIndex >= 0 && newIndex < topRatedMovies.length) {
      setSelectedMovie(topRatedMovies[newIndex]);
      setSelectedMovieIndex(newIndex);
    }
  };

  if (loading) {
    return (
      <div className="section">
        <div className="container">
          {/* <h2 className="section-title">Loading Top Rated Movies...</h2> */}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section">
        <div className="container">
          <h2 className="section-title">Error Loading Top Rated Movies</h2>
          <p style={{ color: '#ff4444' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container">
        <h2 className="section-title">Top Rated Movies</h2>
        <p style={{ marginBottom: '30px', color: '#666' }}>
          All unique movies rated 90 or higher out of 100 
          {topRatedPagination && ` (${topRatedMovies.length} of ${topRatedPagination.total} films)`}
        </p>
        
        <motion.div 
          ref={movieGridRef}
          className="movie-grid"
          variants={staggerContainer}
          initial="visible"
          animate="visible"
        >
          {topRatedMovies.map((movie, index) => {
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
                
                {/* Top-rated badge */}
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  background: movie.detailedRating === 100 ? 'rgba(255,215,0,0.9)' : 'rgba(0,150,0,0.8)',
                  color: movie.detailedRating === 100 ? 'black' : 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  {movie.detailedRating}/100
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

        {/* Infinite scroll trigger */}
        {topRatedPagination?.hasNextPage && (
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
            {loadingMoreTopRated && (
              <div style={{ color: '#666', fontSize: '14px' }}>
                Loading more movies...
              </div>
            )}
          </div>
        )}

        {/* Manual Load More Button (as fallback) */}
        {topRatedPagination?.hasNextPage && !loadingMoreTopRated && (
          <div style={{ textAlign: 'center', marginTop: '40px' }}>
            <button
              onClick={loadMoreTopRated}
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

        {/* Show message when no movies */}
        {topRatedMovies.length === 0 && !loading && (
          <div style={{ 
            textAlign: 'center', 
            marginTop: '40px', 
            color: '#666',
            fontSize: '16px'
          }}>
            No top-rated movies found.
          </div>
        )}
      </div>

      {/* Movie Details Modal */}
      <MovieDetailsModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        movie={selectedMovie}
        movies={topRatedMovies}
        currentIndex={selectedMovieIndex}
        onNavigate={handleModalNavigate}
      />
    </div>
  );
}

export default TopRated; 