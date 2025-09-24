import React from 'react';
import { Trophy } from 'lucide-react';
import { useDarkMode } from '../../contexts/DarkModeContext';

const StandingsDrawerTrigger = ({ onClick, isOpen }) => {
  const { isDarkMode } = useDarkMode();

  return (
    <button
      onClick={onClick}
      className={`
        drawer-trigger
        fixed bottom-4 right-4 sm:bottom-6 sm:right-6
        w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-lg
        hover:opacity-90 active:opacity-80
        text-white
        flex items-center justify-center
        z-[70]
        touch-manipulation
        safe-area-inset-bottom safe-area-inset-right
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        dark:focus:ring-blue-400 dark:focus:ring-offset-gray-900
        ${isOpen ? 'open' : ''}
        ${isDarkMode ? 'standings-button-dark' : 'standings-button-light'}
      `}
      style={{
        minHeight: '56px',
        minWidth: '56px',
        // Ensure button stays above mobile keyboards and navigation
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        right: 'max(16px, env(safe-area-inset-right))'
      }}
      aria-label={isOpen ? "Close standings" : "Open standings"}
      title={isOpen ? "Close standings" : "View standings"}
    >
      <Trophy
        size={24}
        className={`drawer-trigger-icon ${isDarkMode ? 'text-black' : 'text-white'}`}
        style={{
          color: isDarkMode ? 'black' : 'white'
        }}
      />
    </button>
  );
};

export default StandingsDrawerTrigger;