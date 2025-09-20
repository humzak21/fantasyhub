import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../../lib/utils';

// Hook for handling touch gestures
const useTouchGestures = ({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  onTap,
  onDoubleTap,
  onLongPress,
  swipeThreshold = 50,
  longPressDelay = 500,
  doubleTapDelay = 300
} = {}) => {
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [lastTap, setLastTap] = useState(0);
  const longPressTimer = useRef(null);
  const isLongPress = useRef(false);

  const handleTouchStart = useCallback((e) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
      time: Date.now()
    });

    // Start long press timer
    if (onLongPress) {
      isLongPress.current = false;
      longPressTimer.current = setTimeout(() => {
        isLongPress.current = true;
        onLongPress(e);
      }, longPressDelay);
    }
  }, [onLongPress, longPressDelay]);

  const handleTouchMove = useCallback((e) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });

    // Cancel long press if finger moves too much
    if (longPressTimer.current && touchStart) {
      const deltaX = Math.abs(e.targetTouches[0].clientX - touchStart.x);
      const deltaY = Math.abs(e.targetTouches[0].clientY - touchStart.y);
      
      if (deltaX > 10 || deltaY > 10) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  }, [touchStart]);

  const handleTouchEnd = useCallback((e) => {
    // Clear long press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // Don't process other gestures if it was a long press
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }

    if (!touchStart || !touchEnd) {
      // Handle tap
      const now = Date.now();
      const timeDiff = now - lastTap;
      
      if (timeDiff < doubleTapDelay && timeDiff > 0) {
        // Double tap
        if (onDoubleTap) {
          onDoubleTap(e);
        }
        setLastTap(0);
      } else {
        // Single tap
        if (onTap) {
          setTimeout(() => {
            if (Date.now() - now >= doubleTapDelay) {
              onTap(e);
            }
          }, doubleTapDelay);
        }
        setLastTap(now);
      }
      return;
    }

    const deltaX = touchStart.x - touchEnd.x;
    const deltaY = touchStart.y - touchEnd.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Determine swipe direction
    if (Math.max(absDeltaX, absDeltaY) > swipeThreshold) {
      if (absDeltaX > absDeltaY) {
        // Horizontal swipe
        if (deltaX > 0) {
          onSwipeLeft?.(e);
        } else {
          onSwipeRight?.(e);
        }
      } else {
        // Vertical swipe
        if (deltaY > 0) {
          onSwipeUp?.(e);
        } else {
          onSwipeDown?.(e);
        }
      }
    }
  }, [touchStart, touchEnd, lastTap, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onTap, onDoubleTap, swipeThreshold, doubleTapDelay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd
  };
};

// Touch-optimized card component
const MobileTouchCard = ({
  children,
  className,
  onTap,
  onDoubleTap,
  onLongPress,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  pressable = true,
  hapticFeedback = false,
  ...props
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const touchHandlers = useTouchGestures({
    onTap,
    onDoubleTap,
    onLongPress,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown
  });

  const handleTouchStart = (e) => {
    if (pressable) {
      setIsPressed(true);
    }
    
    if (hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
    
    touchHandlers.onTouchStart(e);
  };

  const handleTouchEnd = (e) => {
    if (pressable) {
      setTimeout(() => setIsPressed(false), 150);
    }
    
    touchHandlers.onTouchEnd(e);
  };

  return (
    <div
      className={cn(
        'touch-manipulation select-none',
        'transition-all duration-150 ease-out',
        pressable && isPressed && 'scale-95 opacity-90',
        className
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={touchHandlers.onTouchMove}
      onTouchEnd={handleTouchEnd}
      {...props}
    >
      {children}
    </div>
  );
};

// Swipeable list item
const MobileSwipeableItem = ({
  children,
  leftActions,
  rightActions,
  className,
  onSwipeThreshold = 80,
  ...props
}) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwipeActive, setIsSwipeActive] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    setIsSwipeActive(true);
  };

  const handleTouchMove = (e) => {
    if (!isSwipeActive) return;
    
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    
    // Limit swipe distance
    const maxSwipe = 120;
    const limitedDiff = Math.max(-maxSwipe, Math.min(maxSwipe, diff));
    
    setSwipeOffset(limitedDiff);
  };

  const handleTouchEnd = () => {
    setIsSwipeActive(false);
    
    // Trigger actions if threshold is met
    if (Math.abs(swipeOffset) > onSwipeThreshold) {
      if (swipeOffset > 0 && rightActions) {
        // Swiped right - show left actions
        rightActions.forEach(action => action.onTrigger?.());
      } else if (swipeOffset < 0 && leftActions) {
        // Swiped left - show right actions
        leftActions.forEach(action => action.onTrigger?.());
      }
    }
    
    // Reset position
    setSwipeOffset(0);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Left actions */}
      {leftActions && (
        <div className="absolute left-0 top-0 bottom-0 flex items-center bg-red-500">
          {leftActions.map((action, index) => (
            <button
              key={index}
              className="h-full px-4 text-white font-medium"
              onClick={action.onTrigger}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
      
      {/* Right actions */}
      {rightActions && (
        <div className="absolute right-0 top-0 bottom-0 flex items-center bg-blue-500">
          {rightActions.map((action, index) => (
            <button
              key={index}
              className="h-full px-4 text-white font-medium"
              onClick={action.onTrigger}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
      
      {/* Main content */}
      <div
        className={cn(
          'relative bg-white transition-transform duration-200 ease-out',
          className
        )}
        style={{
          transform: `translateX(${swipeOffset}px)`
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        {...props}
      >
        {children}
      </div>
    </div>
  );
};

// Pull to refresh component
const MobilePullToRefresh = ({
  children,
  onRefresh,
  refreshThreshold = 80,
  className,
  refreshingText = 'Refreshing...',
  pullText = 'Pull to refresh'
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canPull, setCanPull] = useState(false);
  const startY = useRef(0);
  const scrollElement = useRef(null);

  const handleTouchStart = (e) => {
    const scrollTop = scrollElement.current?.scrollTop || 0;
    setCanPull(scrollTop === 0);
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    if (!canPull || isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    
    if (diff > 0) {
      e.preventDefault();
      setPullDistance(Math.min(diff * 0.5, refreshThreshold * 1.5));
    }
  };

  const handleTouchEnd = async () => {
    if (!canPull || isRefreshing) return;
    
    if (pullDistance > refreshThreshold) {
      setIsRefreshing(true);
      try {
        await onRefresh?.();
      } finally {
        setIsRefreshing(false);
      }
    }
    
    setPullDistance(0);
    setCanPull(false);
  };

  const showRefreshIndicator = pullDistance > 20 || isRefreshing;
  const shouldTrigger = pullDistance > refreshThreshold;

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Pull indicator */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 z-10',
          'flex items-center justify-center',
          'bg-gray-50 border-b border-gray-200',
          'transition-all duration-200 ease-out',
          showRefreshIndicator ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          height: Math.max(0, pullDistance),
          transform: `translateY(${Math.max(0, pullDistance - 60)}px)`
        }}
      >
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className={cn(
            'w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full',
            (isRefreshing || shouldTrigger) && 'animate-spin'
          )} />
          <span>
            {isRefreshing ? refreshingText : shouldTrigger ? 'Release to refresh' : pullText}
          </span>
        </div>
      </div>
      
      {/* Content */}
      <div
        ref={scrollElement}
        className="h-full overflow-y-auto"
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance === 0 ? 'transform 0.2s ease-out' : 'none'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};

export {
  useTouchGestures,
  MobileTouchCard,
  MobileSwipeableItem,
  MobilePullToRefresh
};

export default MobileTouchCard;