import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Star, Tag, RotateCcw, Loader2, Calendar } from 'lucide-react';
import apiService from '../services/apiService';
import RatingComparisonModal from './RatingComparisonModal';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentDateEST, getYesterdayDateEST, formatDateForDisplay } from '../utils/dateUtils';

const AddMovieModal = ({ isOpen, onClose }) => {
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [review, setReview] = useState('');
  const [starRating, setStarRating] = useState(0);
  const [percentageRating, setPercentageRating] = useState('');
  const [hoveredStar, setHoveredStar] = useState(0);
  const [isRewatch, setIsRewatch] = useState(false);
  const [tags, setTags] = useState([]);
  const [currentTag, setCurrentTag] = useState('');
  const [watchedDate, setWatchedDate] = useState(getCurrentDateEST()); // Default to today in EST
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showRatingComparison, setShowRatingComparison] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const searchTimeoutRef = useRef(null);
  const searchInputRef = useRef(null);
  const resultsRef = useRef(null);
  const ratingComparisonTimeoutRef = useRef(null);
  const modalRef = useRef(null);

  console.log('AddMovieModal render - isOpen:', isOpen);

  // Debounced search effect with TMDB API
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const response = await apiService.searchTMDB(searchQuery.trim());
          setSearchResults(response.data || []);
          setShowResults(true);
        } catch (error) {
          console.error('Search error:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target) &&
          searchInputRef.current && !searchInputRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setSearchQuery('');
      setSearchResults([]);
      setSelectedMovie(null);
      setShowResults(false);
      setReview('');
      setStarRating(0);
      setPercentageRating('');
      setIsRewatch(false);
      setTags([]);
      setCurrentTag('');
      setWatchedDate(getCurrentDateEST()); // Reset to today in EST
      setIsSubmitting(false);
      setSubmitError('');
      setSubmitSuccess(false);
      setShowRatingComparison(false);
      setIsClosing(false);
      
      // Clear timeouts
      if (ratingComparisonTimeoutRef.current) {
        clearTimeout(ratingComparisonTimeoutRef.current);
      }
    }
  }, [isOpen]);

  // Disable body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      // Store original overflow and scroll position
      const originalOverflow = document.body.style.overflow;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      
      // Prevent background scrolling
      document.body.style.overflow = 'hidden';
      
      // Force modal to center in current viewport
      const positionModal = () => {
        if (modalRef.current) {
          const modal = modalRef.current;
          modal.style.position = 'fixed';
          modal.style.top = '0';
          modal.style.left = '0';
          modal.style.width = '100vw';
          modal.style.height = '100vh';
          modal.style.display = 'flex';
          modal.style.alignItems = 'center';
          modal.style.justifyContent = 'center';
          modal.style.zIndex = '10001';
          modal.style.transform = 'translateZ(0)';
        }
      };
      
      // Position modal immediately
      positionModal();
      
      // Also position on any resize or orientation change
      window.addEventListener('resize', positionModal);
      window.addEventListener('orientationchange', positionModal);
      
      return () => {
        // Restore original overflow
        document.body.style.overflow = originalOverflow;
        
        // Remove event listeners
        window.removeEventListener('resize', positionModal);
        window.removeEventListener('orientationchange', positionModal);
      };
    }
  }, [isOpen]);

  // Move the early return AFTER all hooks
  if (!isOpen) return null;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300); // Match the animation duration
  };

  const handleOverlayClick = (e) => {
    // Prevent closing if already in closing state or if clicking on the modal itself
    if (isClosing || e.target !== e.currentTarget) {
      return;
    }
    handleClose();
  };

  const handleMovieSelect = (movie) => {
    setSelectedMovie(movie);
    setSearchQuery(movie.title);
    setShowResults(false);
  };

  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Clear selected movie if user starts typing again
    if (selectedMovie && value !== selectedMovie.title) {
      setSelectedMovie(null);
    }
  };

  const handleStarClick = (rating) => {
    setStarRating(rating);
    
    // Auto-adjust percentage rating to fit within the star rating range
    if (rating > 0 && percentageRating) {
      const minPercent = getPercentageRange(rating).min;
      const maxPercent = getPercentageRange(rating).max;
      const currentPercent = parseInt(percentageRating);
      
      // If current percentage is outside the new star rating range, adjust it
      if (currentPercent < minPercent || currentPercent > maxPercent) {
        // Set to the middle of the range
        const midPoint = Math.floor((minPercent + maxPercent) / 2);
        setPercentageRating(midPoint.toString());
      }
    }
  };

  const handleStarHover = (rating) => {
    setHoveredStar(rating);
  };

  const handleStarLeave = () => {
    setHoveredStar(0);
  };

  const handleTagInputChange = (e) => {
    const value = e.target.value;
    // Only allow single words (no spaces)
    if (!value.includes(' ')) {
      setCurrentTag(value);
    }
  };

  const handleTagKeyPress = (e) => {
    if (e.key === 'Enter' && currentTag.trim()) {
      e.preventDefault();
      const newTag = currentTag.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setCurrentTag('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleWatchedDateChange = (e) => {
    setWatchedDate(e.target.value);
  };

  const setDateToToday = () => {
    setWatchedDate(getCurrentDateEST());
  };

  const setDateToYesterday = () => {
    setWatchedDate(getYesterdayDateEST());
  };

  // Get percentage range based on star rating
  const getPercentageRange = (stars) => {
    if (stars === 0) return { min: 0, max: 100 };
    if (stars === 0.5) return { min: 0, max: 9 };
    if (stars === 1) return { min: 10, max: 19 };
    if (stars === 1.5) return { min: 20, max: 29 };
    if (stars === 2) return { min: 30, max: 39 };
    if (stars === 2.5) return { min: 40, max: 49 };
    if (stars === 3) return { min: 50, max: 59 };
    if (stars === 3.5) return { min: 60, max: 69 };
    if (stars === 4) return { min: 70, max: 79 };
    if (stars === 4.5) return { min: 80, max: 89 };
    if (stars === 5) return { min: 90, max: 100 };
    return { min: 0, max: 100 };
  };

  const handlePercentageChange = (e) => {
    const value = e.target.value;
    
    // Allow empty value
    if (value === '') {
      setPercentageRating('');
      setShowRatingComparison(false);
      if (ratingComparisonTimeoutRef.current) {
        clearTimeout(ratingComparisonTimeoutRef.current);
      }
      return;
    }
    
    // Allow any numeric input while typing (basic validation)
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setPercentageRating(value);
      
      // Show rating comparison modal after a short delay
      if (ratingComparisonTimeoutRef.current) {
        clearTimeout(ratingComparisonTimeoutRef.current);
      }
      
      ratingComparisonTimeoutRef.current = setTimeout(() => {
        if (numValue >= 0 && numValue <= 100) {
          setShowRatingComparison(true);
        }
      }, 500); // 500ms delay to avoid showing on every keystroke
    }
  };

  const handlePercentageBlur = (e) => {
    const value = e.target.value;
    
    if (value === '') return;
    
    const numValue = parseInt(value);
    if (isNaN(numValue)) {
      setPercentageRating('');
      return;
    }
    
    if (starRating > 0) {
      const range = getPercentageRange(starRating);
      
      // If the value is outside the allowed range, adjust it to the nearest valid value
      if (numValue < range.min) {
        setPercentageRating(range.min.toString());
      } else if (numValue > range.max) {
        setPercentageRating(range.max.toString());
      }
    } else {
      // Ensure it's within 0-100 if no star rating
      if (numValue < 0) {
        setPercentageRating('0');
      } else if (numValue > 100) {
        setPercentageRating('100');
      }
    }
  };

  const getPercentageLabel = () => {
    if (starRating === 0) {
      return 'Percentage Rating (0-100)';
    }
    const range = getPercentageRange(starRating);
    return `Percentage Rating (${range.min}-${range.max} for ${starRating} star${starRating !== 1 ? 's' : ''})`;
  };

  const getPercentagePlaceholder = () => {
    if (starRating === 0) {
      return '85';
    }
    const range = getPercentageRange(starRating);
    const midPoint = Math.floor((range.min + range.max) / 2);
    return midPoint.toString();
  };

  const renderStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const currentRating = hoveredStar || starRating;
      const isFullStar = currentRating >= i;
      const isHalfStar = currentRating >= i - 0.5 && currentRating < i;
      
      stars.push(
        <div key={i} className="star-container">
          {/* Background star (always gray) */}
          <Star 
            size={20} 
            fill="none" 
            color="#86868B"
            className="star-background"
          />
          
          {/* Foreground star (golden, clipped for half stars) */}
          <div className={`star-foreground ${isHalfStar ? 'half-star' : isFullStar ? 'full-star' : 'no-star'}`}>
            <Star 
              size={20} 
              fill="#FFD700" 
              color="#FFD700"
            />
          </div>
          
          {/* Invisible click areas */}
          <button
            type="button"
            className="star-click-area star-left-click"
            onClick={() => handleStarClick(i - 0.5)}
            onMouseEnter={() => handleStarHover(i - 0.5)}
            onMouseLeave={handleStarLeave}
            aria-label={`Rate ${i - 0.5} stars`}
          />
          <button
            type="button"
            className="star-click-area star-right-click"
            onClick={() => handleStarClick(i)}
            onMouseEnter={() => handleStarHover(i)}
            onMouseLeave={handleStarLeave}
            aria-label={`Rate ${i} stars`}
          />
        </div>
      );
    }
    return stars;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isAuthenticated) {
      setSubmitError('You must be logged in to add movies.');
      return;
    }
    
    setSubmitError('');
    setSubmitSuccess(false);
    setIsSubmitting(true);

    try {
      // Prepare the movie data for the API
      const movieData = {
        title: selectedMovie ? selectedMovie.title : searchQuery.trim(),
        year: selectedMovie ? formatReleaseDate(selectedMovie.release_date) : null,
        user_rating: starRating || null,
        detailed_rating: percentageRating ? parseInt(percentageRating) : null,
        watch_date: watchedDate, // Use the manually set watched date
        is_rewatch: isRewatch,
        notes: review || null, // Store review in notes field
        tags: tags.length > 0 ? tags.join(', ') : null // Store tags as comma-separated string
      };

      console.log('Submitting movie data:', movieData);

      // Call the API to add the movie
      const response = await apiService.addMovie(movieData);

      if (response.success) {
        setSubmitSuccess(true);
        console.log('Movie added successfully:', response.data);
        
        // Close modal after a short delay to show success message
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        throw new Error(response.error || 'Failed to add movie');
      }

    } catch (error) {
      console.error('Error adding movie:', error);
      setSubmitError(error.message || 'Failed to add movie. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatReleaseDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.getFullYear();
  };

  const formatDisplayDate = (dateString) => {
    return formatDateForDisplay(dateString);
  };

  return (
    <div className={`add-movie-modal-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick} ref={modalRef}>
      <div className={`add-movie-modal ${showRatingComparison ? 'with-comparison' : ''} ${isClosing ? 'closing' : ''}`}>
        <button 
          className="add-movie-modal-close"
          onClick={handleClose}
          aria-label="Close modal"
        >
          <X size={20} />
        </button>

        <div className="add-movie-modal-header">
          <h2>Add Movie</h2>
          <p>Search for a movie and add your review</p>
        </div>

        <form className="add-movie-modal-form" onSubmit={handleSubmit}>
          {/* Success Message */}
          {submitSuccess && (
            <div className="add-movie-success">
              Movie added successfully! 🎉
            </div>
          )}

          {/* Error Message */}
          {submitError && (
            <div className="add-movie-error">
              {submitError}
            </div>
          )}

          {/* Movie Search with Autocomplete */}
          <div className="add-movie-form-group">
            <label htmlFor="movie-search">Movie</label>
            <div className="movie-search-container">
              <div className="add-movie-input-wrapper">
                <Search className="add-movie-input-icon" size={16} />
                <input
                  ref={searchInputRef}
                  id="movie-search"
                  type="text"
                  placeholder="Search for a movie..."
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  required
                  disabled={isSubmitting}
                />
                {isSearching && (
                  <div className="search-loading">
                    <div className="search-spinner"></div>
                  </div>
                )}
              </div>
              
              {/* Search Results Dropdown */}
              {showResults && searchResults.length > 0 && (
                <div ref={resultsRef} className="search-results">
                  {searchResults.slice(0, 8).map((movie) => (
                    <div
                      key={movie.id}
                      className="search-result-item"
                      onClick={() => handleMovieSelect(movie)}
                    >
                      <div className="search-result-poster">
                        {movie.poster_url ? (
                          <img 
                            src={movie.poster_url} 
                            alt={movie.title}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className="search-result-poster-fallback" style={{ display: movie.poster_url ? 'none' : 'flex' }}>
                          <span>No Image</span>
                        </div>
                      </div>
                      <div className="search-result-info">
                        <div className="search-result-title">{movie.title}</div>
                        <div className="search-result-year">{formatReleaseDate(movie.release_date)}</div>
                        {movie.overview && (
                          <div className="search-result-overview">
                            {movie.overview.length > 100 
                              ? `${movie.overview.substring(0, 100)}...` 
                              : movie.overview}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected Movie Display */}
          {selectedMovie && (
            <div className="selected-movie-display">
              <div className="selected-movie-poster">
                {selectedMovie.poster_url ? (
                  <img 
                    src={selectedMovie.poster_url} 
                    alt={selectedMovie.title}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className="selected-movie-poster-fallback" style={{ display: selectedMovie.poster_url ? 'none' : 'flex' }}>
                  <span>No Poster</span>
                </div>
              </div>
              <div className="selected-movie-info">
                <h3>{selectedMovie.title}</h3>
                <p className="selected-movie-year">{formatReleaseDate(selectedMovie.release_date)}</p>
                {selectedMovie.overview && (
                  <p className="selected-movie-overview">{selectedMovie.overview}</p>
                )}
              </div>
            </div>
          )}

          {/* Watched Date */}
          <div className="add-movie-form-group">
            <label htmlFor="watched-date">Watched Date</label>
            <div className="watched-date-container">
              <div className="add-movie-input-wrapper">
                <Calendar className="add-movie-input-icon" size={16} />
                <input
                  id="watched-date"
                  type="date"
                  value={watchedDate}
                  onChange={handleWatchedDateChange}
                  disabled={isSubmitting}
                  className="watched-date-input"
                />
              </div>
              <div className="watched-date-display">
                {formatDisplayDate(watchedDate)}
              </div>
              <div className="watched-date-quick-buttons">
                <button
                  type="button"
                  className="watched-date-quick-btn"
                  onClick={setDateToToday}
                  disabled={isSubmitting}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="watched-date-quick-btn"
                  onClick={setDateToYesterday}
                  disabled={isSubmitting}
                >
                  Yesterday
                </button>
              </div>
            </div>
          </div>

          {/* Rewatch Toggle */}
          <div className="add-movie-form-group">
            <label>Rewatch</label>
            <div className="rewatch-toggle-container">
              <button
                type="button"
                className={`rewatch-toggle-btn ${isRewatch ? 'active' : ''}`}
                onClick={() => setIsRewatch(!isRewatch)}
                disabled={isSubmitting}
              >
                <RotateCcw size={16} />
                <span>{isRewatch ? 'Yes, this is a rewatch' : 'No, first time watching'}</span>
              </button>
            </div>
          </div>

          {/* Tags Section */}
          <div className="add-movie-form-group">
            <label htmlFor="movie-tags">Tags</label>
            <div className="tags-container">
              <div className="add-movie-input-wrapper">
                <Tag className="add-movie-input-icon" size={16} />
                <input
                  id="movie-tags"
                  type="text"
                  placeholder="Add a tag (one word only)..."
                  value={currentTag}
                  onChange={handleTagInputChange}
                  onKeyPress={handleTagKeyPress}
                  disabled={isSubmitting}
                />
              </div>
              {tags.length > 0 && (
                <div className="tags-list">
                  {tags.map((tag, index) => (
                    <span key={index} className="tag-item">
                      {tag}
                      <button
                        type="button"
                        className="tag-remove"
                        onClick={() => removeTag(tag)}
                        aria-label={`Remove ${tag} tag`}
                        disabled={isSubmitting}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Review Section */}
          <div className="add-movie-form-group">
            <label htmlFor="movie-review">Review</label>
            <textarea
              id="movie-review"
              placeholder="Write your review..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={4}
              className="add-movie-textarea"
              disabled={isSubmitting}
            />
          </div>

          {/* Star Rating */}
          <div className="add-movie-form-group">
            <label>Star Rating</label>
            <div className="star-rating-container">
              <div className="star-rating-stars">
                {renderStars()}
              </div>
              <span className="star-rating-value">
                {starRating > 0 ? `${starRating}/5` : 'No rating'}
              </span>
            </div>
          </div>

          {/* Percentage Rating */}
          <div className="add-movie-form-group">
            <label htmlFor="percentage-rating">{getPercentageLabel()}</label>
            <div className="percentage-rating-container">
              <div className="add-movie-input-wrapper">
                <input
                  id="percentage-rating"
                  type="number"
                  min={starRating > 0 ? getPercentageRange(starRating).min : 0}
                  max={starRating > 0 ? getPercentageRange(starRating).max : 100}
                  placeholder={getPercentagePlaceholder()}
                  value={percentageRating}
                  onChange={handlePercentageChange}
                  onBlur={handlePercentageBlur}
                  className="percentage-input"
                  disabled={isSubmitting}
                />
                <span className="percentage-symbol">%</span>
              </div>
              {starRating > 0 && (
                <div className="percentage-range-hint">
                  Range: {getPercentageRange(starRating).min}-{getPercentageRange(starRating).max}%
                </div>
              )}
            </div>
          </div>

          <button 
            type="submit" 
            className="add-movie-submit-btn"
            disabled={isSubmitting || !searchQuery.trim() || !isAuthenticated}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="add-movie-loading-spinner" />
                Adding Movie...
              </>
            ) : !isAuthenticated ? (
              'You must be logged in to add movies'
            ) : (
              'Add Movie'
            )}
          </button>
        </form>
      </div>
      
      {/* Rating Comparison Modal */}
      <RatingComparisonModal 
        isOpen={showRatingComparison}
        onClose={() => setShowRatingComparison(false)}
        targetRating={parseInt(percentageRating) || 0}
      />
    </div>
  );
};

export default AddMovieModal; 