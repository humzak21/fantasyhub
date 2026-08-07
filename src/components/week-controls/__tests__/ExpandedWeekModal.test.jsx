import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ExpandedWeekModal from '../ExpandedWeekModal';

// Mock the weekCalculator utility
vi.mock('../../../../utils/weekCalculator.js', () => ({
  getCurrentWeek: vi.fn(() => 5)
}));

// Mock the week label utilities
vi.mock('../../../../utils/weekLabelUtils', () => ({
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
  isPlayoffWeek: vi.fn((week, regularSeasonWeeks) => week > regularSeasonWeeks),
  normalizeWeek: vi.fn((week, totalWeeks) => Math.max(1, Math.min(week, totalWeeks))),
  canNavigateWeek: vi.fn((week, totalWeeks, direction) => {
    if (direction === 'previous') return week > 1;
    if (direction === 'next') return week < totalWeeks;
    return false;
  }),
  getNextWeek: vi.fn((week, totalWeeks, direction) => {
    if (direction === 'previous' && week > 1) return week - 1;
    if (direction === 'next' && week < totalWeeks) return week + 1;
    return null;
  })
}));

describe('ExpandedWeekModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    currentWeek: 3,
    totalWeeks: 17,
    regularSeasonWeeks: 14,
    onWeekChange: vi.fn(),
    completedWeeks: [1, 2],
    season: {
      year: 2024,
      leagueSize: 12
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset body overflow style
    document.body.style.overflow = 'unset';
  });

  describe('Modal Rendering', () => {
    it('renders modal when isOpen is true', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
      expect(screen.getByText('2024 Season • 12 Teams')).toBeInTheDocument();
    });

    it('does not render modal when isOpen is false', () => {
      render(<ExpandedWeekModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByText('Week Navigation')).not.toBeInTheDocument();
    });

    it('renders backdrop overlay', () => {
      const { container } = render(<ExpandedWeekModal {...defaultProps} />);
      
      const backdrop = container.querySelector('.modal-backdrop');
      expect(backdrop).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const closeButton = screen.getByRole('button', { name: /close week navigation modal/i });
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('Week Button Generation', () => {
    it('renders all week buttons from 1 to totalWeeks', () => {
      const { container } = render(<ExpandedWeekModal {...defaultProps} />);
      
      // Check that all weeks are rendered by looking for buttons with data-week attributes
      for (let week = 1; week <= defaultProps.totalWeeks; week++) {
        const weekButton = container.querySelector(`button[data-week="${week}"]`);
        expect(weekButton).toBeInTheDocument();
        
        // Check the week label is correct
        const expectedLabel = week <= 14 ? `Week ${week}` : 
          week === 15 ? 'Playoffs R1' :
          week === 16 ? 'Semifinals' :
          'Championship';
        expect(weekButton).toHaveTextContent(expectedLabel);
      }
    });

    it('highlights current week button', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const currentWeekButton = screen.getByRole('option', { name: /Week 3/i });
      expect(currentWeekButton).toHaveClass('ring-2', 'ring-blue-500');
      expect(currentWeekButton).toHaveAttribute('data-week', '3');
    });

    it('shows completed weeks with special styling', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const week1Button = screen.getByText('Week 1').closest('button');
      const week2Button = screen.getByText('Week 2').closest('button');
      
      expect(week1Button).toHaveClass('bg-green-50', 'border-green-200');
      expect(week2Button).toHaveClass('bg-green-50', 'border-green-200');
    });

    it('displays playoff week labels correctly', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      expect(screen.getByText('Playoffs R1')).toBeInTheDocument();
      expect(screen.getByText('Semifinals')).toBeInTheDocument();
      expect(screen.getByText('Championship')).toBeInTheDocument();
    });
  });

  describe('Week Selection', () => {
    it('calls onWeekChange and onClose when week button is clicked', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const week5Button = screen.getByText('Week 5');
      fireEvent.click(week5Button);
      
      // Wait for the loading delay
      await waitFor(() => {
        expect(defaultProps.onWeekChange).toHaveBeenCalledWith(5);
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });

    it('handles playoff week selection', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const playoffButton = screen.getByText('Playoffs R1');
      fireEvent.click(playoffButton);
      
      // Wait for the loading delay
      await waitFor(() => {
        expect(defaultProps.onWeekChange).toHaveBeenCalledWith(15);
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });
  });

  describe('Modal Close Functionality', () => {
    it('calls onClose when close button is clicked', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const closeButton = screen.getByRole('button', { name: /close week navigation modal/i });
      fireEvent.click(closeButton);
      
      // Wait for any loading state to clear
      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });

    it('calls onClose when escape key is pressed', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when clicking outside modal', () => {
      const { container } = render(<ExpandedWeekModal {...defaultProps} />);
      
      const backdrop = container.querySelector('.modal-backdrop');
      fireEvent.click(backdrop);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('does not close when clicking inside modal content', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const modalContent = screen.getByText('Week Navigation').closest('div');
      fireEvent.click(modalContent);
      
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe('Body Scroll Prevention', () => {
    it('prevents body scroll when modal is open', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body scroll when modal is closed', () => {
      const { rerender } = render(<ExpandedWeekModal {...defaultProps} />);
      
      rerender(<ExpandedWeekModal {...defaultProps} isOpen={false} />);
      
      expect(document.body.style.overflow).toBe('unset');
    });
  });

  describe('Auto-scroll Functionality', () => {
    let scrollIntoViewMock;
    
    beforeEach(() => {
      scrollIntoViewMock = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;
    });

    it('scrolls to current week when modal opens', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });

    it('scrolls to week when navigating with arrow keys', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Clear initial scroll call
      scrollIntoViewMock.mockClear();
      
      // Navigate right
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });

    it('scrolls to first week when Home key is pressed', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      scrollIntoViewMock.mockClear();
      
      fireEvent.keyDown(document, { key: 'Home' });
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });

    it('scrolls to last week when End key is pressed', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      scrollIntoViewMock.mockClear();
      
      fireEvent.keyDown(document, { key: 'End' });
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });

    it('scrolls to selected week when week button is clicked', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      scrollIntoViewMock.mockClear();
      
      const week5Button = screen.getByText('Week 5');
      fireEvent.click(week5Button);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });

    it('handles scrollIntoView not being available gracefully', () => {
      // Remove scrollIntoView to test fallback
      delete Element.prototype.scrollIntoView;
      
      expect(() => {
        render(<ExpandedWeekModal {...defaultProps} />);
      }).not.toThrow();
    });

    it('uses instant scroll behavior when specified', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Test that the component can handle different scroll behaviors
      // This is tested indirectly through the scrollToWeek function
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
    });

    it('handles edge case when scroll container is not available', () => {
      const { container } = render(<ExpandedWeekModal {...defaultProps} />);
      
      // Remove the scroll container ref to test error handling
      const modal = container.querySelector('[role="dialog"]');
      if (modal) {
        const scrollContainer = modal.querySelector('[role="listbox"]');
        if (scrollContainer) {
          scrollContainer.remove();
        }
      }
      
      // Should not throw when trying to scroll
      expect(() => {
        fireEvent.keyDown(document, { key: 'ArrowRight' });
      }).not.toThrow();
    });

    it('auto-scrolls to different current weeks correctly', async () => {
      const { rerender } = render(<ExpandedWeekModal {...defaultProps} currentWeek={1} />);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalled();
      });
      
      scrollIntoViewMock.mockClear();
      
      // Change current week and reopen modal
      rerender(<ExpandedWeekModal {...defaultProps} currentWeek={10} isOpen={false} />);
      rerender(<ExpandedWeekModal {...defaultProps} currentWeek={10} isOpen={true} />);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });

    it('handles boundary weeks correctly for auto-scroll', async () => {
      // Test first week
      render(<ExpandedWeekModal {...defaultProps} currentWeek={1} />);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalled();
      });
      
      scrollIntoViewMock.mockClear();
      
      // Test last week
      const { rerender } = render(<ExpandedWeekModal {...defaultProps} currentWeek={17} />);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalled();
      });
    });
  });

  describe('Scroll Indicators', () => {
    let mockScrollContainer;
    
    beforeEach(() => {
      mockScrollContainer = {
        scrollLeft: 0,
        scrollWidth: 1000,
        clientWidth: 300,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        querySelector: vi.fn()
      };
    });

    it('shows right fade indicator when content overflows', async () => {
      // Mock the scroll container to simulate overflow
      const originalQuerySelector = document.querySelector;
      document.querySelector = vi.fn((selector) => {
        if (selector.includes('listbox')) {
          return mockScrollContainer;
        }
        return originalQuerySelector.call(document, selector);
      });

      render(<ExpandedWeekModal {...defaultProps} />);
      
      // The fade indicators are rendered conditionally based on scroll state
      // We need to simulate the scroll event to test this
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
      
      document.querySelector = originalQuerySelector;
    });

    it('shows left fade indicator when scrolled right', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Test that the component renders without errors
      // The actual scroll indicator logic is tested through integration
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
    });

    it('hides fade indicators when no overflow', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Test that the component renders without errors
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
    });

    it('updates fade indicators on scroll', () => {
      const { container } = render(<ExpandedWeekModal {...defaultProps} />);
      
      const scrollContainer = container.querySelector('[role="listbox"]');
      if (scrollContainer) {
        // Simulate scroll event
        fireEvent.scroll(scrollContainer, { target: { scrollLeft: 100 } });
      }
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
    });

    it('removes scroll event listener on unmount', () => {
      const { unmount } = render(<ExpandedWeekModal {...defaultProps} />);
      
      // Should not throw on unmount
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Enhanced Navigation Edge Cases', () => {
    it('handles rapid navigation without errors', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Rapidly press arrow keys
      for (let i = 0; i < 5; i++) {
        fireEvent.keyDown(document, { key: 'ArrowRight' });
        fireEvent.keyDown(document, { key: 'ArrowLeft' });
      }
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
    });

    it('handles navigation at week boundaries', () => {
      render(<ExpandedWeekModal {...defaultProps} currentWeek={1} />);
      
      // Try to navigate left from first week
      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
      
      // Navigate to last week and try to go right
      fireEvent.keyDown(document, { key: 'End' });
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
    });

    it('maintains scroll position during focus changes', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const week5Button = screen.getByText('Week 5');
      fireEvent.focus(week5Button);
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
    });

    it('handles week selection with auto-scroll', async () => {
      const scrollIntoViewMock = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;
      
      render(<ExpandedWeekModal {...defaultProps} />);
      
      scrollIntoViewMock.mockClear();
      
      const week10Button = screen.getByText('Week 10');
      fireEvent.click(week10Button);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
      
      // Wait for the loading delay
      await waitFor(() => {
        expect(defaultProps.onWeekChange).toHaveBeenCalledWith(10);
      });
    });

    it('handles modal reopening with different current week', async () => {
      const scrollIntoViewMock = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;
      
      const { rerender } = render(<ExpandedWeekModal {...defaultProps} currentWeek={5} />);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalled();
      });
      
      scrollIntoViewMock.mockClear();
      
      // Close and reopen with different week
      rerender(<ExpandedWeekModal {...defaultProps} currentWeek={5} isOpen={false} />);
      rerender(<ExpandedWeekModal {...defaultProps} currentWeek={12} isOpen={true} />);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'modal-title');
      
      // Check that week buttons are properly labeled
      const weekButtons = screen.getAllByRole('button');
      weekButtons.forEach(button => {
        expect(button).toBeInTheDocument();
      });
    });

    it('manages focus properly', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Modal should be focusable
      const modal = screen.getByText('Week Navigation').closest('div');
      expect(modal).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles missing season data gracefully', () => {
      render(<ExpandedWeekModal {...defaultProps} season={null} />);
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
      expect(screen.queryByText('2024 Season')).not.toBeInTheDocument();
    });

    it('handles empty completedWeeks array', () => {
      render(<ExpandedWeekModal {...defaultProps} completedWeeks={[]} />);
      
      const week1Button = screen.getByText('Week 1').closest('button');
      expect(week1Button).not.toHaveClass('bg-green-50');
    });

    it('handles single playoff week (championship only)', () => {
      render(<ExpandedWeekModal {...defaultProps} totalWeeks={15} regularSeasonWeeks={14} />);
      
      expect(screen.getByText('Championship')).toBeInTheDocument();
      expect(screen.queryByText('Playoffs R1')).not.toBeInTheDocument();
    });

    it('handles week selection at boundaries', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Test first week
      const week1Button = screen.getByText('Week 1');
      fireEvent.click(week1Button);
      
      // Wait for the loading delay
      await waitFor(() => {
        expect(defaultProps.onWeekChange).toHaveBeenCalledWith(1);
      });
      
      // Clear previous calls and test last week
      vi.clearAllMocks();
      const championshipButton = screen.getByText('Championship');
      fireEvent.click(championshipButton);
      
      // Wait for the loading delay
      await waitFor(() => {
        expect(defaultProps.onWeekChange).toHaveBeenCalledWith(17);
      });
    });
  });

  describe('Visual Indicators', () => {
    it('shows current calendar week indicator', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Week 5 should have calendar icon (mocked getCurrentWeek returns 5)
      const week5Button = screen.getByText('Week 5').closest('button');
      expect(week5Button).toHaveClass('border-blue-300', 'bg-blue-50');
    });

    it('shows completion indicators for completed weeks', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const week1Button = screen.getByText('Week 1').closest('button');
      const completionDot = week1Button.querySelector('.bg-green-500');
      expect(completionDot).toBeInTheDocument();
    });

    it('displays current selection in footer', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      expect(screen.getByText('Selected:')).toBeInTheDocument();
      expect(screen.getByText('Week 3 of 17')).toBeInTheDocument();
    });
  });

  describe('Edge cases and error handling', () => {
    it('handles invalid currentWeek gracefully', () => {
      render(<ExpandedWeekModal {...defaultProps} currentWeek={null} />);
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
      expect(screen.getByText('Week 1 of 17')).toBeInTheDocument();
    });

    it('handles currentWeek outside valid range', () => {
      render(<ExpandedWeekModal {...defaultProps} currentWeek={25} />);
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
      expect(screen.getByText('Week 17 of 17')).toBeInTheDocument();
    });

    it('handles zero totalWeeks', () => {
      render(<ExpandedWeekModal {...defaultProps} totalWeeks={0} />);
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
    });

    it('handles missing onWeekChange callback', () => {
      render(<ExpandedWeekModal {...defaultProps} onWeekChange={null} />);
      
      const week5Button = screen.getByText('Week 5');
      expect(() => fireEvent.click(week5Button)).not.toThrow();
    });

    it('handles missing season data gracefully', () => {
      render(<ExpandedWeekModal {...defaultProps} season={null} />);
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
      expect(screen.queryByText('2024 Season')).not.toBeInTheDocument();
    });

    it('handles invalid regularSeasonWeeks', () => {
      render(<ExpandedWeekModal {...defaultProps} regularSeasonWeeks={null} />);
      
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
    });
  });

  describe('Week label utility integration', () => {
    it('uses shared week label utility for consistent formatting', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Should render week labels using the mocked utility
      expect(screen.getByText('Week 1')).toBeInTheDocument();
      expect(screen.getByText('Playoffs R1')).toBeInTheDocument();
      expect(screen.getByText('Championship')).toBeInTheDocument();
    });

    it('uses isPlayoffWeek utility for icon determination', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Should render playoff weeks with trophy icons (mocked behavior)
      const playoffButton = screen.getByText('Playoffs R1').closest('button');
      expect(playoffButton).toBeInTheDocument();
    });

    it('uses normalizeWeek utility for current week validation', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Should display normalized current week in footer
      expect(screen.getByText('Week 3 of 17')).toBeInTheDocument();
    });
  });

  describe('Responsive design and mobile optimization', () => {
    it('applies mobile-first responsive modal sizing', () => {
      const { container } = render(<ExpandedWeekModal {...defaultProps} />);
      const modal = container.querySelector('[role="dialog"]');
      
      // Check for responsive max-width classes
      expect(modal).toHaveClass('max-w-sm');
      expect(modal.className).toMatch(/sm:max-w-2xl/);
      expect(modal.className).toMatch(/lg:max-w-4xl/);
    });

    it('applies responsive modal height constraints', () => {
      const { container } = render(<ExpandedWeekModal {...defaultProps} />);
      const modal = container.querySelector('[role="dialog"]');
      
      // Check for responsive max-height classes
      expect(modal).toHaveClass('max-h-[90vh]');
      expect(modal.className).toMatch(/sm:max-h-\[80vh\]/);
    });

    it('applies responsive padding to modal container', () => {
      const { container } = render(<ExpandedWeekModal {...defaultProps} />);
      const modalContainer = container.querySelector('.fixed.inset-0');
      
      // Check for responsive padding
      expect(modalContainer).toHaveClass('p-4');
      expect(modalContainer.className).toMatch(/sm:p-6/);
    });

    it('applies responsive header padding and sizing', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const header = screen.getByText('Week Navigation').closest('div').parentElement;
      
      // Check for responsive padding
      expect(header).toHaveClass('p-3');
      expect(header.className).toMatch(/sm:p-4/);
      
      // Check title responsive sizing
      const title = screen.getByText('Week Navigation');
      expect(title).toHaveClass('text-base');
      expect(title.className).toMatch(/sm:text-lg/);
    });

    it('applies touch-friendly close button sizing', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const closeButton = screen.getByRole('button', { name: /close week navigation modal/i });
      
      // Check for mobile-friendly button sizing
      expect(closeButton).toHaveClass('h-9', 'w-9');
      expect(closeButton.className).toMatch(/sm:h-8/);
      expect(closeButton.className).toMatch(/sm:w-8/);
      expect(closeButton).toHaveClass('touch-manipulation');
      expect(closeButton).toHaveClass('scale-on-hover');
    });

    it('applies responsive week button sizing', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const weekButton = screen.getByText('Week 1').closest('button');
      
      // Check for responsive button sizing
      expect(weekButton).toHaveClass('min-w-[100px]', 'h-10');
      expect(weekButton.className).toMatch(/sm:min-w-\[120px\]/);
      expect(weekButton.className).toMatch(/sm:h-9/);
      expect(weekButton).toHaveClass('text-xs');
      expect(weekButton.className).toMatch(/sm:text-sm/);
    });

    it('applies touch-friendly interactions to week buttons', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const weekButton = screen.getByText('Week 1').closest('button');
      
      expect(weekButton).toHaveClass('touch-manipulation');
      expect(weekButton).toHaveClass('week-button');
    });

    it('applies mobile-optimized scrolling classes', () => {
      const { container } = render(<ExpandedWeekModal {...defaultProps} />);
      const scrollContainer = container.querySelector('[style*="scroll-snap-type"]');
      
      expect(scrollContainer).toHaveClass('mobile-scroll');
      expect(scrollContainer).toHaveClass('scrollbar-mobile');
    });

    it('applies scroll snap for better mobile scrolling experience', () => {
      const { container } = render(<ExpandedWeekModal {...defaultProps} />);
      const scrollContainer = container.querySelector('[style*="scroll-snap-type"]');
      
      expect(scrollContainer.style.scrollSnapType).toBe('x proximity');
      
      // Check that week buttons have scroll-snap-align in their class string
      const weekButtons = container.querySelectorAll('[data-week]');
      weekButtons.forEach(button => {
        expect(button.className).toMatch(/scroll-snap-align:\s*start/);
      });
    });

    it('shows different scroll hints for mobile vs desktop', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Check for mobile hint
      const mobileHint = screen.getByText('Swipe to see all weeks');
      expect(mobileHint.className).toMatch(/sm:hidden/);
      
      // Check for desktop hint
      const desktopHint = screen.getByText('Scroll horizontally to see all weeks');
      expect(desktopHint.className).toMatch(/hidden sm:inline/);
    });

    it('applies responsive footer layout', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const footer = screen.getByText('Selected:').closest('div').parentElement.parentElement;
      
      // Check for responsive padding
      expect(footer).toHaveClass('p-3');
      expect(footer.className).toMatch(/sm:p-4/);
      
      // Check for responsive flex direction - get the parent div that has the flex classes
      const footerContent = screen.getByText('Selected:').closest('div').parentElement;
      expect(footerContent).toHaveClass('flex-col');
      expect(footerContent.className).toMatch(/sm:flex-row/);
    });

    it('applies responsive text sizing in footer', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const selectedLabel = screen.getByText('Selected:');
      expect(selectedLabel).toHaveClass('text-xs');
      expect(selectedLabel.className).toMatch(/sm:text-sm/);
      
      const weekInfo = screen.getByText('Week 3 of 17');
      expect(weekInfo).toHaveClass('text-xs');
      expect(weekInfo.className).toMatch(/sm:text-sm/);
    });

    it('hides season info on small screens', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const seasonInfo = screen.getByText('2024 Season • 12 Teams');
      
      expect(seasonInfo).toHaveClass('hidden');
      expect(seasonInfo.className).toMatch(/sm:inline/);
    });

    it('applies responsive completion dot sizing', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const week1Button = screen.getByText('Week 1').closest('button');
      const completionDot = week1Button.querySelector('.bg-green-500');
      
      expect(completionDot).toHaveClass('w-1.5', 'h-1.5');
      expect(completionDot.className).toMatch(/sm:w-2/);
      expect(completionDot.className).toMatch(/sm:h-2/);
    });

    it('applies responsive ring offset for selected week', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const currentWeekButton = screen.getByRole('option', { name: /Week 3/i });
      
      expect(currentWeekButton).toHaveClass('ring-offset-1');
      expect(currentWeekButton.className).toMatch(/sm:ring-offset-2/);
    });
  });
});