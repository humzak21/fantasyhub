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
