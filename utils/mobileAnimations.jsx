import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Mobile Animation Performance Utilities
 * Provides hardware-accelerated animations optimized for mobile devices
 */

/**
 * Hook for hardware-accelerated animations
 * @param {Object} options - Animation options
 * @returns {Object} Animation utilities and state
 */
export const useMobileAnimation = (options = {}) => {
  const {
    duration = 300,
    easing = 'cubic-bezier(0.4, 0, 0.2, 1)',
    willChange = 'transform, opacity',
    reduceMotion = true
  } = options;

  const elementRef = useRef(null);
  const animationRef = useRef(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Check for reduced motion preference
  const prefersReducedMotion = reduceMotion &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const animate = useCallback((keyframes, animationOptions = {}) => {
    if (!elementRef.current) return Promise.resolve();

    // Skip animation if user prefers reduced motion
    if (prefersReducedMotion) {
      return Promise.resolve();
    }

    // Cancel any existing animation
    if (animationRef.current) {
      animationRef.current.cancel();
    }

    setIsAnimating(true);

    // Set will-change property for hardware acceleration
    if (elementRef.current && willChange) {
      elementRef.current.style.willChange = willChange;
    }

    // Create animation
    animationRef.current = elementRef.current.animate(keyframes, {
      duration,
      easing,
      fill: 'forwards',
      ...animationOptions
    });

    return animationRef.current.finished
      .then(() => {
        setIsAnimating(false);
        // Reset will-change to auto for better performance
        if (elementRef.current) {
          elementRef.current.style.willChange = 'auto';
        }
      })
      .catch(() => {
        setIsAnimating(false);
        if (elementRef.current) {
          elementRef.current.style.willChange = 'auto';
        }
      });
  }, [duration, easing, willChange, prefersReducedMotion]);

  const cancel = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.cancel();
      setIsAnimating(false);
      if (elementRef.current) {
        elementRef.current.style.willChange = 'auto';
      }
    }
  }, []);

  return {
    elementRef,
    animate,
    cancel,
    isAnimating,
    prefersReducedMotion
  };
};

/**
 * Hook for optimized scroll-triggered animations
 * @param {Object} options - Scroll animation options
 * @returns {Object} Scroll animation utilities
 */
export const useMobileScrollAnimation = (options = {}) => {
  const {
    threshold = 0.1,
    rootMargin = '0px',
    triggerOnce = true,
    animationDelay = 0
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const elementRef = useRef(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && (!triggerOnce || !hasAnimated)) {
          setTimeout(() => {
            setIsVisible(true);
            setHasAnimated(true);
          }, animationDelay);
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(elementRef.current);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce, animationDelay, hasAnimated]);

  return {
    elementRef,
    isVisible,
    hasAnimated
  };
};

/**
 * Mobile-optimized spring animation hook
 * @param {number} to - Target value
 * @param {Object} config - Spring configuration
 * @returns {number} Current animated value
 */
export const useMobileSpring = (to, config = {}) => {
  const {
    tension = 170,
    friction = 26,
    precision = 0.01
  } = config;

  const [value, setValue] = useState(to);
  const animationRef = useRef(null);
  const velocityRef = useRef(0);

  useEffect(() => {
    if (value === to) return;

    const animate = () => {
      const delta = to - value;
      const acceleration = delta * tension / 100;
      velocityRef.current += acceleration;
      velocityRef.current *= (1 - friction / 100);

      const newValue = value + velocityRef.current;
      setValue(newValue);

      if (Math.abs(delta) > precision || Math.abs(velocityRef.current) > precision) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setValue(to);
        velocityRef.current = 0;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [to, tension, friction, precision, value]);

  return value;
};

/**
 * Mobile-optimized page transition hook
 * @param {string} currentPage - Current page identifier
 * @param {Object} options - Transition options
 * @returns {Object} Transition state and utilities
 */
export const useMobilePageTransition = (currentPage, options = {}) => {
  const {
    duration = 300,
    direction = 'horizontal'
  } = options;

  const [transitionState, setTransitionState] = useState({
    isTransitioning: false,
    direction: null,
    previousPage: null
  });

  const previousPageRef = useRef(currentPage);

  useEffect(() => {
    if (previousPageRef.current !== currentPage) {
      setTransitionState({
        isTransitioning: true,
        direction,
        previousPage: previousPageRef.current
      });

      const timer = setTimeout(() => {
        setTransitionState(prev => ({
          ...prev,
          isTransitioning: false
        }));
        previousPageRef.current = currentPage;
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [currentPage, direction, duration]);

  return transitionState;
};

/**
 * Pre-built mobile animation components
 */

/**
 * Fade in animation component
 */
export const MobileFadeIn = ({
  children,
  delay = 0,
  duration = 300,
  className = '',
  ...props
}) => {
  const { elementRef, isVisible } = useMobileScrollAnimation({
    animationDelay: delay
  });

  return (
    <div
      ref={elementRef}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transition: `opacity ${duration}ms ease-out`,
        ...props.style
      }}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * Slide in animation component
 */
export const MobileSlideIn = ({
  children,
  direction = 'up',
  delay = 0,
  duration = 300,
  distance = 20,
  className = '',
  ...props
}) => {
  const { elementRef, isVisible } = useMobileScrollAnimation({
    animationDelay: delay
  });

  const getTransform = () => {
    if (isVisible) return 'translate3d(0, 0, 0)';

    switch (direction) {
      case 'up':
        return `translate3d(0, ${distance}px, 0)`;
      case 'down':
        return `translate3d(0, -${distance}px, 0)`;
      case 'left':
        return `translate3d(${distance}px, 0, 0)`;
      case 'right':
        return `translate3d(-${distance}px, 0, 0)`;
      default:
        return `translate3d(0, ${distance}px, 0)`;
    }
  };

  return (
    <div
      ref={elementRef}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: getTransform(),
        transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
        ...props.style
      }}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * Scale in animation component
 */
export const MobileScaleIn = ({
  children,
  delay = 0,
  duration = 300,
  from = 0.8,
  className = '',
  ...props
}) => {
  const { elementRef, isVisible } = useMobileScrollAnimation({
    animationDelay: delay
  });

  return (
    <div
      ref={elementRef}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `scale(${isVisible ? 1 : from})`,
        transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
        ...props.style
      }}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * Stagger animation container
 */
export const MobileStaggerContainer = ({
  children,
  staggerDelay = 50,
  className = '',
  ...props
}) => {
  return (
    <div className={className} {...props}>
      {React.Children.map(children, (child, index) => (
        <MobileFadeIn delay={index * staggerDelay}>
          {child}
        </MobileFadeIn>
      ))}
    </div>
  );
};

/**
 * Mobile-optimized loading skeleton with animation
 */
export const MobileSkeletonLoader = ({
  width = '100%',
  height = '20px',
  className = '',
  animated = true,
  ...props
}) => {
  return (
    <div
      className={`bg-gray-200 rounded ${animated ? 'animate-pulse' : ''} ${className}`}
      style={{
        width,
        height,
        ...props.style
      }}
      {...props}
    />
  );
};

/**
 * Mobile card flip animation
 */
export const MobileFlipCard = ({
  front,
  back,
  isFlipped = false,
  duration = 300,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`relative ${className}`}
      style={{
        perspective: '1000px',
        ...props.style
      }}
      {...props}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transform: `rotateY(${isFlipped ? 180 : 0}deg)`,
          transition: `transform ${duration}ms ease-in-out`
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            transform: 'rotateY(0deg)'
          }}
        >
          {front}
        </div>
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)'
          }}
        >
          {back}
        </div>
      </div>
    </div>
  );
};

/**
 * Mobile parallax effect hook
 * @param {number} speed - Parallax speed multiplier
 * @returns {Object} Parallax transform value
 */
export const useMobileParallax = (speed = 0.5) => {
  const [offset, setOffset] = useState(0);
  const elementRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!elementRef.current) return;

      const rect = elementRef.current.getBoundingClientRect();
      const scrolled = window.pageYOffset;
      const parallax = scrolled * speed;

      setOffset(parallax);
    };

    // Use passive event listener for better performance
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [speed]);

  return {
    elementRef,
    transform: `translate3d(0, ${offset}px, 0)`
  };
};

/**
 * Performance-optimized animation utilities
 */
export const mobileAnimationUtils = {
  /**
   * Create a hardware-accelerated animation
   */
  createOptimizedAnimation: (element, keyframes, options = {}) => {
    if (!element) return null;

    // Set up hardware acceleration
    element.style.willChange = 'transform, opacity';
    element.style.backfaceVisibility = 'hidden';
    element.style.perspective = '1000px';

    const animation = element.animate(keyframes, {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
      ...options
    });

    // Clean up after animation
    animation.addEventListener('finish', () => {
      element.style.willChange = 'auto';
    });

    return animation;
  },

  /**
   * Batch DOM updates for better performance
   */
  batchUpdate: (callback) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(callback);
    });
  },

  /**
   * Debounced animation trigger
   */
  debouncedAnimate: (callback, delay = 16) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => callback(...args), delay);
    };
  },

  /**
   * Check if device supports hardware acceleration
   */
  supportsHardwareAcceleration: () => {
    const testElement = document.createElement('div');
    testElement.style.transform = 'translateZ(0)';
    const supportsTransform3d = testElement.style.transform !== '';

    return supportsTransform3d && 'requestAnimationFrame' in window;
  }
};