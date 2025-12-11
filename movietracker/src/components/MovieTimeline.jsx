import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, ChevronLeft, ChevronRight, Calendar, Star, RotateCcw } from 'lucide-react';
import apiService from '../services/apiService';

const MovieTimeline = ({ timelineData, onMovieClick }) => {
  const [movies, setMovies] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const timelineRef = useRef(null);
  
  // Load timeline movie data
  useEffect(() => {
    const loadTimelineMovies = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // If timelineData is provided, use it; otherwise fetch from API
        if (timelineData && timelineData.length > 0) {
          setMovies(timelineData.slice(0, 50)); // Limit to 50 for performance
        } else {
          const response = await apiService.getAllMovies(1, 50);
          if (response.success) {
            setMovies(response.data.map(movie => ({
              ...movie,
              posterUrl: movie.poster_url,
              backdropUrl: movie.backdrop_url,
              watchedDate: movie.watch_date,
              isRewatch: movie.is_rewatch,
              rating: movie.rating || 0,
              detailedRating: movie.detailed_rating
            })));
          }
        }
      } catch (error) {
        console.error('Error loading timeline movies:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadTimelineMovies();
  }, [timelineData]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : movies.length - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex(prev => (prev < movies.length - 1 ? prev + 1 : 0));
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyPress);
      return () => container.removeEventListener('keydown', handleKeyPress);
    }
  }, [movies.length]);

  const goToPrevious = () => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : movies.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex(prev => (prev < movies.length - 1 ? prev + 1 : 0));
  };

  const goToIndex = (index) => {
    setCurrentIndex(Math.max(0, Math.min(index, movies.length - 1)));
  };

  const handleMovieSelect = (movie, index) => {
    setCurrentIndex(index);
    if (onMovieClick && typeof onMovieClick === 'function') {
      try {
        onMovieClick(movie.title || movie);
      } catch (error) {
        console.error('Error in onMovieClick:', error);
      }
    }
  };

  // Calculate transform and scale for coverflow effect
  const getItemStyle = (index) => {
    const distance = index - currentIndex;
    const absDistance = Math.abs(distance);
    
    if (absDistance > 8) return { display: 'none' };
    
    const scale = absDistance === 0 ? 1 : 0.8 - (absDistance * 0.08);
    const rotateY = distance * -15;
    const translateX = distance * 120;
    const translateZ = absDistance === 0 ? 0 : -80 * absDistance;
    const opacity = absDistance <= 6 ? 1 - (absDistance * 0.15) : 0;
    
    return {
      transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
      opacity,
      zIndex: 20 - absDistance
    };
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  if (loading) {
    return (
      <div className="movie-timeline-container">
        <div className="movie-timeline-loading">
          <div className="timeline-skeleton-posters">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="timeline-skeleton-poster" />
            ))}
          </div>
          <p>Loading your movie journey...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="movie-timeline-container">
        <div className="movie-timeline-empty">
          <Film size={48} style={{ opacity: 0.3 }} />
          <h3>Error Loading Timeline</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!movies.length) {
    return (
      <div className="movie-timeline-container">
        <div className="movie-timeline-empty">
          <Film size={48} style={{ opacity: 0.3 }} />
          <h3>No Movies to Display</h3>
          <p>Start watching movies to see your timeline!</p>
        </div>
      </div>
    );
  }

  const currentMovie = movies[currentIndex];

  return (
    <div 
      ref={containerRef}
      className="movie-timeline-container"
      tabIndex={0}
      role="region"
      aria-label="Interactive Movie Timeline"
    >
      {/* Timeline Controls */}
      <div className="movie-timeline-controls">
        <button
          onClick={goToPrevious}
          className="timeline-nav-btn timeline-nav-prev"
          aria-label="Previous movie"
          disabled={movies.length <= 1}
        >
          <ChevronLeft size={20} />
        </button>
        
        <div className="timeline-info">
          <span className="timeline-counter">
            {currentIndex + 1} of {movies.length}
          </span>
        </div>
        
        <button
          onClick={goToNext}
          className="timeline-nav-btn timeline-nav-next"
          aria-label="Next movie"
          disabled={movies.length <= 1}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Coverflow Display */}
      <div className="movie-timeline-coverflow" ref={timelineRef}>
        <div className="timeline-posters-container">
          {movies.map((movie, index) => {
            const itemStyle = getItemStyle(index);
            
            return (
              <motion.div
                key={movie.id ? `movie-${movie.id}` : `index-${index}`}
                className={`timeline-poster-item ${index === currentIndex ? 'active' : ''}`}
                style={itemStyle}
                onClick={() => handleMovieSelect(movie, index)}
                whileHover={index === currentIndex ? { scale: 1.05 } : undefined}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <div className="timeline-poster-wrapper">
                  {movie.posterUrl ? (
                    <img
                      src={movie.posterUrl}
                      alt={`${movie.title} poster`}
                      className="timeline-poster-image"
                      draggable={false}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  
                  <div 
                    className="timeline-poster-fallback" 
                    style={{ display: movie.posterUrl ? 'none' : 'flex' }}
                  >
                    <Film size={32} />
                    <span>{movie.title}</span>
                  </div>

                  {/* Rewatch indicator */}
                  {movie.isRewatch && (
                    <div className="timeline-rewatch-badge">
                      <RotateCcw size={12} />
                    </div>
                  )}

                  {/* Rating badge */}
                  {movie.rating > 0 && (
                    <div className="timeline-rating-badge">
                      <Star size={10} />
                      <span>{movie.rating}</span>
                    </div>
                  )}
                </div>

                {/* Movie info overlay (only for center item) - REMOVED */}
                {/* 
                {index === currentIndex && (
                  <motion.div
                    className="timeline-movie-overlay"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h4 className="timeline-movie-title">{movie.title}</h4>
                    <div className="timeline-movie-meta">
                      <span className="timeline-movie-date">
                        <Calendar size={12} />
                        {formatDate(movie.watchedDate)}
                      </span>
                      {movie.release_year && (
                        <span className="timeline-movie-year">({movie.release_year})</span>
                      )}
                    </div>
                  </motion.div>
                )}
                */}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Current Movie Details */}
      {currentMovie && (
        <motion.div
          className="movie-timeline-details"
          key={currentIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="timeline-details-content">
            <div className="timeline-details-main">
              <h3 className="timeline-details-title">{currentMovie.title}</h3>
              <div className="timeline-details-meta">
                <div className="timeline-meta-item">
                  <Calendar size={14} />
                  <span>Watched {formatDate(currentMovie.watchedDate)}</span>
                </div>
                
                {currentMovie.release_year && (
                  <div className="timeline-meta-item">
                    <span>Released {currentMovie.release_year}</span>
                  </div>
                )}
                
                {currentMovie.rating > 0 && (
                  <div className="timeline-meta-item">
                    <Star size={14} />
                    <span>{currentMovie.rating}/5</span>
                  </div>
                )}
                
                {currentMovie.detailedRating && (
                  <div className="timeline-meta-item">
                    <span>{currentMovie.detailedRating}/100</span>
                  </div>
                )}
                
                {currentMovie.isRewatch && (
                  <div className="timeline-meta-item timeline-rewatch-indicator">
                    <RotateCcw size={14} />
                    <span>Rewatch</span>
                  </div>
                )}
              </div>
            </div>
            
            {currentMovie.overview && (
              <p className="timeline-details-overview">{currentMovie.overview}</p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default MovieTimeline; 