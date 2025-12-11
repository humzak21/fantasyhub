import React, { useState, useEffect } from 'react';
import { DarkModeToggle } from '@anatoliygatt/dark-mode-toggle';
import { motion } from 'motion/react';
import { useDarkMode } from '../hooks/useDarkMode.jsx';

const DarkModeToggleComponent = () => {
  const { theme, setTheme, getCurrentTheme } = useDarkMode();
  const [mode, setMode] = useState(() => getCurrentTheme());
  const [toggleVisible, setToggleVisible] = useState(false);

  // Update local mode state when theme changes
  useEffect(() => {
    setMode(getCurrentTheme());
  }, [theme, getCurrentTheme]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    
    // If the new mode matches system preference, set to auto
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const systemTheme = systemPrefersDark ? 'dark' : 'light';
    
    if (newMode === systemTheme && theme !== 'auto') {
      setTheme('auto');
    } else {
      setTheme(newMode);
    }
  };

  const handleBottomLeftHover = () => {
    setToggleVisible(true);
  };

  const handleBottomLeftLeave = () => {
    setToggleVisible(false);
  };

  return (
    <>
      {/* Bottom left hover area for dark mode toggle */}
      <div 
        className="dark-mode-toggle-trigger"
        onMouseEnter={handleBottomLeftHover}
        onMouseLeave={handleBottomLeftLeave}
      >
        <motion.div
          className="dark-mode-toggle-pill"
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ 
            opacity: toggleVisible ? 1 : 0,
            scale: toggleVisible ? 1 : 0.8,
            y: toggleVisible ? 0 : 10
          }}
          transition={{ 
            duration: 0.3,
            ease: [0.4, 0, 0.2, 1]
          }}
          style={{
            pointerEvents: toggleVisible ? 'auto' : 'none'
          }}
        >
          <div className="dark-mode-toggle-pill-wrapper">
            <DarkModeToggle
              mode={mode}
              dark="Dark"
              light="Light"
              size="sm"
              inactiveTrackColor="#e2e8f0"
              inactiveTrackColorOnHover="#f8fafc"
              inactiveTrackColorOnActive="#cbd5e1"
              activeTrackColor="#334155"
              activeTrackColorOnHover="#1e293b"
              activeTrackColorOnActive="#0f172a"
              inactiveThumbColor="#1e293b"
              activeThumbColor="#e2e8f0"
              onChange={handleModeChange}
            />
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default DarkModeToggleComponent;