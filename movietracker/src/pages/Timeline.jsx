import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Film, RotateCcw, Star, ChevronDown, MessageCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { useTimelineData } from '../hooks/useTimelineData';
import MovieDetailsModal from '../components/MovieDetailsModal';
import { getFormattedDateParts } from '../utils/dateUtils';
import StarDisplay from '../components/StarDisplay';

function Timeline() {
  const { 
    timelineEntries,
    timelinePagination,
    loadingMore,
    loadMoreMovies,
    searchQuery, 
    setSearchQuery, 
    ratingFilter, 
    setRatingFilter, 
    yearFilter, 
    setYearFilter,
    availableYears,
    loading,
    error,
    isSearching,
    searchLoading
  } = useTimelineData();

  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedMovieIndex, setSelectedMovieIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [flatMoviesList, setFlatMoviesList] = useState([]);
  const [visibleCards, setVisibleCards] = useState(new Set());
  const loadMoreTriggerRef = useRef(null);
  const cardRefs = useRef(new Map());

  // Create a flat list of all movies for navigation
  useEffect(() => {
    const allMovies = [];
    timelineEntries.forEach(([date, dayMovies]) => {
      dayMovies.forEach(movie => {
        allMovies.push(movie);
      });
    });
    setFlatMoviesList(allMovies);
  }, [timelineEntries]);

  // Group timeline entries by month
  const groupedByMonth = React.useMemo(() => {
    const monthGroups = new Map();

    timelineEntries.forEach(([date, dayMovies]) => {
      // Parse date string directly to avoid timezone issues
      const [year, month, day] = date.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
      
      const monthKey = dateObj.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });

      if (!monthGroups.has(monthKey)) {
        monthGroups.set(monthKey, []);
      }

      dayMovies.forEach(movie => {
        monthGroups.get(monthKey).push({
          ...movie,
          watchedDate: date
        });
      });
    });

    // Convert to array and sort by date (newest first)
    return Array.from(monthGroups.entries())
      .map(([monthKey, movies]) => [monthKey, movies])
      .sort((a, b) => new Date(b[1][0].watchedDate) - new Date(a[1][0].watchedDate));
  }, [timelineEntries]);

  // Animation intersection observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cardId = entry.target.dataset.cardId;
            if (cardId) {
              setVisibleCards(prev => new Set([...prev, cardId]));
            }
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -10% 0px'
      }
    );

    // Observe all card elements
    cardRefs.current.forEach((element) => {
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [groupedByMonth]);

  // Infinite scroll intersection observer (disabled during search)
  const handleIntersection = useCallback((entries) => {
    const [entry] = entries;
    if (entry.isIntersecting && timelinePagination?.hasNextPage && !loadingMore && !isSearching) {
      loadMoreMovies();
    }
  }, [timelinePagination, loadingMore, loadMoreMovies, isSearching]);

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

  // Handle movie click
  const handleMovieClick = (movie) => {
    const movieIndex = flatMoviesList.findIndex(m => 
      m.id === movie.id || (m.title === movie.title && m.watchedDate === movie.watchedDate)
    );
    setSelectedMovie(movie);
    setSelectedMovieIndex(movieIndex >= 0 ? movieIndex : 0);
    setIsModalOpen(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedMovie(null);
  };

  // Handle navigation in modal
  const handleModalNavigate = (newIndex) => {
    if (newIndex >= 0 && newIndex < flatMoviesList.length) {
      setSelectedMovie(flatMoviesList[newIndex]);
      setSelectedMovieIndex(newIndex);
    }
  };

  // Format date parts for column display
  const getDateParts = (dateString) => {
    const dateParts = getFormattedDateParts(dateString);
    return {
      month: dateParts.monthYear.split(' ')[0].toUpperCase(),
      day: dateParts.day
    };
  };

  // Generate unique card ID for animation tracking
  const getCardId = (monthIndex, movieIndex) => {
    return `${monthIndex}-${movieIndex}`;
  };

  // Calculate animation delay for cascade effect
  const getAnimationDelay = (monthIndex, movieIndex) => {
    const totalIndex = monthIndex * 10 + movieIndex; // Approximate global index
    return Math.min(totalIndex * 50, 1000); // Max 1 second delay, 50ms between cards
  };

  if (error) {
    return (
      <div className="section">
        <div className="container">
          <h2 className="section-title">Error Loading Timeline</h2>
          <p style={{ color: '#ff4444' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container">
        <div className="timeline-header">
          <h2 className="section-title">
            {isSearching ? 'Timeline Search Results' : 'Movie Timeline'}
          </h2>
          
          <div className="timeline-filters">
            <div className="timeline-search-wrapper">
              <input
                type="text"
                placeholder="Search your diary..."
                className="timeline-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="timeline-filter-group">
              <div className="timeline-filter-wrapper">
                <select
                  className="timeline-filter-select"
                  value={ratingFilter}
                  onChange={(e) => setRatingFilter(parseFloat(e.target.value))}
                >
                  <option value={0}>All Ratings</option>
                  <option value={4}>4+ Stars</option>
                  <option value={4.5}>4.5+ Stars</option>
                  <option value={5}>5 Stars Only</option>
                </select>
                <ChevronDown size={16} className="timeline-filter-chevron" />
              </div>
              
              <div className="timeline-filter-wrapper">
                <select
                  className="timeline-filter-select"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                >
                  <option value="all">All Years</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="timeline-filter-chevron" />
              </div>
            </div>
          </div>
        </div>

        <div className="timeline-content">
          {groupedByMonth.map(([monthYear, monthMovies], monthIndex) => (
            <div key={monthYear} className="timeline-day">
              <div className="timeline-day-header">
                <h3 className="timeline-day-date">{monthYear}</h3>
                <div className="timeline-day-count">
                  {monthMovies.length} {monthMovies.length === 1 ? 'film' : 'films'}
                </div>
              </div>
              
              {/* Column Headers - Desktop Only */}
              <div className="timeline-headers">
                <div className="timeline-header-day">Day</div>
                <div className="timeline-header-film">Film</div>
                <div className="timeline-header-released">Released</div>
                <div className="timeline-header-rating">Rating</div>
                <div className="timeline-header-stars">Stars</div>
                <div className="timeline-header-rewatch">Rewatch</div>
                <div className="timeline-header-review">Review</div>
              </div>
              
              <div className="timeline-day-movies">
                {monthMovies.map((movie, idx) => {
                  const dateParts = getDateParts(movie.watchedDate);
                  const cardId = getCardId(monthIndex, idx);
                  const animationDelay = getAnimationDelay(monthIndex, idx);
                  const isVisible = visibleCards.has(cardId);
                  
                  return (
                    <div 
                      key={movie.id || idx} 
                      ref={(el) => {
                        if (el) {
                          cardRefs.current.set(cardId, el);
                        } else {
                          cardRefs.current.delete(cardId);
                        }
                      }}
                      data-card-id={cardId}
                      className={`timeline-movie-card ${isVisible ? 'timeline-card-visible' : 'timeline-card-hidden'}`}
                      style={{
                        animationDelay: `${animationDelay}ms`
                      }}
                      onClick={() => handleMovieClick(movie)}
                    >
                      {/* Day Column */}
                      <div className="timeline-movie-day">
                        {dateParts.day}
                      </div>
                      
                      {/* Film Column */}
                      <div className="timeline-movie-film">
                        <div className="timeline-movie-poster">
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
                          <div className="timeline-poster-fallback" style={{ display: movie.posterUrl ? 'none' : 'flex' }}>
                            <Film size={14} />
                          </div>
                          
                          {/* Rewatch indicator on poster */}
                          {movie.isRewatch && (
                            <div className="timeline-rewatch-indicator">
                              <RotateCcw size={8} />
                            </div>
                          )}
                        </div>
                        
                        <div className="timeline-movie-info">
                          <h4 className="timeline-movie-title">{movie.title}</h4>
                          <div className="timeline-movie-year">{movie.releaseYear || movie.year}</div>
                        </div>
                      </div>
                      
                      {/* Released Column */}
                      <div className="timeline-movie-released">
                        {movie.releaseYear || movie.year}
                      </div>
                      
                      {/* Rating Column (Percentage) */}
                      <div className="timeline-movie-rating">
                        {movie.detailedRating && (
                          <div className="timeline-detailed-rating">
                            {movie.detailedRating}
                          </div>
                        )}
                      </div>
                      
                      {/* Stars Column */}
                      <div className="timeline-movie-stars">
                        <StarDisplay rating={movie.rating} />
                      </div>
                      
                      {/* Rewatch Column */}
                      <div className="timeline-movie-rewatch">
                        {movie.isRewatch && (
                          <RotateCcw size={16} className="timeline-rewatch-icon" />
                        )}
                      </div>
                      
                      {/* Review Column */}
                      <div className="timeline-movie-review-indicator">
                        {movie.review && movie.review.trim() && (
                          <MessageCircle 
                            size={16} 
                            className="timeline-review-icon has-review" 
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Show message when no results found */}
        {groupedByMonth.length === 0 && !loading && !searchLoading && (
          <div className="timeline-empty-state">
            <Film size={48} style={{ opacity: 0.3 }} />
            <h3>No entries found</h3>
            <p>
              {isSearching ? 'No movies found matching your search.' : 'Start watching movies to build your timeline!'}
            </p>
          </div>
        )}

        {/* Infinite scroll trigger (only when not searching) */}
        {!isSearching && timelinePagination?.hasNextPage && (
          <div
            ref={loadMoreTriggerRef}
            className="timeline-load-trigger"
          >
            {loadingMore && (
              <div className="timeline-loading">
                Loading more entries...
              </div>
            )}
          </div>
        )}

        {/* Manual Load More Button (as fallback, only when not searching) */}
        {!isSearching && timelinePagination?.hasNextPage && !loadingMore && (
          <div className="timeline-load-more">
            <button
              onClick={loadMoreMovies}
              className="timeline-load-more-btn"
            >
              Load More Entries
            </button>
          </div>
        )}

        {/* End of timeline message */}
        {!isSearching && !timelinePagination?.hasNextPage && groupedByMonth.length > 0 && (
          <div className="timeline-end-message">
            <div className="timeline-end-icon">🎬</div>
            <p>You've reached the beginning of your movie journey!</p>
          </div>
        )}
      </div>

      {/* Movie Details Modal */}
      <MovieDetailsModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        movie={selectedMovie}
        movies={flatMoviesList}
        currentIndex={selectedMovieIndex}
        onNavigate={handleModalNavigate}
      />
    </div>
  );
}

export default Timeline; 