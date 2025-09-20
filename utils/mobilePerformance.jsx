import React, { lazy, Suspense } from 'react';

/**
 * Mobile Performance Optimization Utilities
 * Provides lazy loading, progressive enhancement, and performance optimizations for mobile devices
 */

/**
 * Mobile-aware lazy loading with improved loading states
 * @param {Function} importFn - Dynamic import function
 * @param {Object} options - Configuration options
 * @returns {Object} Lazy component with mobile-optimized loading
 */
export const mobileLazy = (importFn, options = {}) => {
  const {
    fallback = null,
    retryCount = 3,
    retryDelay = 1000,
    preload = false
  } = options;

  let retries = 0;
  let preloadPromise = null;

  const lazyImport = () => {
    return importFn().catch(error => {
      if (retries < retryCount) {
        retries++;
        return new Promise(resolve => {
          setTimeout(() => resolve(lazyImport()), retryDelay * retries);
        });
      }
      throw error;
    });
  };

  const LazyComponent = lazy(lazyImport);

  // Preload function for mobile optimization
  if (preload) {
    preloadPromise = lazyImport();
  }

  const MobileLazyWrapper = (props) => (
    <Suspense fallback={fallback}>
      <LazyComponent {...props} />
    </Suspense>
  );

  MobileLazyWrapper.preload = () => {
    if (!preloadPromise) {
      preloadPromise = lazyImport();
    }
    return preloadPromise;
  };

  return MobileLazyWrapper;
};

/**
 * Mobile-optimized intersection observer for lazy loading
 * @param {Object} options - Intersection observer options
 * @returns {Function} Hook for lazy loading elements
 */
export const useMobileIntersectionObserver = (options = {}) => {
  const {
    threshold = 0.1,
    rootMargin = '50px',
    triggerOnce = true
  } = options;

  const [isIntersecting, setIsIntersecting] = React.useState(false);
  const [element, setElement] = React.useState(null);

  React.useEffect(() => {
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsIntersecting(false);
        }
      },
      {
        threshold,
        rootMargin
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [element, threshold, rootMargin, triggerOnce]);

  return [setElement, isIntersecting];
};

/**
 * Progressive image loading with mobile optimization
 * @param {string} src - Image source URL
 * @param {string} placeholder - Placeholder image or data URL
 * @param {Object} options - Loading options
 * @returns {Object} Image loading state and props
 */
export const useProgressiveImage = (src, placeholder, options = {}) => {
  const {
    delay = 0,
    quality = 'auto',
    enableWebP = true
  } = options;

  const [imageSrc, setImageSrc] = React.useState(placeholder);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    if (!src) return;

    const timer = setTimeout(() => {
      const img = new Image();

      img.onload = () => {
        setImageSrc(src);
        setIsLoading(false);
        setHasError(false);
      };

      img.onerror = () => {
        setIsLoading(false);
        setHasError(true);
      };

      // Check for WebP support on mobile
      if (enableWebP && src.includes('.')) {
        const webpSrc = src.replace(/\.(jpg|jpeg|png)$/i, '.webp');
        img.src = webpSrc;

        img.onerror = () => {
          // Fallback to original format
          img.src = src;
        };
      } else {
        img.src = src;
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [src, delay, enableWebP]);

  return {
    src: imageSrc,
    isLoading,
    hasError,
    imageProps: {
      src: imageSrc,
      loading: 'lazy',
      decoding: 'async',
      style: {
        transition: 'opacity 0.3s ease-in-out',
        opacity: isLoading ? 0.7 : 1
      }
    }
  };
};

/**
 * Mobile-optimized debounced value hook
 * @param {any} value - Value to debounce
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {any} Debounced value
 */
export const useMobileDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Mobile performance monitoring hook
 * @returns {Object} Performance metrics and utilities
 */
export const useMobilePerformance = () => {
  const [metrics, setMetrics] = React.useState({
    loadTime: 0,
    renderTime: 0,
    memoryUsage: 0,
    connectionSpeed: 'unknown'
  });

  React.useEffect(() => {
    // Measure initial load time
    const loadTime = performance.now();

    // Check memory usage (if available)
    const memory = performance.memory || {};

    // Check connection speed
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const connectionSpeed = connection ? connection.effectiveType : 'unknown';

    // Measure render time
    const renderStart = performance.now();

    requestAnimationFrame(() => {
      const renderTime = performance.now() - renderStart;

      setMetrics({
        loadTime,
        renderTime,
        memoryUsage: memory.usedJSHeapSize || 0,
        connectionSpeed
      });
    });
  }, []);

  const logPerformance = React.useCallback((label, operation) => {
    const start = performance.now();

    return (...args) => {
      const result = operation(...args);
      const duration = performance.now() - start;

      console.log(`[Mobile Performance] ${label}: ${duration.toFixed(2)}ms`);

      return result;
    };
  }, []);

  return {
    metrics,
    logPerformance
  };
};

/**
 * Mobile-specific prefetch utilities
 */
export const mobilePrefetch = {
  /**
   * Prefetch route component for mobile
   * Uses predefined component map for Vite compatibility
   * @param {string} componentName - Component name to prefetch
   */
  route: (componentName) => {
    // Predefined component map for Vite static analysis
    const componentMap = {
      'MobileStatistics': () => import('../src/components/mobile/MobileStatistics.jsx'),
      'MobilePowerRankings': () => import('../src/components/mobile/MobilePowerRankings.jsx'),
      'MobileSchedule': () => import('../src/components/mobile/MobileSchedule.jsx'),
      'MobileTeamsAndRosters': () => import('../src/components/mobile/MobileTeamsAndRosters.jsx'),
      'MobileSeasonManager': () => import('../src/components/mobile/MobileSeasonManager.jsx'),
      'MobileGameDetailScreen': () => import('../src/components/mobile/MobileGameDetailScreen.jsx'),
      'MobileTeamDetailScreen': () => import('../src/components/mobile/MobileTeamDetailScreen.jsx'),
      'MobileStatisticsDetailScreen': () => import('../src/components/mobile/MobileStatisticsDetailScreen.jsx')
    };

    // Extract component name from path if a path was passed
    const componentKey = componentName.includes('/')
      ? componentName.split('/').pop().replace('.jsx', '')
      : componentName;

    const importFn = componentMap[componentKey];

    if (importFn && 'requestIdleCallback' in window) {
      requestIdleCallback(() => {
        importFn().catch(() => {
          // Silently handle prefetch failures
        });
      });
    }
  },

  /**
   * Prefetch image for mobile with connection awareness
   * @param {string} src - Image source URL
   * @param {Object} options - Prefetch options
   */
  image: (src, options = {}) => {
    const { priority = 'low', sizes = '' } = options;

    // Check connection before prefetching
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    if (connection && (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g')) {
      return; // Skip prefetch on slow connections
    }

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;
    link.crossOrigin = 'anonymous';

    if (sizes) {
      link.imageSizes = sizes;
    }

    if (priority === 'high') {
      link.fetchPriority = 'high';
    }

    document.head.appendChild(link);
  },

  /**
   * Prefetch data for mobile
   * @param {Function} dataFetcher - Function that returns a promise
   * @param {Object} options - Prefetch options
   */
  data: (dataFetcher, options = {}) => {
    const { cache = true, timeout = 5000 } = options;

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        Promise.race([
          dataFetcher(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Prefetch timeout')), timeout)
          )
        ]).catch(() => {
          // Silently handle prefetch failures
        });
      });
    }
  }
};

/**
 * Mobile-optimized loading state component
 */
export const MobileLoadingState = ({
  type = 'spinner',
  size = 'md',
  message = '',
  skeleton = false,
  className = ''
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  if (skeleton) {
    return (
      <div className={`animate-pulse space-y-4 ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center space-y-3 ${className}`}>
      {type === 'spinner' && (
        <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-primary ${sizeClasses[size]}`}></div>
      )}
      {type === 'dots' && (
        <div className="flex space-x-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`bg-primary rounded-full animate-pulse ${sizeClasses.sm}`}
              style={{
                animationDelay: `${i * 0.1}s`,
                animationDuration: '1s'
              }}
            ></div>
          ))}
        </div>
      )}
      {type === 'progress' && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
        </div>
      )}
      {message && (
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {message}
        </p>
      )}
    </div>
  );
};

/**
 * Mobile-optimized error boundary
 */
class MobileErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Mobile Error Boundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-red-600 text-2xl">⚠️</span>
          </div>
          <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
          <p className="text-muted-foreground text-sm mb-4 max-w-sm">
            We're sorry, but something went wrong. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export { MobileErrorBoundary };