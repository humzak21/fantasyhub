import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft } from 'lucide-react';

const MobileScreenManager = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  showBackButton = true,
  showCloseButton = true,
  enableSwipeBack = true,
  className = ''
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const screenRef = useRef(null);
  const contentRef = useRef(null);

  // Minimum swipe distance (in px) to trigger swipe back
  const minSwipeDistance = 50;

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      // Prevent body scroll when screen is open
      document.body.style.overflow = 'hidden';
      
      // Add animation class after a brief delay for smooth transition
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 300);
      
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsAnimating(true);
    setTimeout(() => {
      onClose();
      setIsAnimating(false);
    }, 250);
  };

  const handleTouchStart = (e) => {
    if (!enableSwipeBack) return;
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (!enableSwipeBack || !touchStart) return;
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!enableSwipeBack || !touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    // Right swipe (swipe back gesture)
    if (isRightSwipe) {
      handleClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 bg-white ${isAnimating ? 'animate-slide-in-right' : ''}`}
      ref={screenRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          {showBackButton && (
            <button
              onClick={handleClose}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
              aria-label="Go back"
            >
              <ChevronLeft className="w-6 h-6 text-gray-600" />
            </button>
          )}
          <h1 className="text-lg font-semibold text-gray-900 truncate">
            {title}
          </h1>
        </div>
        
        {showCloseButton && (
          <button
            onClick={handleClose}
            className="p-2 -mr-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        )}
      </div>

      {/* Content */}
      <div 
        className={`flex-1 overflow-y-auto ${className}`}
        ref={contentRef}
      >
        {children}
      </div>
    </div>
  );
};

export default MobileScreenManager;