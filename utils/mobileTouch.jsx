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
function useMobileTouch(options) {
  const opts = options || {};
  const onTap = opts.onTap || null;
  const onLongPress = opts.onLongPress || null;
  const onSwipe = opts.onSwipe || null;
  const onPinch = opts.onPinch || null;
  const longPressDelay = opts.longPressDelay || 500;
  const swipeThreshold = opts.swipeThreshold || 50;
  const pinchThreshold = opts.pinchThreshold || 10;

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
      startTime: now,
      startX: touch.clientX,
      startY: touch.clientY,
      startDistance: 0,
      isLongPress: false,
      longPressTimer: null,
      touches: Array.from(e.touches)
    };

    setTouchState(prev => ({
      isTouching: true,
      isLongPressing: prev.isLongPressing,
      swipeDirection: prev.swipeDirection,
      scale: prev.scale
    }));

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
        setTouchState(prev => ({
          isTouching: prev.isTouching,
          isLongPressing: true,
          swipeDirection: prev.swipeDirection,
          scale: prev.scale
        }));
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
        setTouchState(prev => ({
          isTouching: prev.isTouching,
          isLongPressing: prev.isLongPressing,
          swipeDirection: prev.swipeDirection,
          scale: scale
        }));
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

      setTouchState(prev => ({
        isTouching: prev.isTouching,
        isLongPressing: prev.isLongPressing,
        swipeDirection: direction,
        scale: prev.scale
      }));

      onSwipe({ direction, deltaX, deltaY, distance, duration });

      // Reset swipe direction after a short delay
      setTimeout(() => {
        setTouchState(prev => ({
          isTouching: prev.isTouching,
          isLongPressing: prev.isLongPressing,
          swipeDirection: null,
          scale: prev.scale
        }));
      }, 100);
    }

    // Reset touch state
    setTouchState({
      isTouching: false,
      isLongPressing: false,
      swipeDirection: null,
      scale: 1
    });

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
}

/**
 * Hook for optimized scrolling with momentum and bounce effects
 * @param {Object} options - Scroll options
 * @returns {Object} Scroll handlers and state
 */
function useMobileScroll(options) {
  const opts = options || {};
  const onScroll = opts.onScroll || null;
  const momentum = opts.momentum !== false;
  const bounce = opts.bounce !== false;
  const threshold = opts.threshold || 5;

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
}

/**
 * Hook for pull-to-refresh functionality
 * @param {Function} onRefresh - Function to call when refresh is triggered
 * @param {Object} options - Refresh options
 * @returns {Object} Refresh handlers and state
 */
function usePullToRefresh(onRefresh, options) {
  const opts = options || {};
  const threshold = opts.threshold || 80;
  const resistance = opts.resistance || 2.5;
  const refreshDelay = opts.refreshDelay || 1000;

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
      setRefreshState({
        isPulling: false,
        isRefreshing: true,
        pullDistance: threshold,
        canRefresh: refreshState.canRefresh
      });

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
}

/**
 * Touch-optimized button component
 */
function MobileTouchButton(props) {
  const children = props.children;
  const onPress = props.onPress;
  const onLongPress = props.onLongPress;
  const disabled = props.disabled || false;
  const className = props.className || '';
  const activeClassName = props.activeClassName || 'mobile-touch-active';
  const hapticFeedback = props.hapticFeedback !== false;

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

  const buttonClassName = [
    className,
    touchState.isTouching && !disabled ? activeClassName : '',
    disabled ? 'opacity-50 pointer-events-none' : '',
    'touch-manipulation select-none'
  ].filter(Boolean).join(' ');

  const buttonStyle = {
    transform: touchState.isTouching && !disabled ? 'scale(0.98)' : 'scale(1)',
    transition: 'transform 0.1s ease-out'
  };

  if (props.style) {
    Object.assign(buttonStyle, props.style);
  }

  const buttonProps = {};
  Object.keys(props).forEach(key => {
    if (key !== 'children' && key !== 'onPress' && key !== 'onLongPress' &&
        key !== 'disabled' && key !== 'className' && key !== 'activeClassName' &&
        key !== 'hapticFeedback' && key !== 'style') {
      buttonProps[key] = props[key];
    }
  });

  return React.createElement('button', {
    ...buttonProps,
    ...touchHandlers,
    className: buttonClassName,
    disabled: disabled,
    style: buttonStyle
  }, children);
}

/**
 * Touch-optimized swipeable card component
 */
function MobileSwipeCard(props) {
  const children = props.children;
  const onSwipeLeft = props.onSwipeLeft;
  const onSwipeRight = props.onSwipeRight;
  const onSwipeUp = props.onSwipeUp;
  const onSwipeDown = props.onSwipeDown;
  const className = props.className || '';
  const swipeThreshold = props.swipeThreshold || 50;

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

  const cardStyle = {
    transform: 'translate(' + swipeOffset.x + 'px, ' + swipeOffset.y + 'px)',
    transition: isSwipeActive ? 'transform 0.2s ease-out' : 'none'
  };

  if (props.style) {
    Object.assign(cardStyle, props.style);
  }

  const cardProps = {};
  Object.keys(props).forEach(key => {
    if (key !== 'children' && key !== 'onSwipeLeft' && key !== 'onSwipeRight' &&
        key !== 'onSwipeUp' && key !== 'onSwipeDown' && key !== 'className' &&
        key !== 'swipeThreshold' && key !== 'style') {
      cardProps[key] = props[key];
    }
  });

  return React.createElement('div', {
    ...cardProps,
    ...touchHandlers,
    className: className + ' touch-manipulation',
    style: cardStyle
  }, children);
}

/**
 * Mobile-optimized drag and drop
 */
function useMobileDragDrop(options) {
  const opts = options || {};
  const onDragStart = opts.onDragStart || null;
  const onDrag = opts.onDrag || null;
  const onDragEnd = opts.onDragEnd || null;
  const dragThreshold = opts.dragThreshold || 5;

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
    onTouchStart: touchHandlers.onTouchStart,
    onTouchEnd: touchHandlers.onTouchEnd,
    onTouchCancel: touchHandlers.onTouchCancel,
    onTouchMove: (e) => {
      touchHandlers.onTouchMove(e);

      if (dragState.isDragging && onDrag) {
        const touch = e.touches[0];
        const dragOffset = {
          x: touch.clientX - dragState.startPosition.x,
          y: touch.clientY - dragState.startPosition.y
        };

        setDragState({
          isDragging: dragState.isDragging,
          dragOffset: dragOffset,
          startPosition: dragState.startPosition
        });
        onDrag({ dragOffset, touch: e.touches[0] });
      }
    }
  };

  const setDragActive = function(active, position) {
    const pos = position || { x: 0, y: 0 };

    if (active && onDragStart) {
      onDragStart();
    } else if (!active && onDragEnd) {
      onDragEnd();
    }

    setDragState({
      isDragging: active,
      dragOffset: active ? { x: 0, y: 0 } : dragState.dragOffset,
      startPosition: pos
    });
  };

  return {
    dragState,
    dragHandlers: enhancedTouchHandlers,
    setDragActive: setDragActive
  };
}

export {
  useMobileTouch,
  useMobileScroll,
  usePullToRefresh,
  MobileTouchButton,
  MobileSwipeCard,
  useMobileDragDrop
};