import React from 'react';

/**
 * Mobile browser detection utility
 * Detects mobile browsers and provides mobile-specific functionality
 */

/**
 * Detects if the current device is a mobile device
 * @returns {boolean} True if mobile device, false otherwise
 */
export const isMobileDevice = () => {
  // Check for touch support
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Check user agent for mobile patterns
  const userAgent = navigator.userAgent.toLowerCase();
  const mobilePatterns = [
    /android/i,
    /webos/i,
    /iphone/i,
    /ipad/i,
    /ipod/i,
    /blackberry/i,
    /windows phone/i,
    /mobile/i
  ];
  
  const isMobileUserAgent = mobilePatterns.some(pattern => pattern.test(userAgent));
  
  // Check screen size (mobile-first breakpoint)
  const isSmallScreen = window.innerWidth <= 768;
  
  // Combine checks - prioritize user agent and touch support
  return isMobileUserAgent || (hasTouch && isSmallScreen);
};

/**
 * Gets detailed mobile device information
 * @returns {Object} Device information object
 */
export const getMobileDeviceInfo = () => {
  const userAgent = navigator.userAgent;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  return {
    isMobile: isMobileDevice(),
    isTouch,
    userAgent,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
    platform: navigator.platform,
    isIOS: /iPad|iPhone|iPod/.test(userAgent),
    isAndroid: /Android/.test(userAgent),
    isSafari: /Safari/.test(userAgent) && !/Chrome/.test(userAgent),
    isChrome: /Chrome/.test(userAgent),
    isFirefox: /Firefox/.test(userAgent)
  };
};

/**
 * Hook for reactive mobile detection
 * @returns {Object} Mobile state and device info
 */
export const useMobileDetection = () => {
  const [mobileState, setMobileState] = React.useState(() => ({
    isMobile: isMobileDevice(),
    deviceInfo: getMobileDeviceInfo()
  }));

  React.useEffect(() => {
    const handleResize = () => {
      const newIsMobile = isMobileDevice();
      const newDeviceInfo = getMobileDeviceInfo();
      
      setMobileState(prev => {
        if (prev.isMobile !== newIsMobile || 
            prev.deviceInfo.orientation !== newDeviceInfo.orientation) {
          return {
            isMobile: newIsMobile,
            deviceInfo: newDeviceInfo
          };
        }
        return prev;
      });
    };

    const handleOrientationChange = () => {
      // Delay to allow for orientation change to complete
      setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return mobileState;
};

/**
 * Viewport configuration for mobile optimization
 */
export const setMobileViewport = () => {
  // Set viewport meta tag for mobile optimization
  let viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) {
    viewport = document.createElement('meta');
    viewport.name = 'viewport';
    document.head.appendChild(viewport);
  }
  
  viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
  
  // Add mobile-specific meta tags
  const mobileMetaTags = [
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
    { name: 'theme-color', content: '#ffffff' }
  ];
  
  mobileMetaTags.forEach(tag => {
    let existingTag = document.querySelector(`meta[name="${tag.name}"]`);
    if (!existingTag) {
      existingTag = document.createElement('meta');
      existingTag.name = tag.name;
      existingTag.content = tag.content;
      document.head.appendChild(existingTag);
    }
  });
};

/**
 * Mobile-specific CSS class utilities
 */
export const getMobileClasses = (deviceInfo) => {
  const classes = ['mobile-optimized'];
  
  if (deviceInfo.isIOS) classes.push('ios-device');
  if (deviceInfo.isAndroid) classes.push('android-device');
  if (deviceInfo.isTouch) classes.push('touch-device');
  if (deviceInfo.orientation === 'landscape') classes.push('landscape-mode');
  if (deviceInfo.orientation === 'portrait') classes.push('portrait-mode');
  
  return classes.join(' ');
};