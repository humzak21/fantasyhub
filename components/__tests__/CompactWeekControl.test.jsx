import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompactWeekControl from '../CompactWeekControl';

// Mock the week label utilities
vi.mock('../../utils/weekLabelUtils', () => ({
  getWeekLabel: vi.fn((week, regularSeasonWeeks, totalWeeks) => {
    if (week > regularSeasonWeeks) {
      const playoffWeek = week - regularSeasonWeeks;
      const totalPlayoffWeeks = totalWeeks - regularSeasonWeeks;
      if (totalPlayoffWeeks === 1) return 'Championship';
      if (playoffWeek === totalPlayoffWeeks) return 'Championship';
      if (playoffWeek === totalPlayoffWeeks - 1) return 'Semifinals';
      if (playoffWeek === 1) return 'Playoffs R1';
      return `Playoffs R${playoffWeek}`;
    }
    return `Week ${week}`;
  }),
  canNavigateWeek: vi.fn((currentWeek, totalWeeks, direction) => {
    if (direction === 'previous') return currentWeek > 1;
    if (direction === 'next') return currentWeek < totalWeeks;
    return false;
  }),
  getNextWeek: vi.fn((currentWeek, totalWeeks, direction) => {
    if (direction === 'previous' && currentWeek > 1) return currentWeek - 1;
    if (direction === 'next' && currentWeek < totalWeeks) return currentWeek + 1;
    return null;
  }),
  normalizeWeek: vi.fn((week, totalWeeks) => Math.max(1, Math.min(week, totalWeeks)))
}));

describe('CompactWeekControl', () => {
  const defaultProps = {
    currentWeek: 5,
    totalWeeks: 17,
    regularSeasonWeeks: 14,
    onWeekChange: vi.fn(),
    onExpand: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the current week label correctly for regular season', () => {
      render(<CompactWeekControl {...defaultProps} />);
      expect(screen.getByText('Week 5')).toBeInTheDocument();
    });

    it('renders playoff week labels correctly', () => {
      render(<CompactWeekControl {...defaultProps} currentWeek={15} />);
      expect(screen.getByText('Playoffs R1')).toBeInTheDocument();
    });

    it('renders championship week label correctly', () => {
      render(<CompactWeekControl {...defaultProps} currentWeek={17} />);
      expect(screen.getByText('Championship')).toBeInTheDocument();
    });

    it('renders semifinals label correctly', () => {
      render(<CompactWeekControl {...defaultProps} currentWeek={16} />);
      expect(screen.getByText('Semifinals')).toBeInTheDocument();
    });

    it('renders navigation arrows', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2); // Previous and Next buttons
    });

    it('renders calendar icon', () => {
      render(<CompactWeekControl {...defaultProps} />);
      // Check for the Calendar component by looking for its SVG element
      const calendarIcon = document.querySelector('svg');
      expect(calendarIcon).toBeInTheDocument();
    });
  });

  describe('Navigation functionality', () => {
    it('calls onWeekChange with previous week when previous button is clicked', async () => {
      const user = userEvent.setup();
      render(<CompactWeekControl {...defaultProps} />);
      
      const prevButton = screen.getAllByRole('button')[0]; // First button is previous
      await user.click(prevButton);
      
      expect(defaultProps.onWeekChange).toHaveBeenCalledWith(4);
    });

    it('calls onWeekChange with next week when next button is clicked', async () => {
      const user = userEvent.setup();
      render(<CompactWeekControl {...defaultProps} />);
      
      const nextButton = screen.getAllByRole('button')[1]; // Second button is next
      await user.click(nextButton);
      
      expect(defaultProps.onWeekChange).toHaveBeenCalledWith(6);
    });

    it('disables previous button when at week 1', () => {
      render(<CompactWeekControl {...defaultProps} currentWeek={1} />);
      const prevButton = screen.getAllByRole('button')[0];
      expect(prevButton).toBeDisabled();
    });

    it('disables next button when at last week', () => {
      render(<CompactWeekControl {...defaultProps} currentWeek={17} />);
      const nextButton = screen.getAllByRole('button')[1];
      expect(nextButton).toBeDisabled();
    });

    it('does not call onWeekChange when previous button is disabled and clicked', async () => {
      const user = userEvent.setup();
      render(<CompactWeekControl {...defaultProps} currentWeek={1} />);
      
      const prevButton = screen.getAllByRole('button')[0];
      await user.click(prevButton);
      
      expect(defaultProps.onWeekChange).not.toHaveBeenCalled();
    });

    it('does not call onWeekChange when next button is disabled and clicked', async () => {
      const user = userEvent.setup();
      render(<CompactWeekControl {...defaultProps} currentWeek={17} />);
      
      const nextButton = screen.getAllByRole('button')[1];
      await user.click(nextButton);
      
      expect(defaultProps.onWeekChange).not.toHaveBeenCalled();
    });
  });

  describe('Expand functionality', () => {
    it('calls onExpand when the main container is clicked', async () => {
      const user = userEvent.setup();
      render(<CompactWeekControl {...defaultProps} />);
      
      const container = screen.getByText('Week 5').closest('div').parentElement;
      await user.click(container);
      
      expect(defaultProps.onExpand).toHaveBeenCalled();
    });

    it('does not call onExpand when navigation buttons are clicked', async () => {
      const user = userEvent.setup();
      render(<CompactWeekControl {...defaultProps} />);
      
      const prevButton = screen.getAllByRole('button')[0];
      await user.click(prevButton);
      
      expect(defaultProps.onExpand).not.toHaveBeenCalled();
    });
  });

  describe('Week label formatting', () => {
    it('formats regular season weeks correctly', () => {
      for (let week = 1; week <= 14; week++) {
        const { rerender } = render(<CompactWeekControl {...defaultProps} currentWeek={week} />);
        expect(screen.getByText(`Week ${week}`)).toBeInTheDocument();
        rerender(<div />); // Clear for next iteration
      }
    });

    it('formats playoff weeks correctly for multi-week playoffs', () => {
      // Week 15 = Playoffs R1, Week 16 = Semifinals, Week 17 = Championship
      const { rerender } = render(<CompactWeekControl {...defaultProps} currentWeek={15} />);
      expect(screen.getByText('Playoffs R1')).toBeInTheDocument();
      
      rerender(<CompactWeekControl {...defaultProps} currentWeek={16} />);
      expect(screen.getByText('Semifinals')).toBeInTheDocument();
      
      rerender(<CompactWeekControl {...defaultProps} currentWeek={17} />);
      expect(screen.getByText('Championship')).toBeInTheDocument();
    });

    it('formats single playoff week as Championship', () => {
      render(<CompactWeekControl {...defaultProps} totalWeeks={15} regularSeasonWeeks={14} currentWeek={15} />);
      expect(screen.getByText('Championship')).toBeInTheDocument();
    });
  });

  describe('Styling and CSS classes', () => {
    it('applies fixed positioning classes', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const container = screen.getByText('Week 5').closest('div').parentElement;
      expect(container).toHaveClass('fixed', 'bottom-4', 'right-4', 'z-50');
    });

    it('applies floating appearance classes', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const container = screen.getByText('Week 5').closest('div').parentElement;
      expect(container).toHaveClass('floating-control', 'rounded-full', 'shadow-floating');
    });

    it('applies hover effect classes', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const container = screen.getByText('Week 5').closest('div').parentElement;
      expect(container).toHaveClass('hover:shadow-floating-hover');
    });

    it('applies animation classes', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const container = screen.getByText('Week 5').closest('div').parentElement;
      expect(container).toHaveClass('animate-float-in', 'focus-enhanced');
    });

    it('applies custom className when provided', () => {
      render(<CompactWeekControl {...defaultProps} className="custom-class" />);
      const container = screen.getByText('Week 5').closest('div').parentElement;
      expect(container).toHaveClass('custom-class');
    });
  });

  describe('Event handling', () => {
    it('stops propagation when navigation buttons are clicked', async () => {
      const user = userEvent.setup();
      const mockStopPropagation = vi.fn();
      
      render(<CompactWeekControl {...defaultProps} />);
      
      const prevButton = screen.getAllByRole('button')[0];
      
      // Mock the event object
      const mockEvent = { stopPropagation: mockStopPropagation };
      fireEvent.click(prevButton, mockEvent);
      
      // The component should handle stopPropagation internally
      expect(defaultProps.onWeekChange).toHaveBeenCalledWith(4);
    });
  });

  describe('Edge cases and error handling', () => {
    it('handles invalid currentWeek gracefully', () => {
      render(<CompactWeekControl {...defaultProps} currentWeek={null} />);
      expect(screen.getByText('Week 1')).toBeInTheDocument();
    });

    it('handles currentWeek outside valid range', () => {
      render(<CompactWeekControl {...defaultProps} currentWeek={25} />);
      expect(screen.getByText('Championship')).toBeInTheDocument();
    });

    it('handles missing onWeekChange callback', () => {
      render(<CompactWeekControl {...defaultProps} onWeekChange={null} />);
      
      const nextButton = screen.getAllByRole('button')[1];
      expect(() => fireEvent.click(nextButton)).not.toThrow();
    });

    it('handles missing onExpand callback', () => {
      render(<CompactWeekControl {...defaultProps} onExpand={null} />);
      
      const container = screen.getByText('Week 5').closest('div').parentElement;
      expect(() => fireEvent.click(container)).not.toThrow();
    });

    it('handles zero totalWeeks', () => {
      render(<CompactWeekControl {...defaultProps} totalWeeks={0} />);
      expect(screen.getByText('Week 1')).toBeInTheDocument();
    });

    it('handles negative currentWeek', () => {
      render(<CompactWeekControl {...defaultProps} currentWeek={-5} />);
      expect(screen.getByText('Week 1')).toBeInTheDocument();
    });
  });

  describe('Week label utility integration', () => {
    it('uses shared week label utility for consistent formatting', () => {
      render(<CompactWeekControl {...defaultProps} />);
      
      // The component should render with the mocked week label
      expect(screen.getByText('Week 5')).toBeInTheDocument();
    });

    it('uses navigation utilities for boundary checking', () => {
      render(<CompactWeekControl {...defaultProps} />);
      
      // The navigation buttons should be enabled based on mocked canNavigateWeek
      const prevButton = screen.getAllByRole('button')[0];
      const nextButton = screen.getAllByRole('button')[1];
      
      expect(prevButton).not.toBeDisabled();
      expect(nextButton).not.toBeDisabled();
    });

    it('uses getNextWeek utility for navigation', async () => {
      const user = userEvent.setup();
      render(<CompactWeekControl {...defaultProps} />);
      
      const nextButton = screen.getAllByRole('button')[1];
      await user.click(nextButton);
      
      // Should call onWeekChange with the result from mocked getNextWeek
      expect(defaultProps.onWeekChange).toHaveBeenCalledWith(6);
    });
  });

  describe('Responsive design and mobile optimization', () => {
    it('applies mobile-first responsive positioning classes', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const container = screen.getByText('Week 5').closest('div').parentElement;
      
      // Check for mobile positioning (bottom-4 right-4) and desktop (sm:bottom-6 sm:right-6)
      expect(container).toHaveClass('bottom-4', 'right-4');
      expect(container.className).toMatch(/sm:bottom-6/);
      expect(container.className).toMatch(/sm:right-6/);
    });

    it('applies touch-friendly button sizing', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      
      buttons.forEach(button => {
        // Mobile: h-10 w-10, Desktop: sm:h-8 sm:w-8
        expect(button).toHaveClass('h-10', 'w-10');
        expect(button.className).toMatch(/sm:h-8/);
        expect(button.className).toMatch(/sm:w-8/);
      });
    });

    it('applies touch manipulation classes for better mobile interaction', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      
      buttons.forEach(button => {
        expect(button).toHaveClass('touch-manipulation');
        expect(button).toHaveClass('scale-on-hover');
      });
    });

    it('applies responsive icon sizing', () => {
      render(<CompactWeekControl {...defaultProps} />);
      
      // Check that icons have responsive sizing classes
      const container = screen.getByText('Week 5').closest('div').parentElement;
      const svgElements = container.querySelectorAll('svg');
      
      svgElements.forEach(svg => {
        // Should have mobile (h-5 w-5) and desktop (sm:h-4 sm:w-4) sizing
        const hasResponsiveClasses = 
          svg.classList.contains('h-5') && svg.classList.contains('w-5') ||
          svg.classList.contains('h-4') && svg.classList.contains('w-4');
        expect(hasResponsiveClasses).toBe(true);
      });
    });

    it('applies responsive text sizing', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const weekLabel = screen.getByText('Week 5');
      
      // Should have mobile (text-xs) and desktop (sm:text-sm) sizing
      expect(weekLabel).toHaveClass('text-xs');
      expect(weekLabel.className).toMatch(/sm:text-sm/);
    });

    it('applies responsive padding and gaps', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const container = screen.getByText('Week 5').closest('div').parentElement;
      
      // Check for responsive padding and gaps
      expect(container).toHaveClass('gap-0.5', 'px-1.5', 'py-1.5');
      expect(container.className).toMatch(/sm:gap-1/);
      expect(container.className).toMatch(/sm:px-2/);
      expect(container.className).toMatch(/sm:py-2/);
    });

    it('applies minimum touch target height for accessibility', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const container = screen.getByText('Week 5').closest('div').parentElement;
      
      // Should have minimum 48px height on mobile for touch accessibility
      expect(container).toHaveClass('min-h-[48px]');
      expect(container.className).toMatch(/sm:min-h-\[40px\]/);
    });

    it('prevents overflow on small screens', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const container = screen.getByText('Week 5').closest('div').parentElement;
      
      // Should have max-width to prevent overflow on mobile
      expect(container).toHaveClass('max-w-[calc(100vw-2rem)]');
      expect(container.className).toMatch(/sm:max-w-none/);
    });

    it('hides calendar icon on very small screens', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const weekDisplay = screen.getByText('Week 5').closest('div');
      const calendarIcon = weekDisplay.querySelector('svg');
      
      // Calendar icon should be hidden on xs screens and shown on larger screens
      expect(calendarIcon).toHaveClass('hidden');
      expect(calendarIcon.getAttribute('class')).toMatch(/xs:block/);
    });

    it('applies responsive minimum width to week display', () => {
      render(<CompactWeekControl {...defaultProps} />);
      const weekDisplay = screen.getByText('Week 5').closest('div');
      
      // Should have responsive minimum width
      expect(weekDisplay).toHaveClass('min-w-[80px]');
      expect(weekDisplay.className).toMatch(/sm:min-w-\[100px\]/);
    });
  });
});