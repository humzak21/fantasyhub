import React from 'react';
import { Trophy } from 'lucide-react';

const StandingsDrawerTrigger = ({ onClick, isOpen }) => {
  return (
    <button
      onClick={onClick}
      className={`
        drawer-trigger
        fixed bottom-4 right-4 sm:bottom-6 sm:right-6 
        w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-lg
        bg-blue-600 hover:bg-blue-700 active:bg-blue-800
        text-white
        flex items-center justify-center
        z-50
        touch-manipulation
        safe-area-inset-bottom safe-area-inset-right
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${isOpen ? 'open' : ''}
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
        className="drawer-trigger-icon"
      />
    </button>
  );
};

export default StandingsDrawerTrigger;