import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { TrendingUp, Calendar, Film, Star, LogIn } from 'lucide-react';
import { motion, useScroll, useMotionValueEvent } from 'motion/react';
import DarkModeToggle from './DarkModeToggle';
import LoginModal from './LoginModal';
import UserDropdown from './UserDropdown';
import FloatingAddButton from './FloatingAddButton';
import AddMovieModal from './AddMovieModal';
import { useAuth } from '../contexts/AuthContext';
import logoImage from '../assets/logo6_black.png';

function Layout({ children }) {
  const [headerVisible, setHeaderVisible] = useState(true);
  const [scrollDirection, setScrollDirection] = useState('up');
  const [lastScrollY, setLastScrollY] = useState(0);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [addMovieModalOpen, setAddMovieModalOpen] = useState(false);
  const [loginPillVisible, setLoginPillVisible] = useState(false);
  const scrollTimeoutRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Scroll detection for header animation
  const { scrollY } = useScroll();
  
  useMotionValueEvent(scrollY, "change", (latest) => {
    const currentScrollY = latest;
    
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      // Scrolling down
      if (scrollDirection !== 'down') {
        setScrollDirection('down');
        setHeaderVisible(false);
      }
    } else if (currentScrollY < lastScrollY) {
      // Scrolling up
      if (scrollDirection !== 'up') {
        setScrollDirection('up');
        setHeaderVisible(true);
      }
    }
    
    setLastScrollY(currentScrollY);
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set timeout to show header after scroll stops
    scrollTimeoutRef.current = setTimeout(() => {
      setHeaderVisible(true);
    }, 150);
  });

  // Page ready state for animations
  const [pageReady, setPageReady] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setPageReady(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const openLoginModal = () => {
    setLoginModalOpen(true);
  };

  const closeLoginModal = () => {
    setLoginModalOpen(false);
  };

  const openAddMovieModal = () => {
    setAddMovieModalOpen(true);
  };

  const closeAddMovieModal = () => {
    setAddMovieModalOpen(false);
  };

  const handleTopRightHover = () => {
    if (!isAuthenticated) {
      setLoginPillVisible(true);
    }
  };

  const handleTopRightLeave = () => {
    setLoginPillVisible(false);
  };

  return (
    <div className="App">
      {/* Top right hover area for login pill (only when not authenticated) */}
      {!isAuthenticated && (
        <div 
          className="login-pill-trigger"
          onMouseEnter={handleTopRightHover}
          onMouseLeave={handleTopRightLeave}
        >
          <motion.div
            className="login-pill"
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ 
              opacity: loginPillVisible ? 1 : 0,
              scale: loginPillVisible ? 1 : 0.8,
              y: loginPillVisible ? 0 : -10
            }}
            transition={{ 
              duration: 0.3,
              ease: [0.4, 0, 0.2, 1]
            }}
            style={{
              pointerEvents: loginPillVisible ? 'auto' : 'none'
            }}
          >
            <button 
              onClick={openLoginModal}
              className="login-pill-btn"
            >
              <LogIn size={16} />
              Login
            </button>
          </motion.div>
        </div>
      )}

      {/* User dropdown (only when authenticated) */}
      {isAuthenticated && <UserDropdown />}

      <motion.header 
        className="header"
        animate={{ 
          opacity: headerVisible ? 1 : 0,
          y: headerVisible ? 0 : -20
        }}
        transition={{ 
          duration: 0.3,
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        <nav className="nav">
          <motion.div 
            className="nav-left"
            animate={{ 
              opacity: headerVisible ? 1 : 0,
              x: headerVisible ? 0 : -10
            }}
            transition={{ 
              duration: 0.3,
              delay: headerVisible ? 0.1 : 0
            }}
          >
            <ul className="nav-links">
              <li>
                <Link 
                  to="/movies" 
                  className={`nav-link ${isActive('/movies') ? 'active' : ''}`}
                >
                  <Film size={14} />
                  Movies
                </Link>
              </li>
              <li>
                <Link 
                  to="/timeline" 
                  className={`nav-link ${isActive('/timeline') ? 'active' : ''}`}
                >
                  <Calendar size={14} />
                  Timeline
                </Link>
              </li>
            </ul>
          </motion.div>

          <motion.div 
            className="nav-center"
            animate={{ 
              opacity: headerVisible ? 1 : 0,
              scale: headerVisible ? 1 : 0.9
            }}
            transition={{ 
              duration: 0.3,
              delay: headerVisible ? 0.05 : 0
            }}
          >
            <button 
              className="logo"
              onClick={() => navigate('/overview')}
              style={{ 
                background: 'none', 
                border: 'none',
                padding: 0,
                margin: 0
              }}
            >
              <img 
                src={logoImage} 
                alt="Logo" 
                className="logo-image"
              />
            </button>
          </motion.div>
          
          <motion.div 
            className="nav-right"
            animate={{ 
              opacity: headerVisible ? 1 : 0,
              x: headerVisible ? 0 : 10
            }}
            transition={{ 
              duration: 0.3,
              delay: headerVisible ? 0.1 : 0
            }}
          >
            <ul className="nav-links">
              <li>
                <Link 
                  to="/statistics" 
                  className={`nav-link ${isActive('/statistics') ? 'active' : ''}`}
                >
                  <TrendingUp size={14} />
                  Statistics
                </Link>
              </li>
              <li>
                <Link 
                  to="/toprated" 
                  className={`nav-link ${isActive('/toprated') ? 'active' : ''}`}
                >
                  <Star size={14} />
                  Top Rated
                </Link>
              </li>
            </ul>
          </motion.div>
        </nav>
      </motion.header>

      <main>
        <div style={{ minHeight: '50vh' }}>
          {children}
        </div>
        {pageReady && <DarkModeToggle />}
        {pageReady && isAuthenticated && <FloatingAddButton onClick={openAddMovieModal} />}
      </main>

      <footer style={{ 
        textAlign: 'center', 
        padding: '40px 20px 60px', 
        color: 'var(--text-secondary)',
        fontSize: '14px',
        fontWeight: 'var(--font-weight-medium)'
      }}>
        © Squared Studios 2025.
      </footer>

      <LoginModal isOpen={loginModalOpen} onClose={closeLoginModal} />
      <AddMovieModal isOpen={addMovieModalOpen} onClose={closeAddMovieModal} />
    </div>
  );
}

export default Layout; 