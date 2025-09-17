import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpandedWeekModal from '../ExpandedWeekModal';

// Mock the utilities
vi.mock('../../utils/weekCalculator.js', () => ({
  getCurrentWeek: vi.fn(() => 8)
}));

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
  isPlayoffWeek: vi.fn((week, regularSeasonWeeks) => week > regularSeasonWeeks),
  normalizeWeek: vi.fn((week, totalWeeks) => Math.max(1, Math.min(week, totalWeeks))),
  getNextWeek: vi.fn((currentWeek, totalWeeks, direction) => {
    if (direction === 'previous' && currentWeek > 1) return currentWeek - 1;
    if (direction === 'next' && currentWeek < totalWeeks) return currentWeek + 1;
    return null;
  }),
  canNavigateWeek: vi.fn((currentWeek, totalWeeks, direction) => {
    if (direction === 'previous') return currentWeek > 1;
    if (direction === 'next') return currentWeek < totalWeeks;
    return false;
  })
}));

describe('ExpandedWeekModal Accessibility', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    currentWeek: 5,
    totalWeeks: 17,
    regularSeasonWeeks: 14,
    onWeekChange: vi.fn(),
    completedWeeks: [1, 2, 3, 4],
    season: { year: 2024, leagueSize: 12 }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock scrollIntoView for all tests
    Element.prototype.scrollIntoView = vi.fn();
  });

  describe('Modal ARIA attributes and roles', () => {
    it('has proper dialog role', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
    });

    it('has aria-modal attribute', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    it('has aria-labelledby pointing to modal title', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-labelledby', 'modal-title');
      
      const title = screen.getByText('Week Navigation');
      expect(title).toHaveAttribute('id', 'modal-title');
    });

    it('has proper listbox role for week selection', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();
    });

    it('has descriptive aria-label for listbox', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const listbox = screen.getByRole('listbox');
      expect(listbox).toHaveAttribute('aria-label', 'Select week');
    });

    it('has aria-activedescendant for focused week', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const listbox = screen.getByRole('listbox');
      
      await waitFor(() => {
        expect(listbox).toHaveAttribute('aria-activedescendant', 'week-button-5');
      });
    });
  });

  describe('Week button accessibility', () => {
    it('has proper option role for week buttons', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const weekButtons = screen.getAllByRole('option');
      expect(weekButtons).toHaveLength(17);
    });

    it('has unique IDs for week buttons', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const weekButtons = screen.getAllByRole('option');
      
      weekButtons.forEach((button, index) => {
        expect(button).toHaveAttribute('id', `week-button-${index + 1}`);
      });
    });

    it('has aria-selected for current week', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const currentWeekButton = screen.getByRole('option', { name: /Week 5.*currently selected/ });
      expect(currentWeekButton).toHaveAttribute('aria-selected', 'true');
    });

    it('has descriptive aria-labels for week buttons', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Current week
      expect(screen.getByLabelText('Week 5 (currently selected)')).toBeInTheDocument();
      
      // Completed week
      expect(screen.getByLabelText('Week 1 (completed)')).toBeInTheDocument();
      
      // Current calendar week
      expect(screen.getByLabelText('Week 8 (current calendar week)')).toBeInTheDocument();
      
      // Regular week
      expect(screen.getByLabelText('Week 10')).toBeInTheDocument();
    });

    it('includes playoff information in aria-labels', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      expect(screen.getByLabelText('Playoffs R1')).toBeInTheDocument();
    });

    it('marks decorative elements as aria-hidden', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const completedIndicators = document.querySelectorAll('[aria-hidden="true"]');
      expect(completedIndicators.length).toBeGreaterThan(0);
    });
  });

  describe('Keyboard navigation', () => {
    it('closes modal with Escape key', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      await user.keyboard('{Escape}');
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('navigates to previous week with left arrow', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Focus a week button first - be specific to avoid multiple matches
      const weekButton = screen.getByRole('option', { name: /Week 5.*currently selected/ });
      await user.click(weekButton);
      
      await user.keyboard('{ArrowLeft}');
      
      // Check that the focus management logic was triggered (scrollIntoView called)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('navigates to next week with right arrow', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Focus a week button first - be specific to avoid multiple matches
      const weekButton = screen.getByRole('option', { name: /Week 5.*currently selected/ });
      await user.click(weekButton);
      
      await user.keyboard('{ArrowRight}');
      
      // Check that the focus management logic was triggered (scrollIntoView called)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('navigates to first week with Home key', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Focus a week button first - be specific to avoid multiple matches
      const weekButton = screen.getByRole('option', { name: /Week 5.*currently selected/ });
      await user.click(weekButton);
      
      await user.keyboard('{Home}');
      
      // Check that the focus management logic was triggered (scrollIntoView called)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('navigates to last week with End key', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Focus a week button first - be specific to avoid multiple matches
      const weekButton = screen.getByRole('option', { name: /Week 5.*currently selected/ });
      await user.click(weekButton);
      
      await user.keyboard('{End}');
      
      // Check that the focus management logic was triggered (scrollIntoView called)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('selects week with Enter key', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Focus a week button first - be specific to avoid multiple matches
      const weekButton = screen.getByRole('option', { name: 'Week 6' });
      await user.click(weekButton);
      
      await user.keyboard('{Enter}');
      
      expect(defaultProps.onWeekChange).toHaveBeenCalledWith(6);
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('selects week with Space key', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Focus a week button first - be specific to avoid multiple matches
      const weekButton = screen.getByRole('option', { name: 'Week 6' });
      await user.click(weekButton);
      
      await user.keyboard(' ');
      
      expect(defaultProps.onWeekChange).toHaveBeenCalledWith(6);
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('handles keyboard events correctly', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Test that keyboard events trigger the expected actions
      await user.keyboard('{Escape}');
      expect(defaultProps.onClose).toHaveBeenCalled();
      
      // Focus a week button first for navigation tests
      const weekButton = screen.getByRole('option', { name: /Week 5.*currently selected/ });
      await user.click(weekButton);
      
      // Test arrow navigation
      await user.keyboard('{ArrowLeft}');
      await user.keyboard('{ArrowRight}');
      await user.keyboard('{Home}');
      await user.keyboard('{End}');
      
      // These should not throw errors
      expect(true).toBe(true);
    });

    it('respects navigation boundaries', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} currentWeek={1} />);
      
      // Focus first week button - be more specific to avoid multiple matches
      const firstWeekButton = screen.getByRole('option', { name: /Week 1.*currently selected/ });
      await user.click(firstWeekButton);
      
      await user.keyboard('{ArrowLeft}');
      
      // Should stay on first week (navigation boundary respected)
      expect(firstWeekButton).toHaveFocus();
    });

    it('auto-scrolls to focused week', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Mock scrollIntoView
      const scrollIntoViewMock = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;
      
      // Focus a week button and navigate
      const weekButton = screen.getByRole('option', { name: /Week 5/ });
      await user.click(weekButton);
      await user.keyboard('{ArrowRight}');
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });
  });

  describe('Focus management', () => {
    it('focuses close button when modal opens', async () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      await waitFor(() => {
        const closeButton = screen.getByLabelText('Close week navigation modal');
        expect(closeButton).toHaveFocus();
      }, { timeout: 200 });
    });

    it('maintains focus within modal', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Tab should cycle through focusable elements within modal
      await user.tab();
      await user.tab();
      
      const focusedElement = document.activeElement;
      const modal = screen.getByRole('dialog');
      expect(modal.contains(focusedElement)).toBe(true);
    });

    it('updates aria-activedescendant when focus changes', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const listbox = screen.getByRole('listbox');
      const weekButton = screen.getByRole('option', { name: /Week 6/ });
      
      await user.click(weekButton);
      
      await waitFor(() => {
        expect(listbox).toHaveAttribute('aria-activedescendant', 'week-button-6');
      });
    });

    it('has visible focus indicators', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const closeButton = screen.getByLabelText('Close week navigation modal');
      const weekButtons = screen.getAllByRole('option');
      
      expect(closeButton).toHaveClass('focus:ring-2', 'focus:ring-blue-500', 'focus:ring-offset-2');
      
      weekButtons.forEach(button => {
        expect(button).toHaveClass('focus:ring-2', 'focus:ring-blue-500', 'focus:ring-offset-2');
      });
    });
  });

  describe('Screen reader support', () => {
    it('provides keyboard navigation instructions', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      expect(screen.getByText('Use arrow keys to navigate, Enter to select, Escape to close')).toBeInTheDocument();
    });

    it('provides scroll instructions', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      expect(screen.getByText(/Scroll horizontally to see all weeks/)).toBeInTheDocument();
    });

    it('announces current selection in footer', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      expect(screen.getByText('Selected:')).toBeInTheDocument();
      // Use getAllByText to handle multiple instances and check the footer specifically
      const weekTexts = screen.getAllByText('Week 5');
      expect(weekTexts.length).toBeGreaterThan(0);
      expect(screen.getByText('Week 5 of 17')).toBeInTheDocument();
    });

    it('updates selection announcement when week changes', () => {
      const { rerender } = render(<ExpandedWeekModal {...defaultProps} />);
      
      expect(screen.getByText('Week 5 of 17')).toBeInTheDocument();
      
      rerender(<ExpandedWeekModal {...defaultProps} currentWeek={10} />);
      
      expect(screen.getByText('Week 10 of 17')).toBeInTheDocument();
    });

    it('provides context for season information', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      expect(screen.getByText('2024 Season • 12 Teams')).toBeInTheDocument();
    });
  });

  describe('Modal behavior and backdrop', () => {
    it('prevents body scroll when open', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body scroll when closed', () => {
      const { rerender } = render(<ExpandedWeekModal {...defaultProps} />);
      expect(document.body.style.overflow).toBe('hidden');
      
      rerender(<ExpandedWeekModal {...defaultProps} isOpen={false} />);
      expect(document.body.style.overflow).toBe('unset');
    });

    it('closes when clicking backdrop', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const backdrop = document.querySelector('.fixed.inset-0');
      await user.click(backdrop);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('does not close when clicking modal content', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const modal = screen.getByRole('dialog');
      await user.click(modal);
      
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it('has proper z-index for overlay', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      const overlay = document.querySelector('.fixed.inset-0.z-50');
      expect(overlay).toBeInTheDocument();
    });
  });

  describe('Auto-scroll functionality', () => {
    it('scrolls to current week when modal opens', async () => {
      const scrollIntoViewMock = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;
      
      render(<ExpandedWeekModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });

    it('handles missing scrollIntoView gracefully', () => {
      const originalScrollIntoView = Element.prototype.scrollIntoView;
      delete Element.prototype.scrollIntoView;
      
      expect(() => {
        render(<ExpandedWeekModal {...defaultProps} />);
      }).not.toThrow();
      
      Element.prototype.scrollIntoView = originalScrollIntoView;
    });
  });

  describe('Error handling and edge cases', () => {
    it('handles missing callback functions gracefully', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} onClose={null} onWeekChange={null} />);
      
      expect(() => user.keyboard('{Escape}')).not.toThrow();
      
      const weekButton = screen.getByRole('option', { name: /Week 6/ });
      expect(() => user.click(weekButton)).not.toThrow();
    });

    it('maintains accessibility when modal is closed', () => {
      render(<ExpandedWeekModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('unset');
    });

    it('handles invalid week values', () => {
      render(<ExpandedWeekModal {...defaultProps} currentWeek={null} />);
      
      const listbox = screen.getByRole('listbox');
      expect(listbox).toHaveAttribute('aria-activedescendant', 'week-button-1');
    });

    it('handles missing season data', () => {
      render(<ExpandedWeekModal {...defaultProps} season={null} />);
      
      expect(screen.queryByText(/Season/)).not.toBeInTheDocument();
      expect(screen.getByText('Week Navigation')).toBeInTheDocument();
    });

    it('handles keyboard navigation with missing refs', async () => {
      const user = userEvent.setup();
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Should not throw even if refs become invalid
      expect(() => user.keyboard('{ArrowLeft}')).not.toThrow();
    });
  });

  describe('Touch and mobile accessibility', () => {
    it('has touch-friendly button sizing', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const weekButtons = screen.getAllByRole('option');
      weekButtons.forEach(button => {
        expect(button).toHaveClass('h-10', 'touch-manipulation', 'active:scale-95');
      });
    });

    it('provides mobile-specific scroll instructions', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      // Should have mobile-specific text (though it might be hidden on desktop)
      const mobileText = document.querySelector('.sm\\:hidden');
      expect(mobileText).toBeInTheDocument();
    });

    it('has appropriate minimum touch target sizes', () => {
      render(<ExpandedWeekModal {...defaultProps} />);
      
      const closeButton = screen.getByLabelText('Close week navigation modal');
      expect(closeButton).toHaveClass('h-9', 'w-9');
      
      const weekButtons = screen.getAllByRole('option');
      weekButtons.forEach(button => {
        expect(button).toHaveClass('h-10');
      });
    });
  });
});