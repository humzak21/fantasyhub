import { createContext, useContext, useEffect, useState } from 'react';

const DarkModeContext = createContext();

export const useDarkMode = () => {
  const context = useContext(DarkModeContext);
  if (!context) {
    throw new Error('useDarkMode must be used within a DarkModeProvider');
  }
  return context;
};

export const DarkModeProvider = ({ children }) => {
  // DISABLED: Light mode is temporarily disabled. All users forced to dark mode.
  // To re-enable light mode, revert the changes in LIGHT_MODE_DISABLED.md
  const [isDarkMode, setIsDarkMode] = useState(true); // FORCED: Always true
  const [isAutoDetect, setIsAutoDetect] = useState(false); // DISABLED: Always false to prevent light mode
  const [isInitialized, setIsInitialized] = useState(false);

  // Device preference detection
  const getSystemPreference = () => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  // Initialize dark mode state
  useEffect(() => {
    const initializeDarkMode = () => {
      try {
        // DISABLED: Light mode preference logic removed. Always using dark mode.
        // Original logic preserved below for easy reversion:
        /* DISABLED_LIGHT_MODE_START
        // Check for stored preferences
        const storedDarkMode = localStorage.getItem('fantasyhub-dark-mode');
        const storedAutoDetect = localStorage.getItem('fantasyhub-auto-detect');

        // Parse stored values
        const hasStoredDarkMode = storedDarkMode !== null;
        const hasStoredAutoDetect = storedAutoDetect !== null;

        const parsedAutoDetect = hasStoredAutoDetect ? JSON.parse(storedAutoDetect) : true;

        // Set auto-detect state
        setIsAutoDetect(parsedAutoDetect);

        if (parsedAutoDetect) {
          // Use system preference when auto-detect is enabled
          const systemPreference = getSystemPreference();
          setIsDarkMode(systemPreference);

          // Apply theme class immediately
          if (systemPreference) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        } else if (hasStoredDarkMode) {
          // Use stored preference when auto-detect is disabled
          const parsedDarkMode = JSON.parse(storedDarkMode);
          setIsDarkMode(parsedDarkMode);

          // Apply theme class immediately
          if (parsedDarkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        } else {
          // Fallback to system preference if no stored preference
          const systemPreference = getSystemPreference();
          setIsDarkMode(systemPreference);

          // Apply theme class immediately
          if (systemPreference) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
        DISABLED_LIGHT_MODE_END */

        // FORCED: Always use dark mode
        setIsDarkMode(true);
        setIsAutoDetect(false);
        document.documentElement.classList.add('dark');

        setIsInitialized(true);
      } catch (error) {
        console.warn('Failed to initialize dark mode settings:', error);

        // FORCED: Always dark mode on error
        setIsDarkMode(true);
        setIsAutoDetect(false);
        document.documentElement.classList.add('dark');

        setIsInitialized(true);
      }
    };

    initializeDarkMode();
  }, []);

  // Listen for system theme changes when auto-detect is enabled
  useEffect(() => {
    if (!isAutoDetect || !isInitialized) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemThemeChange = (e) => {
      setIsDarkMode(e.matches);
    };

    // Add listener for system theme changes
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleSystemThemeChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      } else {
        // Fallback for older browsers
        mediaQuery.removeListener(handleSystemThemeChange);
      }
    };
  }, [isAutoDetect, isInitialized]);

  // Apply theme changes to document
  useEffect(() => {
    if (!isInitialized) return;

    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Store preference when not using auto-detect
    if (!isAutoDetect) {
      try {
        localStorage.setItem('fantasyhub-dark-mode', JSON.stringify(isDarkMode));
      } catch (error) {
        console.warn('Failed to save dark mode preference:', error);
      }
    }
  }, [isDarkMode, isAutoDetect, isInitialized]);

  // Store auto-detect preference
  useEffect(() => {
    if (!isInitialized) return;

    try {
      localStorage.setItem('fantasyhub-auto-detect', JSON.stringify(isAutoDetect));
    } catch (error) {
      console.warn('Failed to save auto-detect preference:', error);
    }
  }, [isAutoDetect, isInitialized]);

  // DISABLED: These functions are disabled because light mode is forcefully disabled
  // Toggle dark mode manually (disables auto-detect)
  const toggleDarkMode = () => {
    // DISABLED: Light mode toggle disabled. Always dark mode.
    // Original code:
    // setIsAutoDetect(false);
    // setIsDarkMode(prev => !prev);
  };

  // Set dark mode to specific value (disables auto-detect)
  const setDarkMode = (enabled) => {
    // DISABLED: Light mode setting disabled. Always dark mode.
    // Original code:
    // setIsAutoDetect(false);
    // setIsDarkMode(enabled);
  };

  // Enable auto-detect and sync with system preference
  const enableAutoDetect = () => {
    // DISABLED: Auto-detect disabled. Always dark mode.
    // Original code:
    // setIsAutoDetect(true);
    // const systemPreference = getSystemPreference();
    // setIsDarkMode(systemPreference);

    // Clear stored manual preference
    // try {
    //   localStorage.removeItem('fantasyhub-dark-mode');
    // } catch (error) {
    //   console.warn('Failed to clear dark mode preference:', error);
    // }
  };

  // Reset to system defaults
  const resetToDefaults = () => {
    try {
      localStorage.removeItem('fantasyhub-dark-mode');
      localStorage.removeItem('fantasyhub-auto-detect');
    } catch (error) {
      console.warn('Failed to clear dark mode preferences:', error);
    }

    setIsAutoDetect(true);
    const systemPreference = getSystemPreference();
    setIsDarkMode(systemPreference);
  };

  // Get current theme name for display
  const getThemeName = () => {
    // DISABLED: Light mode disabled. Always returns 'Dark'
    // Original code:
    // if (isAutoDetect) {
    //   return 'Auto (System)';
    // }
    // return isDarkMode ? 'Dark' : 'Light';

    return 'Dark';
  };

  const value = {
    // Current state
    isDarkMode,
    isAutoDetect,
    isInitialized,

    // Actions
    toggleDarkMode,
    setDarkMode,
    enableAutoDetect,
    resetToDefaults,

    // Utilities
    getThemeName,
    getSystemPreference: getSystemPreference(),

    // DISABLED: Theme options limited to dark mode only
    // Original options:
    // { value: 'auto', label: 'Auto (System)', description: 'Follow system theme' },
    // { value: 'light', label: 'Light', description: 'Always use light theme' },
    themeOptions: [
      { value: 'dark', label: 'Dark', description: 'Always use dark theme' }
    ]
  };

  return (
    <DarkModeContext.Provider value={value}>
      {children}
    </DarkModeContext.Provider>
  );
};

export default DarkModeProvider;