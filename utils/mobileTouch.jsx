import React, { useRef, useCallback, useEffect } from 'react';

/**
 * Mobile Touch Event Handling Utilities
 * Provides optimized touch interactions for mobile devices
 */

/**
 * Hook for optimized touch event handling with gesture support
 * @param {Object} options - Touch handling options
 * @returns {Object} Touch event handlers and state
 */
export const useMobileTouch = (options = {}) => {
  const {
    onTap = null,
    onLongPress = null,
    onSwipe = null,
    onPinch = null,
    longPressDelay = 500,
    swipeThreshold = 50,
    pinchThreshold = 10
  } = options;

  const touchRef = useRef(null);
  const gestureState = useRef({
    startTime: 0,
    startX: 0,
    startY: 0,
    startDistance: 0,
    isLongPress: false,
    longPressTimer: null,
    touches: []
  });

  const [touchState, setTouchState] = React.useState({
    isTouching: false,
    isLongPressing: false,
    swipeDirection: null,
    scale: 1
  });

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    const now = Date.now();

    gestureState.current = {
      ...gestureState.current,
      startTime: now,
      startX: touch.clientX,
      startY: touch.clientY,
      isLongPress: false,
      touches: Array.from(e.touches)
    };

    setTouchState(prev => ({ ...prev, isTouching: true }));

    // Handle multi-touch for pinch gestures
    if (e.touches.length === 2 && onPinch) {
      const distance = Math.sqrt(
        Math.pow(e.touches[1].clientX - e.touches[0].clientX, 2) +
        Math.pow(e.touches[1].clientY - e.touches[0].clientY, 2)
      );
      gestureState.current.startDistance = distance;
    }

    // Start long press timer
    if (onLongPress) {
      gestureState.current.longPressTimer = setTimeout(() => {
        gestureState.current.isLongPress = true;
        setTouchState(prev => ({ ...prev, isLongPressing: true }));
        onLongPress(e);
      }, longPressDelay);
    }

    // Prevent default to avoid double-tap zoom (only if cancelable)
    if (e.touches.length === 1 && e.cancelable) {
      e.preventDefault();
    }
  }, [onLongPress, longPressDelay]);

  const handleTouchMove = useCallback((e) => {
    if (!gestureState.current.startTime) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - gestureState.current.startX;
    const deltaY = touch.clientY - gestureState.current.startY;

    // Cancel long press if finger moves too much
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      if (gestureState.current.longPressTimer) {
        clearTimeout(gestureState.current.longPressTimer);
        gestureState.current.longPressTimer = null;
      }
    }

    // Handle pinch gestures
    if (e.touches.length === 2 && onPinch && gestureState.current.startDistance) {
      const currentDistance = Math.sqrt(
        Math.pow(e.touches[1].clientX - e.touches[0].clientX, 2) +
        Math.pow(e.touches[1].clientY - e.touches[0].clientY, 2)
      );

      const scale = currentDistance / gestureState.current.startDistance;

      if (Math.abs(scale - 1) > pinchThreshold / 100) {
        setTouchState(prev => ({ ...prev, scale }));
        onPinch({ scale, delta: scale - 1 });
      }
    }

    if (e.cancelable) {
      e.preventDefault();
    }
  }, [onPinch, pinchThreshold]);

  const handleTouchEnd = useCallback((e) => {
    if (!gestureState.current.startTime) return;

    const now = Date.now();
    const duration = now - gestureState.current.startTime;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - gestureState.current.startX;
    const deltaY = touch.clientY - gestureState.current.startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Clear long press timer
    if (gestureState.current.longPressTimer) {
      clearTimeout(gestureState.current.longPressTimer);
      gestureState.current.longPressTimer = null;
    }

    // Handle tap if it wasn't a long press and movement was minimal
    if (!gestureState.current.isLongPress && distance < 10 && duration < 300 && onTap) {
      onTap(e);
    }

    // Handle swipe gestures
    if (onSwipe && distance > swipeThreshold && duration < 500) {
      let direction = null;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        direction = deltaX > 0 ? 'right' : 'left';
      } else {
        direction = deltaY > 0 ? 'down' : 'up';
      }

      setTouchState(prev => ({ ...prev, swipeDirection: direction }));
      onSwipe({ direction, deltaX, deltaY, distance, duration });

      // Reset swipe direction after a short delay
      setTimeout(() => {
        setTouchState(prev => ({ ...prev, swipeDirection: null }));
      }, 100);
    }

    // Reset touch state
    setTouchState(prev => ({
      ...prev,
      isTouching: false,
      isLongPressing: false,
      scale: 1
    }));

    // Reset gesture state
    gestureState.current = {
      startTime: 0,
      startX: 0,
      startY: 0,
      startDistance: 0,
      isLongPress: false,
      longPressTimer: null,
      touches: []
    };
  }, [onTap, onSwipe, swipeThreshold]);

  const touchHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd
  };

  return {
    touchRef,
    touchHandlers,
    touchState,
    bind: () => touchHandlers
  };
};

/**
 * Hook for optimized scrolling with momentum and bounce effects
 * @param {Object} options - Scroll options
 * @returns {Object} Scroll handlers and state
 */
export const useMobileScroll = (options = {}) => {
  const {
    onScroll = null,
    momentum = true,
    bounce = true,
    threshold = 5
  } = options;

  const scrollRef = useRef(null);
  const scrollState = useRef({
    lastY: 0,
    velocity: 0,
    momentum: false,
    animationFrame: null
  });

  const [isScrolling, setIsScrolling] = React.useState(false);

  const handleScroll = useCallback((e) => {
    const currentY = e.target.scrollTop;
    const deltaY = currentY - scrollState.current.lastY;
    const now = performance.now();

    // Calculate velocity
    scrollState.current.velocity = deltaY;
    scrollState.current.lastY = currentY;

    setIsScrolling(true);

    if (onScroll) {
      onScroll({ scrollTop: currentY, deltaY, velocity: scrollState.current.velocity });
    }

    // Clear existing animation frame
    if (scrollState.current.animationFrame) {
      cancelAnimationFrame(scrollState.current.animationFrame);
    }

    // Set scrolling to false after scroll ends
    scrollState.current.animationFrame = requestAnimationFrame(() => {
      setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    });
  }, [onScroll]);

  return {
    scrollRef,
    isScrolling,
    scrollHandlers: {
      onScroll: handleScroll
    }
  };
};

/**
 * Hook for pull-to-refresh functionality
 * @param {Function} onRefresh - Function to call when refresh is triggered
 * @param {Object} options - Refresh options
 * @returns {Object} Refresh handlers and state
 */
export const usePullToRefresh = (onRefresh, options = {}) => {
  const {
    threshold = 80,
    resistance = 2.5,
    refreshDelay = 1000
  } = options;

  const containerRef = useRef(null);
  const [refreshState, setRefreshState] = React.useState({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
    canRefresh: false
  });

  const handleTouchStart = useCallback((e) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      const touch = e.touches[0];
      containerRef.current.startY = touch.clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!containerRef.current || !containerRef.current.startY) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - containerRef.current.startY;

    if (deltaY > 0 && containerRef.current.scrollTop === 0) {
      if (e.cancelable) {
        e.preventDefault();
      }

      const pullDistance = Math.min(deltaY / resistance, threshold * 1.2);
      const canRefresh = pullDistance >= threshold;

      setRefreshState({
        isPulling: true,
        isRefreshing: false,
        pullDistance,
        canRefresh
      });
    }
  }, [threshold, resistance]);

  const handleTouchEnd = useCallback(() => {
    if (refreshState.canRefresh && !refreshState.isRefreshing) {
      setRefreshState(prev => ({
        ...prev,
        isRefreshing: true,
        isPulling: false,
        pullDistance: threshold
      }));

      // Call refresh function
      Promise.resolve(onRefresh()).finally(() => {
        setTimeout(() => {
          setRefreshState({
            isPulling: false,
            isRefreshing: false,
            pullDistance: 0,
            canRefresh: false
          });
        }, refreshDelay);
      });
    } else {
      setRefreshState({
        isPulling: false,
        isRefreshing: false,
        pullDistance: 0,
        canRefresh: false
      });
    }

    if (containerRef.current) {
      containerRef.current.startY = null;
    }
  }, [refreshState.canRefresh, refreshState.isRefreshing, onRefresh, threshold, refreshDelay]);

  return {
    containerRef,
    refreshState,
    refreshHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    }
  };
};

/**
 * Touch-optimized button component
 */
export const MobileTouchButton = React.forwardRef(({
  children,
  onPress,
  onLongPress,
  disabled = false,
  className = '',
  activeClassName = 'mobile-touch-active',
  hapticFeedback = true,
  ...props
}, ref) => {
  const { touchHandlers, touchState } = useMobileTouch({
    onTap: onPress,
    onLongPress: onLongPress
  });

  // Trigger haptic feedback if available
  const triggerHaptic = useCallback(() => {
    if (hapticFeedback && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }, [hapticFeedback]);

  const handlePress = useCallback((e) => {
    if (!disabled) {
      triggerHaptic();
      if (onPress) onPress(e);
    }
  }, [disabled, onPress, triggerHaptic]);

  const buttonClassName = `
    ${className}
    ${touchState.isTouching && !disabled ? activeClassName : ''}
    ${disabled ? 'opacity-50 pointer-events-none' : ''}
    touch-manipulation select-none
  `.trim();

  return (
    <button
      {...props}
      {...touchHandlers}
      ref={ref}
      className={buttonClassName}
      disabled={disabled}
      style={{
        transform: touchState.isTouching && !disabled ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.1s ease-out',
        ...props.style
      }}
    >
      {children}
    </button>
  );
});

MobileTouchButton.displayName = 'MobileTouchButton';

/**
 * Touch-optimized swipeable card component
 */
export const MobileSwipeCard = ({
  children,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  className = '',
  swipeThreshold = 50,
  ...props
}) => {
  const [swipeOffset, setSwipeOffset] = React.useState({ x: 0, y: 0 });
  const [isSwipeActive, setIsSwipeActive] = React.useState(false);

  const { touchHandlers } = useMobileTouch({
    onSwipe: ({ direction, deltaX, deltaY }) => {
      setIsSwipeActive(true);

      switch (direction) {
        case 'left':
          if (onSwipeLeft) onSwipeLeft();
          break;
        case 'right':
          if (onSwipeRight) onSwipeRight();
          break;
        case 'up':
          if (onSwipeUp) onSwipeUp();
          break;
        case 'down':
          if (onSwipeDown) onSwipeDown();
          break;
      }

      // Reset animation
      setTimeout(() => {
        setIsSwipeActive(false);
        setSwipeOffset({ x: 0, y: 0 });
      }, 200);
    },
    swipeThreshold
  });

  return (
    <div
      {...props}
      {...touchHandlers}
      className={`${className} touch-manipulation`}
      style={{
        transform: `translate(${swipeOffset.x}px, ${swipeOffset.y}px)`,
        transition: isSwipeActive ? 'transform 0.2s ease-out' : 'none',
        ...props.style
      }}
    >
      {children}
    </div>
  );
};

/**
 * Mobile-optimized drag and drop
 */
export const useMobileDragDrop = (options = {}) => {
  const {
    onDragStart = null,
    onDrag = null,
    onDragEnd = null,
    dragThreshold = 5
  } = options;

  const [dragState, setDragState] = React.useState({
    isDragging: false,
    dragOffset: { x: 0, y: 0 },
    startPosition: { x: 0, y: 0 }
  });

  const { touchHandlers } = useMobileTouch({
    onTap: (e) => {
      // Handle tap when not dragging
    }
  });

  const enhancedTouchHandlers = {
    ...touchHandlers,
    onTouchMove: (e) => {
      touchHandlers.onTouchMove(e);

      if (dragState.isDragging && onDrag) {
        const touch = e.touches[0];
        const dragOffset = {
          x: touch.clientX - dragState.startPosition.x,
          y: touch.clientY - dragState.startPosition.y
        };

        setDragState(prev => ({ ...prev, dragOffset }));
        onDrag({ dragOffset, touch: e.touches[0] });
      }
    }
  };

  return {
    dragState,
    dragHandlers: enhancedTouchHandlers,
    setDragActive: (active, position = { x: 0, y: 0 }) => {
      if (active && onDragStart) {
        onDragStart();
      } else if (!active && onDragEnd) {
        onDragEnd();
      }

      setDragState({
        isDragging: active,
        dragOffset: active ? { x: 0, y: 0 } : dragState.dragOffset,
        startPosition: position
      });
    }
  };
};