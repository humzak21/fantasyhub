import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Star, Film, RotateCcw, Calendar, Trophy, TrendingUp, Eye, Clock } from 'lucide-react';
import Slider from 'react-slick';
import { motion, useAnimation, useInView } from 'framer-motion';
import { useSupabaseMovieData } from '../hooks/useSupabaseMovieData';
import { useQuotes } from '../hooks/useQuotes';
import { importSlideshowImages } from '../utils/slideshowImages';
import MovieDetailsModal from '../components/MovieDetailsModal';
import StarDisplay from '../components/StarDisplay';

function Overview() {
  const { 
    movies, 
    movieStats, 
    recentMovies, 
    observeMovieCards,
    loading,
    error
  } = useSupabaseMovieData();
  
  const { quote, loading: quoteLoading } = useQuotes();
  
  // Memoize the display text to prevent changes during animations
  const displayQuote = useMemo(() => {
    if (quoteLoading || !quote) {
      return "Humza's personal movie tracker";
    }
    return quote;
  }, [quote, quoteLoading]);
  
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedMovieIndex, setSelectedMovieIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const sliderRef = useRef(null);

  // Load slideshow images on component mount
  const loadedSlideshowImages = useMemo(() => {
    try {
      const images = importSlideshowImages();
      console.log('Slideshow images loaded:', images.length);
      return images;
    } catch (error) {
      console.error('Error loading slideshow images:', error);
      return [];
    }
  }, []);

  // Handle visibility change for slideshow
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsTabVisible(visible);
      
      if (sliderRef.current) {
        if (visible && loadedSlideshowImages.length > 1) {
          sliderRef.current.slickPlay();
        } else {
          sliderRef.current.slickPause();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadedSlideshowImages.length]);

  // Set up intersection observer for movie cards
  useEffect(() => {
    const cleanup = observeMovieCards();
    return cleanup;
  }, [observeMovieCards]);

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
    const displayedMovies = recentMovies.slice(0, 12);
    if (newIndex >= 0 && newIndex < displayedMovies.length) {
      setSelectedMovie(displayedMovies[newIndex]);
      setSelectedMovieIndex(newIndex);
    }
  };

  // Slideshow settings
  const sliderSettings = {
    dots: false,
    infinite: loadedSlideshowImages.length > 1,
    speed: 1000,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: loadedSlideshowImages.length > 1 && isTabVisible,
    autoplaySpeed: 10000,
    fade: false,
    arrows: false,
    pauseOnHover: false,
  };

  // Animation controls for different sections
  const heroControls = useAnimation();
  const statsControls = useAnimation();
  const recentMoviesControls = useAnimation();
  
  // Refs for intersection observer
  const heroRef = useRef(null);
  const statsRef = useRef(null);
  const recentMoviesRef = useRef(null);
  
  // Check if elements are in view
  const heroInView = useInView(heroRef, { once: true, threshold: 0.3 });
  const statsInView = useInView(statsRef, { once: true, threshold: 0.2 });
  const recentMoviesInView = useInView(recentMoviesRef, { once: true, threshold: 0.1 });

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
        ease: [0.25, 0.1, 0.25, 1] // Custom bezier curve for Apple-like easing
      }
    }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const statCardVariant = {
    hidden: { 
      opacity: 0, 
      y: 40,
      scale: 0.9
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.1, 0.25, 1]
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

  // Trigger animations when sections come into view
  useEffect(() => {
    if (heroInView) {
      heroControls.start('visible');
    }
  }, [heroInView, heroControls]);

  useEffect(() => {
    if (statsInView) {
      statsControls.start('visible');
    }
  }, [statsInView, statsControls]);

  useEffect(() => {
    if (recentMoviesInView) {
      recentMoviesControls.start('visible');
    }
  }, [recentMoviesInView, recentMoviesControls]);

  // if (loading) {
  //   return (
  //     <div className="section">
  //       <div className="container">
  //         <h2 className="section-title">Loading Movie Data...</h2>
  //       </div>
  //     </div>
  //   );
  // }

  if (error) {
    return (
      <div className="section">
        <div className="container">
          <h2 className="section-title">Error Loading Movie Data</h2>
          <p style={{ color: '#ff4444' }}>{error}</p>
        </div>
      </div>
    );
  }

  const displayedMovies = recentMovies.slice(0, 14);
  
  return (
    <>
      {/* Fullscreen Slideshow Section */}
      <div className="slideshow-container">
        {loadedSlideshowImages.length > 0 ? (
          <Slider ref={sliderRef} {...sliderSettings}>
            {loadedSlideshowImages.map((image, index) => (
              <div key={index} className="slide">
                <div 
                  className="slide-image"
                  style={{
                    backgroundImage: `url(${image})`,
                  }}
                />
              </div>
            ))}
          </Slider>
        ) : (
          // Fallback when no images are loaded
          <div className="slide">
            <div 
              className="slide-image"
              style={{
                backgroundColor: '#1a1a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '18px'
              }}
            >
              <Film size={64} style={{ opacity: 0.3 }} />
            </div>
          </div>
        )}
        
        {/* Black Overlay */}
        <div className="slideshow-black-overlay"></div>
        
        {/* Overlay Content */}
        <div className="slideshow-overlay">
          <div className="container">
            <motion.div 
              ref={heroRef}
              className="hero-content"
              variants={fadeInUp}
              initial="hidden"
              animate={heroControls}
            >
              <motion.h1 
                className="overview-title"
                variants={fadeInUp}
              >
                Hk
              </motion.h1>
              <motion.p
                variants={fadeInUp}
              >
                {displayQuote}
              </motion.p>
              
              <motion.div 
                ref={statsRef}
                className="stats-grid"
                variants={staggerContainer}
                initial="hidden"
                animate={statsControls}
              >
                <motion.div className="stat-card" variants={statCardVariant}>
                  <span className="stat-number">{movieStats?.totalMovies || 0}</span>
                  <span className="stat-label">Total Movies</span>
                </motion.div>
                <motion.div className="stat-card" variants={statCardVariant}>
                  <span className="stat-number">{movieStats?.uniqueMovies || 0}</span>
                  <span className="stat-label">Unique Films</span>
                </motion.div>
                <motion.div className="stat-card" variants={statCardVariant}>
                  <span className="stat-number">{movieStats?.averageUserRating || movieStats?.averageRating || 0}</span>
                  <span className="stat-label">Average Rating</span>
                </motion.div>
                <motion.div className="stat-card" variants={statCardVariant}>
                  <span className="stat-number">{movieStats?.fiveStarMovies || 0}</span>
                  <span className="stat-label">5-Star Movies</span>
                </motion.div>
                <motion.div className="stat-card" variants={statCardVariant}>
                  <span className="stat-number">{movieStats?.rewatchCount || 0}</span>
                  <span className="stat-label">Rewatches</span>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Recent Movies Section */}
      <motion.div 
        className="section"
        ref={recentMoviesRef}
        variants={fadeInUp}
        initial="hidden"
        animate={recentMoviesControls}
      >
        <div className="container">
          <div className="recent-movies">
            <motion.h2
              variants={fadeInUp}
            >
              Recent Movies
            </motion.h2>
            <motion.div 
              className="movie-grid"
              variants={staggerContainer}
              initial="hidden"
              animate={recentMoviesInView ? 'visible' : 'hidden'}
            >
              {displayedMovies.map((movie, index) => (
                <motion.div 
                  key={movie.id || `${movie.title}-${movie.date}-${index}`}
                  className="movie-card"
                  data-movie-title={movie.title}
                  onClick={() => handleMovieClick(movie, index)}
                  variants={movieCardVariant}
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
              ))}
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Movie Details Modal */}
      <MovieDetailsModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        movie={selectedMovie}
        movies={displayedMovies}
        currentIndex={selectedMovieIndex}
        onNavigate={handleModalNavigate}
      />
    </>
  );
}

export default Overview; 