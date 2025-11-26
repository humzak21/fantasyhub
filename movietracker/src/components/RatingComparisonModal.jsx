import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import apiService from '../services/apiService';

const RatingComparisonModal = ({ isOpen, onClose, targetRating }) => {
  const [similarMovies, setSimilarMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [ratingRange, setRatingRange] = useState({ min: 0, max: 0 });

  useEffect(() => {
    if (isOpen && targetRating && targetRating >= 0 && targetRating <= 100) {
      fetchSimilarMovies();
    }
  }, [isOpen, targetRating]);

  const fetchSimilarMovies = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await apiService.getMoviesByRatingRange(targetRating);
      if (response.success) {
        setSimilarMovies(response.data);
        setRatingRange(response.range);
      } else {
        setError('Failed to fetch similar movies');
      }
    } catch (err) {
      console.error('Error fetching similar movies:', err);
      setError('Failed to fetch similar movies');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatRating = (rating) => {
    return rating ? `${rating}%` : 'No rating';
  };

  if (!isOpen) return null;

  return (
    <div className="rating-comparison-overlay" onClick={handleOverlayClick}>
      <div className="rating-comparison-modal">
        <button 
          className="rating-comparison-close"
          onClick={onClose}
          aria-label="Close comparison"
        >
          <X size={16} />
        </button>

        <div className="rating-comparison-header">
          <h3>Your {ratingRange.min}-{ratingRange.max}% Films</h3>
          <p>{similarMovies.length} movie{similarMovies.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="rating-comparison-content">
          {isLoading ? (
            <div className="rating-comparison-loading">
              <div className="rating-comparison-spinner"></div>
            </div>
          ) : error ? (
            <div className="rating-comparison-error">
              <p>{error}</p>
            </div>
          ) : similarMovies.length === 0 ? (
            <div className="rating-comparison-empty">
              <p>No movies in this range</p>
            </div>
          ) : (
            <div className="rating-comparison-list">
              {similarMovies.map((movie) => (
                <div key={movie.id} className="rating-comparison-item">
                  <div className="rating-comparison-movie-info">
                    <span className="rating-comparison-title">{movie.title}</span>
                    {movie.release_year && (
                      <span className="rating-comparison-year">({movie.release_year})</span>
                    )}
                  </div>
                  <div className="rating-comparison-rating">
                    {formatRating(movie.detailed_rating)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RatingComparisonModal; 