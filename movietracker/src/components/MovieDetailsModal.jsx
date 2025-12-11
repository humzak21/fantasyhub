import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, Edit3, Save, X as Cancel, Star, Calendar, Tag, RotateCcw, ChevronLeft, ChevronRight, Film, Clock, Users, Play, Percent, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import apiService from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import { getFormattedDateParts as getESTFormattedDateParts } from '../utils/dateUtils';
import StarDisplay from './StarDisplay';

const MovieDetailsModal = ({ isOpen, onClose, movie, movies, currentIndex, onNavigate }) => {
  const { isAuthenticated } = useAuth();
  const modalRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    watchedDate: '',
    starRating: 0,
    percentageRating: '',
    review: '',
    isRewatch: false,
    tags: []
  });
  const [hoveredStar, setHoveredStar] = useState(0);
  const [currentTag, setCurrentTag] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Initialize edit data when movie changes
  useEffect(() => {
    if (movie) {
      setEditData({
        watchedDate: movie.watch_date || movie.date || '',
        starRating: movie.rating || 0,
        percentageRating: movie.detailed_rating || movie.detailedRating || '',
        review: movie.notes || '',
        isRewatch: movie.is_rewatch || movie.isRewatch || false,
        tags: movie.tags ? (typeof movie.tags === 'string' ? movie.tags.split(', ').filter(Boolean) : movie.tags) : []
      });
    }
  }, [movie]);

  // Reset states when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setSubmitError('');
      setSubmitSuccess(false);
      setCurrentTag('');
      setHoveredStar(0);
      setIsClosing(false);
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
          modal.style.zIndex = '10000';
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

  if (!isOpen || !movie) return null;

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

  const handleEdit = () => {
    if (!isAuthenticated) {
      return; // Prevent editing if not authenticated
    }
    setIsEditing(true);
    setSubmitError('');
    setSubmitSuccess(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setSubmitError('');
    setSubmitSuccess(false);
    // Reset edit data to original values
    setEditData({
      watchedDate: movie.watch_date || movie.date || '',
      starRating: movie.rating || 0,
      percentageRating: movie.detailed_rating || movie.detailedRating || '',
      review: movie.notes || '',
      isRewatch: movie.is_rewatch || movie.isRewatch || false,
      tags: movie.tags ? (typeof movie.tags === 'string' ? movie.tags.split(', ').filter(Boolean) : movie.tags) : []
    });
    setCurrentTag('');
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      setSubmitError('You must be logged in to save changes.');
      return;
    }
    
    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);

    try {
      const updateData = {
        watch_date: editData.watchedDate,
        rating: editData.starRating || null,
        detailed_rating: editData.percentageRating ? parseInt(editData.percentageRating) : null,
        notes: editData.review || null,
        is_rewatch: editData.isRewatch,
        tags: editData.tags.length > 0 ? editData.tags.join(', ') : null
      };

      const response = await apiService.updateMovie(movie.id, updateData);

      if (response.success) {
        setSubmitSuccess(true);
        setIsEditing(false);
        
        // Update the movie object with new data
        Object.assign(movie, {
          watch_date: editData.watchedDate,
          date: editData.watchedDate,
          rating: editData.starRating,
          detailed_rating: editData.percentageRating ? parseInt(editData.percentageRating) : null,
          detailedRating: editData.percentageRating ? parseInt(editData.percentageRating) : null,
          notes: editData.review,
          is_rewatch: editData.isRewatch,
          isRewatch: editData.isRewatch,
          tags: editData.tags.length > 0 ? editData.tags.join(', ') : null
        });

        setTimeout(() => {
          setSubmitSuccess(false);
        }, 3000);
      } else {
        throw new Error(response.error || 'Failed to update movie');
      }
    } catch (error) {
      console.error('Error updating movie:', error);
      setSubmitError(error.message || 'Failed to update movie. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStarClick = (rating) => {
    setEditData(prev => ({ ...prev, starRating: rating }));
    
    // Auto-adjust percentage rating to fit within the star rating range
    if (rating > 0 && editData.percentageRating) {
      const minPercent = getPercentageRange(rating).min;
      const maxPercent = getPercentageRange(rating).max;
      const currentPercent = parseInt(editData.percentageRating);
      
      if (currentPercent < minPercent || currentPercent > maxPercent) {
        const midPoint = Math.floor((minPercent + maxPercent) / 2);
        setEditData(prev => ({ ...prev, percentageRating: midPoint.toString() }));
      }
    }
  };

  const handleStarHover = (rating) => {
    setHoveredStar(rating);
  };

  const handleStarLeave = () => {
    setHoveredStar(0);
  };

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
    if (value === '' || (!isNaN(value) && parseInt(value) >= 0 && parseInt(value) <= 100)) {
      setEditData(prev => ({ ...prev, percentageRating: value }));
    }
  };

  const handlePercentageBlur = (e) => {
    const value = e.target.value;
    if (value === '') return;
    
    const numValue = parseInt(value);
    if (isNaN(numValue)) {
      setEditData(prev => ({ ...prev, percentageRating: '' }));
      return;
    }
    
    if (editData.starRating > 0) {
      const range = getPercentageRange(editData.starRating);
      if (numValue < range.min) {
        setEditData(prev => ({ ...prev, percentageRating: range.min.toString() }));
      } else if (numValue > range.max) {
        setEditData(prev => ({ ...prev, percentageRating: range.max.toString() }));
      }
    } else {
      if (numValue < 0) {
        setEditData(prev => ({ ...prev, percentageRating: '0' }));
      } else if (numValue > 100) {
        setEditData(prev => ({ ...prev, percentageRating: '100' }));
      }
    }
  };

  const handleTagInputChange = (e) => {
    const value = e.target.value;
    if (!value.includes(' ')) {
      setCurrentTag(value);
    }
  };

  const handleTagKeyPress = (e) => {
    if (e.key === 'Enter' && currentTag.trim()) {
      e.preventDefault();
      const newTag = currentTag.trim().toLowerCase();
      if (!editData.tags.includes(newTag)) {
        setEditData(prev => ({ ...prev, tags: [...prev.tags, newTag] }));
      }
      setCurrentTag('');
    }
  };

  const removeTag = (tagToRemove) => {
    setEditData(prev => ({ 
      ...prev, 
      tags: prev.tags.filter(tag => tag !== tagToRemove) 
    }));
  };

  const renderStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const currentRating = hoveredStar || editData.starRating;
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
            disabled={!isEditing}
            aria-label={`Rate ${i - 0.5} stars`}
          />
          <button
            type="button"
            className="star-click-area star-right-click"
            onClick={() => handleStarClick(i)}
            onMouseEnter={() => handleStarHover(i)}
            onMouseLeave={handleStarLeave}
            disabled={!isEditing}
            aria-label={`Rate ${i} stars`}
          />
        </div>
      );
    }
    return stars;
  };

  const getFormattedDateParts = (dateString) => {
    return getESTFormattedDateParts(dateString);
  };

  const formatRuntime = (minutes) => {
    if (!minutes) return 'Unknown';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatGenres = (genres) => {
    if (!genres || genres.length === 0) return 'Unknown';
    if (Array.isArray(genres)) {
      return genres.map(g => typeof g === 'string' ? g : g.name).join(', ');
    }
    return genres;
  };

  const handlePrevious = () => {
    if (currentIndex > 0 && onNavigate) {
      onNavigate(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < movies.length - 1 && onNavigate) {
      onNavigate(currentIndex + 1);
    }
  };

  const dateParts = getFormattedDateParts(movie.watch_date || movie.date);

  const modalContent = (
    <div className={`movie-details-modal-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick} ref={modalRef}>
      <div className={`movie-details-modal ${isClosing ? 'closing' : ''}`}>
        {/* Header with close and navigation */}
        <div className="movie-details-header">
          <button 
            className="movie-details-nav-btn"
            onClick={handlePrevious}
            disabled={currentIndex <= 0}
            aria-label="Previous movie"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="movie-details-header-center">
            <span className="movie-details-counter">
              {currentIndex + 1} of {movies.length}
            </span>
          </div>
          
          <button 
            className="movie-details-nav-btn"
            onClick={handleNext}
            disabled={currentIndex >= movies.length - 1}
            aria-label="Next movie"
          >
            <ChevronRight size={20} />
          </button>
          
          <button 
            className="movie-details-close"
            onClick={handleClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Success/Error Messages */}
        {submitSuccess && (
          <div className="movie-details-success">
            Movie updated successfully! ✨
          </div>
        )}

        {submitError && (
          <div className="movie-details-error">
            {submitError}
          </div>
        )}

        <div className="movie-details-content">
          {/* Movie Poster and Basic Info */}
          <div className="movie-details-main">
            <div className="movie-details-poster">
              {movie.posterUrl || movie.poster_url ? (
                <img
                  src={movie.posterUrl || movie.poster_url}
                  alt={`${movie.title} poster`}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div className="movie-details-poster-fallback" style={{ display: (movie.posterUrl || movie.poster_url) ? 'none' : 'flex' }}>
                <Film size={64} />
                <span>No Poster</span>
              </div>
            </div>

            <div className="movie-details-info">
              <h2 className="movie-details-title">{movie.title}</h2>
              
              {movie.release_year && (
                <p className="movie-details-year">{movie.release_year}</p>
              )}

              {movie.overview && (
                <p className="movie-details-overview">{movie.overview}</p>
              )}

              {/* Movie Metadata */}
              <div className="movie-details-metadata">
                {movie.runtime && (
                  <div className="movie-details-meta-item">
                    <Clock size={16} />
                    <span>{formatRuntime(movie.runtime)}</span>
                  </div>
                )}

                {movie.genres && (
                  <div className="movie-details-meta-item">
                    <Tag size={16} />
                    <span>{formatGenres(movie.genres)}</span>
                  </div>
                )}

                {movie.director && (
                  <div className="movie-details-meta-item">
                    <Users size={16} />
                    <span>Directed by {movie.director}</span>
                  </div>
                )}

                {movie.vote_average && (
                  <div className="movie-details-meta-item">
                    <Star size={16} />
                    <span>TMDB: {movie.vote_average}/10</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* User Data Section */}
          <div className="movie-details-user-data">
            <div className="movie-details-section-header">
              <div className="section-header-content">
                <h3>Your Review</h3>
                {!isAuthenticated && !isEditing && (
                  <p className="section-subtitle">Log in to add or edit your review.</p>
                )}
              </div>
              {isAuthenticated && (
                !isEditing ? (
                  <button 
                    className="movie-details-edit-btn"
                    onClick={handleEdit}
                    aria-label="Edit review"
                  >
                    <Edit3 size={16} />
                    Edit
                  </button>
                ) : (
                  <div className="movie-details-edit-actions">
                    <button 
                      className="movie-details-save-btn"
                      onClick={handleSave}
                      disabled={isSubmitting}
                      aria-label="Save changes"
                    >
                      <Save size={16} />
                      {isSubmitting ? 'Saving...' : 'Save'}
                    </button>
                    <button 
                      className="movie-details-cancel-btn"
                      onClick={handleCancelEdit}
                      disabled={isSubmitting}
                      aria-label="Cancel editing"
                    >
                      <Cancel size={16} />
                      Cancel
                    </button>
                  </div>
                )
              )}
            </div>

            {(!isAuthenticated && !isEditing) ? (
              <div className="auth-required-note">
                You need to be logged in to view or edit this review.
              </div>
            ) : (
              <>
                <div className="review-cards-grid">
                  {/* Watched Date Card */}
                  <div className="review-card square">
                    <div className="review-card-content">
                      <div className="card-icon-wrapper"><Calendar /></div>
                      <div className="card-value-section">
                        {isEditing ? (
                          <>
                            <input
                              type="date"
                              value={editData.watchedDate}
                              onChange={(e) => setEditData(prev => ({ ...prev, watchedDate: e.target.value }))}
                              className="apple-input"
                              disabled={isSubmitting}
                            />
                            <span className="card-secondary-value">Watched Date</span>
                          </>
                        ) : (
                          <>
                            <span className="card-primary-value">
                              {dateParts.fullDate}
                            </span>
                            <span className="card-secondary-value">Watched Date</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Star Rating Card */}
                  <div className="review-card square">
                    <div className="review-card-content">
                      <div className="card-icon-wrapper"><Star/></div>
                      <div className="card-value-section">
                        {isEditing ? (
                          <>
                            <div className="star-rating-display">
                              {renderStars()}
                            </div>
                            <span className="card-secondary-value">{editData.starRating > 0 ? editData.starRating + '/5' : 'Rate It'}</span>
                          </>
                        ) : (
                          <>
                            {(movie.rating || 0) > 0 ? (
                              <div className="star-rating-display-static">
                                <StarDisplay rating={movie.rating} />
                              </div>
                            ) : (
                              <span className="card-empty-state">No Rating</span>
                            )}
                            <span className="card-secondary-value">Star Rating</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Percentage Rating Card */}
                  <div className="review-card square">
                    <div className="review-card-content">
                      <div className="card-icon-wrapper"><Percent/></div>
                      <div className="card-value-section">
                        {isEditing ? (
                          <>
                            <div className="percentage-rating-container-edit">
                               <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editData.percentageRating}
                                  onChange={handlePercentageChange}
                                  onBlur={handlePercentageBlur}
                                  className="apple-input percentage-input-card"
                                  disabled={isSubmitting}
                                  placeholder="0-100"
                                />
                                <span className="percentage-symbol-card">%</span>
                            </div>
                            <span className="card-secondary-value">Score</span>
                          </>
                        ) : (
                          <>
                            {(movie.detailed_rating || movie.detailedRating) ? (
                              <span className="card-primary-value score-value">{movie.detailed_rating || movie.detailedRating}%</span>
                            ) : (
                              <span className="card-empty-state">N/A</span>
                            )}
                            <span className="card-secondary-value">Score</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rewatch Card */}
                  <div className="review-card square">
                    <div className="review-card-content">
                      <div className="card-icon-wrapper"><RotateCcw /></div>
                      <div className="card-value-section">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className={`rewatch-button ${editData.isRewatch ? 'active' : ''}`}
                              onClick={() => setEditData(prev => ({ ...prev, isRewatch: !prev.isRewatch }))}
                              disabled={isSubmitting}
                            >
                              <RotateCcw size={22} />
                            </button>
                            <span className="card-secondary-value">
                              {editData.isRewatch ? 'Rewatch' : 'First Time'}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="card-primary-value">{(movie.is_rewatch || movie.isRewatch) ? 'Yes' : 'No'}</span>
                            <span className="card-secondary-value">Rewatch</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tags Card */}
                  <div className="review-card square">
                    <div className="review-card-content">
                      <div className="card-icon-wrapper"><Tag /></div>
                      <div className="card-value-section">
                        {isEditing ? (
                          <>
                            <div className="tags-edit-section">
                              <input
                                type="text"
                                placeholder="Add tag..."
                                value={currentTag}
                                onChange={handleTagInputChange}
                                onKeyPress={handleTagKeyPress}
                                className="apple-input tag-input"
                                disabled={isSubmitting}
                              />
                              {editData.tags.length > 0 && (
                                <div className="tags-mini-list">
                                  {editData.tags.slice(0, 2).map((tag, index) => (
                                    <span key={index} className="tag-mini">
                                      {tag}
                                      <button type="button" className="tag-remove-mini" onClick={() => removeTag(tag)} disabled={isSubmitting}><X size={10}/></button>
                                    </span>
                                  ))}
                                  {editData.tags.length > 2 && <span className="tags-more-mini">+{editData.tags.length - 2}</span>}
                                </div>
                              )}
                            </div>
                            <span className="card-secondary-value">Tags</span>
                          </>
                        ) : (
                          <>
                            {(movie.tags && (typeof movie.tags === 'string' ? movie.tags.split(', ').filter(Boolean) : movie.tags).length > 0) ? (
                              <div className="tags-display-section">
                                {(typeof movie.tags === 'string' ? movie.tags.split(', ').filter(Boolean) : movie.tags).slice(0,3).map((tag, index) => (
                                  <span key={index} className="card-tag-item">{tag}</span>
                                ))}
                                {(typeof movie.tags === 'string' ? movie.tags.split(', ').filter(Boolean) : movie.tags).length > 3 && <span className="tags-more-mini">+{ (typeof movie.tags === 'string' ? movie.tags.split(', ').filter(Boolean) : movie.tags).length - 3}</span>}
                              </div>
                            ) : (
                              <span className="card-empty-state">No Tags</span>
                            )}
                            <span className="card-secondary-value">Tags</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Review Notes Section (Full Width Card) */}
                <div className="review-card full-width">
                  <div className="review-card-content">
                     <div className="card-icon-wrapper" style={{ alignSelf: 'flex-start', marginTop: '4px' }}><Film/></div>
                    <div className="card-value-section">
                      <span className="card-secondary-value" style={{ marginBottom: '8px', marginTop: '6px', fontWeight: '600', alignSelf: 'flex-start', color: 'white', fontSize: '18px' }}>Review</span>
                      {isEditing ? (
                        <textarea
                          value={editData.review}
                          onChange={(e) => setEditData(prev => ({ ...prev, review: e.target.value }))}
                          placeholder="What did you think?"
                          className="review-card-textarea"
                          disabled={isSubmitting}
                          rows={4}
                        />
                      ) : (
                        movie.notes ? (
                          <div className="review-notes"><p>{movie.notes}</p></div>
                        ) : (
                          <span className="card-empty-state">No review notes yet.</span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};

export default MovieDetailsModal; 