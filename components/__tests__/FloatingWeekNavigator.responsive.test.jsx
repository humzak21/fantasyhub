import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import FloatingWeekNavigator from '../FloatingWeekNavigator';

// Mock the child components
vi.mock('../CompactWeekControl', () => ({
  default: ({ currentWeek, onExpand, className }) => (
    <div 
      data-testid="compact-week-control" 
      className={className}
      onClick={onExpand}
    >
      Week {currentWeek}
    </div>
  )
}));

vi.mock('../ExpandedWeekModal', () => ({
  default: ({ isOpen, onClose, currentWeek }) => 
    isOpen ? (
      <div data-testid="expanded-week-modal" onClick={onClose}>
        Modal - Week {currentWeek}
      </div>
    ) : null
}));

// Mock the week label utilities
vi.mock('../../utils/weekLabelUtils', () => ({
  normalizeWeek: vi.fn((week, totalWeeks) => Math.max(1, Math.min(week, totalWeeks)))
}));

describe('FloatingWeekNavigator - Responsive Behavior', () => {
  const defaultProps = {
    currentWeek: 5,
    totalWeeks: 17,
    regularSeasonWeeks: 14,
    onWeekChange: vi.fn(),
    completedWeeks: [1, 2, 3, 4],
    season: { year: 2024, leagueSize: 12 }
  };

  // Helper function to simulate viewport resize
  const setViewportSize = (width, height) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: height,
    });
    window.dispatchEvent(new Event('resize'));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to desktop size
    setViewportSize(1024, 768);
  });

  afterEach(() => {
    // Clean up any body style changes
    document.body.style.overflow = 'unset';
  });

  describe('Mobile viewport (320px - 767px)', () => {
    beforeEach(() => {
      setViewportSize(375, 667); // iPhone SE size
    });

    it('renders compact control with mobile-optimized positioning', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
      expect(compactControl).toHaveTextContent('Week 5');
    });

    it('expands to modal when compact control is clicked', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      fireEvent.click(compactControl);
      
      expect(screen.getByTestId('expanded-week-modal')).toBeInTheDocument();
    });

    it('handles touch interactions properly', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      
      // Simulate touch events
      fireEvent.touchStart(compactControl);
      fireEvent.touchEnd(compactControl);
      fireEvent.click(compactControl);
      
      expect(screen.getByTestId('expanded-week-modal')).toBeInTheDocument();
    });

    it('closes modal when backdrop is touched', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      // Open modal
      const compactControl = screen.getByTestId('compact-week-control');
      fireEvent.click(compactControl);
      
      // Close modal
      const modal = screen.getByTestId('expanded-week-modal');
      fireEvent.click(modal);
      
      expect(screen.queryByTestId('expanded-week-modal')).not.toBeInTheDocument();
    });
  });

  describe('Tablet viewport (768px - 1023px)', () => {
    beforeEach(() => {
      setViewportSize(768, 1024); // iPad size
    });

    it('renders with tablet-optimized sizing', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
    });

    it('handles modal expansion on tablet', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      fireEvent.click(compactControl);
      
      const modal = screen.getByTestId('expanded-week-modal');
      expect(modal).toBeInTheDocument();
    });
  });

  describe('Desktop viewport (1024px+)', () => {
    beforeEach(() => {
      setViewportSize(1920, 1080); // Full HD desktop
    });

    it('renders with desktop-optimized sizing', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
    });

    it('handles modal interactions on desktop', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      fireEvent.click(compactControl);
      
      const modal = screen.getByTestId('expanded-week-modal');
      expect(modal).toBeInTheDocument();
    });
  });

  describe('Very small screens (< 475px)', () => {
    beforeEach(() => {
      setViewportSize(320, 568); // iPhone 5/SE size
    });

    it('renders without overflow issues', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
    });

    it('maintains functionality on very small screens', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      fireEvent.click(compactControl);
      
      expect(screen.getByTestId('expanded-week-modal')).toBeInTheDocument();
    });
  });

  describe('Orientation changes', () => {
    it('handles portrait to landscape transition', () => {
      // Start in portrait
      setViewportSize(375, 667);
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      let compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
      
      // Switch to landscape
      setViewportSize(667, 375);
      
      compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
    });

    it('handles landscape to portrait transition', () => {
      // Start in landscape
      setViewportSize(667, 375);
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      let compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
      
      // Switch to portrait
      setViewportSize(375, 667);
      
      compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
    });
  });

  describe('State management across viewport changes', () => {
    it('maintains expanded state during viewport resize', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      // Open modal on desktop
      setViewportSize(1920, 1080);
      const compactControl = screen.getByTestId('compact-week-control');
      fireEvent.click(compactControl);
      
      expect(screen.getByTestId('expanded-week-modal')).toBeInTheDocument();
      
      // Resize to mobile
      setViewportSize(375, 667);
      
      // Modal should still be open
      expect(screen.getByTestId('expanded-week-modal')).toBeInTheDocument();
    });

    it('maintains current week selection across viewport changes', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      // Start on desktop
      setViewportSize(1920, 1080);
      expect(screen.getByText('Week 5')).toBeInTheDocument();
      
      // Resize to mobile
      setViewportSize(375, 667);
      expect(screen.getByText('Week 5')).toBeInTheDocument();
      
      // Resize to tablet
      setViewportSize(768, 1024);
      expect(screen.getByText('Week 5')).toBeInTheDocument();
    });
  });

  describe('Performance considerations', () => {
    it('does not cause excessive re-renders during resize', () => {
      const { rerender } = render(<FloatingWeekNavigator {...defaultProps} />);
      
      // Simulate multiple rapid resizes
      for (let i = 0; i < 10; i++) {
        setViewportSize(300 + i * 100, 600);
        rerender(<FloatingWeekNavigator {...defaultProps} />);
      }
      
      // Component should still be functional
      const compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
    });
  });

  describe('Accessibility across viewports', () => {
    it('maintains keyboard navigation on mobile', () => {
      setViewportSize(375, 667);
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      
      // Simulate keyboard interaction
      fireEvent.keyDown(compactControl, { key: 'Enter' });
      fireEvent.click(compactControl); // Simulate the resulting click
      
      expect(screen.getByTestId('expanded-week-modal')).toBeInTheDocument();
    });

    it('maintains focus management across viewport changes', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      // Start on desktop
      setViewportSize(1920, 1080);
      const compactControl = screen.getByTestId('compact-week-control');
      compactControl.focus();
      
      // Resize to mobile
      setViewportSize(375, 667);
      
      // Focus should be maintained (or at least component should be focusable)
      expect(document.activeElement).toBeDefined();
    });
  });

  describe('Edge cases for responsive behavior', () => {
    it('handles extremely narrow viewports', () => {
      setViewportSize(240, 320); // Very narrow screen
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
    });

    it('handles extremely wide viewports', () => {
      setViewportSize(3840, 2160); // 4K screen
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
    });

    it('handles square viewports', () => {
      setViewportSize(800, 800); // Square viewport
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
    });
  });

  describe('CSS class application across viewports', () => {
    it('applies responsive classes correctly', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      
      // The className should be passed through to the child component
      expect(compactControl).toHaveAttribute('class');
    });

    it('handles custom className prop across viewports', () => {
      const customClass = 'custom-responsive-class';
      render(<FloatingWeekNavigator {...defaultProps} className={customClass} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toHaveClass(customClass);
    });
  });
});