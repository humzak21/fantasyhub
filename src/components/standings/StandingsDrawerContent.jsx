import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const StandingsDrawerContent = ({ isOpen, onClose, children, loading = false }) => {
  const drawerRef = useRef(null);
  const backdropRef = useRef(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimatingOpen, setIsAnimatingOpen] = useState(false);

  // Minimum swipe distance to trigger close (in pixels)
  const minSwipeDistance = 50;

  // Handle rendering state for animations
  useEffect(() => {
    if (isOpen) {
      // First, render the component in closed state
      setShouldRender(true);
      // Then, trigger the opening animation in the next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimatingOpen(true);
        });
      });
    } else {
      // Immediately start closing animation
      setIsAnimatingOpen(false);
      // Delay unmounting to allow exit animation
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key press
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      // Prevent body scroll when drawer is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle orientation change
  useEffect(() => {
    const handleOrientationChange = () => {
      // Reset any drag state on orientation change
      setIsDragging(false);
      setDragOffset(0);
      setTouchStart(null);
      setTouchEnd(null);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  // Touch event handlers for swipe-to-close
  const handleTouchStart = (e) => {
    // Only handle touches that start near the left edge of the drawer (first 50px)
    const drawerRect = drawerRef.current?.getBoundingClientRect();
    const touchX = e.targetTouches[0].clientX;
    const drawerLeft = drawerRect?.left || 0;

    // If touch starts more than 50px from the left edge, don't handle it (allow scrolling)
    if (touchX - drawerLeft > 50) {
      return;
    }

    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging || touchStart === null) return;

    const currentTouch = e.targetTouches[0].clientX;
    const diff = currentTouch - touchStart;

    // Only allow dragging to the right (positive diff)
    if (diff > 0) {
      setDragOffset(Math.min(diff, 300)); // Max drag distance
      setTouchEnd(currentTouch);
      // Prevent default to avoid interference with scrolling
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      setIsDragging(false);
      setDragOffset(0);
      return;
    }

    const distance = touchEnd - touchStart;
    const isRightSwipe = distance > minSwipeDistance;

    if (isRightSwipe) {
      onClose();
    }

    // Reset drag state
    setIsDragging(false);
    setDragOffset(0);
    setTouchStart(null);
    setTouchEnd(null);
  };

  // Handle backdrop click
  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  // Don't render if not needed
  if (!shouldRender) return null;

  return (
    <div
      ref={drawerRef}
      className={`
        drawer-panel fixed top-0 right-0 bg-white dark:bg-gray-900 h-full shadow-xl
        w-[95%] max-w-[690px] sm:w-[690px]
        flex flex-col safe-area-inset-right z-[60]
        transition-transform duration-300 ease-out
        ${isAnimatingOpen ? 'translate-x-0' : 'translate-x-full'}
        ${isDragging ? '!transition-none' : ''}
        ${loading ? 'drawer-loading' : ''}
      `}
      style={{
        transform: isDragging ? `translateX(${dragOffset}px)` : undefined,
        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Scrollable content area */}
      <div
        className={`
          flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6
          ${loading ? 'drawer-content-loading' : ''}
        `}
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain'
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default StandingsDrawerContent;