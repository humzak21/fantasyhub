import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FloatingWeekNavigator from '../FloatingWeekNavigator';

// Mock the child components
vi.mock('../CompactWeekControl', () => ({
  default: ({ currentWeek, onWeekChange, onExpand, totalWeeks, regularSeasonWeeks }) => (
    <div data-testid="compact-week-control">
      <span data-testid="current-week">Week {currentWeek}</span>
      <button 
        data-testid="previous-week" 
        onClick={() => onWeekChange(currentWeek - 1)}
        disabled={currentWeek <= 1}
      >
        Previous
      </button>
      <button 
        data-testid="next-week" 
        onClick={() => onWeekChange(currentWeek + 1)}
        disabled={currentWeek >= totalWeeks}
      >
        Next
      </button>
      <button data-testid="expand-button" onClick={onExpand}>
        Expand
      </button>
    </div>
  )
}));

vi.mock('../ExpandedWeekModal', () => ({
  default: ({ isOpen, onClose, currentWeek, onWeekChange, totalWeeks }) => (
    isOpen ? (
      <div data-testid="expanded-week-modal">
        <span data-testid="modal-current-week">Week {currentWeek}</span>
        <button data-testid="close-modal" onClick={onClose}>
          Close
        </button>
        {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(week => (
          <button
            key={week}
            data-testid={`week-button-${week}`}
            onClick={() => onWeekChange(week)}
          >
            Week {week}
          </button>
        ))}
      </div>
    ) : null
  )
}));

describe('FloatingWeekNavigator', () => {
  const defaultProps = {
    currentWeek: 5,
    totalWeeks: 17,
    regularSeasonWeeks: 14,
    onWeekChange: vi.fn(),
    completedWeeks: [1, 2, 3, 4],
    season: {
      year: 2024,
      leagueSize: 12
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders the compact week control by default', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      expect(screen.getByTestId('compact-week-control')).toBeInTheDocument();
      expect(screen.getByTestId('current-week')).toHaveTextContent('Week 5');
      expect(screen.queryByTestId('expanded-week-modal')).not.toBeInTheDocument();
    });

    it('does not render when required props are missing', () => {
      const { container } = render(
        <FloatingWeekNavigator 
          currentWeek={null}
          totalWeeks={17}
          regularSeasonWeeks={14}
          onWeekChange={vi.fn()}
        />
      );
      
      expect(container.firstChild).toBeNull();
    });

    it('validates and corrects currentWeek when out of range', () => {
      render(
        <FloatingWeekNavigator 
          {...defaultProps}
          currentWeek={25} // Invalid - greater than totalWeeks
        />
      );
      
      expect(screen.getByTestId('current-week')).toHaveTextContent('Week 17');
    });

    it('validates and corrects currentWeek when below minimum', () => {
      render(
        <FloatingWeekNavigator 
          {...defaultProps}
          currentWeek={-1} // Invalid - less than 1
        />
      );
      
      expect(screen.getByTestId('current-week')).toHaveTextContent('Week 1');
    });
  });

  describe('State Management', () => {
    it('starts in compact mode (not expanded)', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      expect(screen.getByTestId('compact-week-control')).toBeInTheDocument();
      expect(screen.queryByTestId('expanded-week-modal')).not.toBeInTheDocument();
    });

    it('expands to modal when expand button is clicked', async () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const expandButton = screen.getByTestId('expand-button');
      fireEvent.click(expandButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('expanded-week-modal')).toBeInTheDocument();
      });
    });

    it('collapses back to compact when modal is closed', async () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      // Expand first
      fireEvent.click(screen.getByTestId('expand-button'));
      await waitFor(() => {
        expect(screen.getByTestId('expanded-week-modal')).toBeInTheDocument();
      });
      
      // Then collapse
      fireEvent.click(screen.getByTestId('close-modal'));
      await waitFor(() => {
        expect(screen.queryByTestId('expanded-week-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('Week Change Propagation', () => {
    it('propagates week changes from compact control', () => {
      const onWeekChange = vi.fn();
      render(<FloatingWeekNavigator {...defaultProps} onWeekChange={onWeekChange} />);
      
      fireEvent.click(screen.getByTestId('next-week'));
      
      expect(onWeekChange).toHaveBeenCalledWith(6);
    });

    it('propagates week changes from expanded modal', async () => {
      const onWeekChange = vi.fn();
      render(<FloatingWeekNavigator {...defaultProps} onWeekChange={onWeekChange} />);
      
      // Expand modal
      fireEvent.click(screen.getByTestId('expand-button'));
      await waitFor(() => {
        expect(screen.getByTestId('expanded-week-modal')).toBeInTheDocument();
      });
      
      // Click a week button
      fireEvent.click(screen.getByTestId('week-button-10'));
      
      expect(onWeekChange).toHaveBeenCalledWith(10);
    });

    it('handles missing onWeekChange callback gracefully', () => {
      render(<FloatingWeekNavigator {...defaultProps} onWeekChange={null} />);
      
      // Should not throw error when clicking navigation
      expect(() => {
        fireEvent.click(screen.getByTestId('next-week'));
      }).not.toThrow();
    });

    it('handles invalid onWeekChange callback gracefully', () => {
      render(<FloatingWeekNavigator {...defaultProps} onWeekChange="not-a-function" />);
      
      // Should not throw error when clicking navigation
      expect(() => {
        fireEvent.click(screen.getByTestId('next-week'));
      }).not.toThrow();
    });
  });

  describe('Component Integration', () => {
    it('passes all required props to CompactWeekControl', () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      const compactControl = screen.getByTestId('compact-week-control');
      expect(compactControl).toBeInTheDocument();
      
      // Verify the compact control shows correct current week
      expect(screen.getByTestId('current-week')).toHaveTextContent('Week 5');
    });

    it('passes all required props to ExpandedWeekModal when expanded', async () => {
      render(<FloatingWeekNavigator {...defaultProps} />);
      
      // Expand modal
      fireEvent.click(screen.getByTestId('expand-button'));
      
      await waitFor(() => {
        const modal = screen.getByTestId('expanded-week-modal');
        expect(modal).toBeInTheDocument();
        
        // Verify modal shows correct current week
        expect(screen.getByTestId('modal-current-week')).toHaveTextContent('Week 5');
        
        // Verify all week buttons are present
        for (let week = 1; week <= defaultProps.totalWeeks; week++) {
          expect(screen.getByTestId(`week-button-${week}`)).toBeInTheDocument();
        }
      });
    });

    it('maintains state consistency between compact and expanded modes', async () => {
      const onWeekChange = vi.fn();
      const { rerender } = render(<FloatingWeekNavigator {...defaultProps} onWeekChange={onWeekChange} />);
      
      // Change week in compact mode
      fireEvent.click(screen.getByTestId('next-week'));
      expect(onWeekChange).toHaveBeenCalledWith(6);
      
      // Simulate parent component updating currentWeek prop
      rerender(
        <FloatingWeekNavigator {...defaultProps} currentWeek={6} onWeekChange={onWeekChange} />
      );
      
      // Expand modal
      fireEvent.click(screen.getByTestId('expand-button'));
      
      await waitFor(() => {
        // Modal should show the updated week
        expect(screen.getByTestId('modal-current-week')).toHaveTextContent('Week 6');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles zero totalWeeks gracefully', () => {
      const { container } = render(
        <FloatingWeekNavigator 
          {...defaultProps}
          totalWeeks={0}
        />
      );
      
      expect(container.firstChild).toBeNull();
    });

    it('handles currentWeek equal to totalWeeks', () => {
      render(
        <FloatingWeekNavigator 
          {...defaultProps}
          currentWeek={17}
          totalWeeks={17}
        />
      );
      
      expect(screen.getByTestId('current-week')).toHaveTextContent('Week 17');
      expect(screen.getByTestId('next-week')).toBeDisabled();
    });

    it('handles currentWeek equal to 1', () => {
      render(
        <FloatingWeekNavigator 
          {...defaultProps}
          currentWeek={1}
        />
      );
      
      expect(screen.getByTestId('current-week')).toHaveTextContent('Week 1');
      expect(screen.getByTestId('previous-week')).toBeDisabled();
    });

    it('handles missing optional props', () => {
      render(
        <FloatingWeekNavigator 
          currentWeek={5}
          totalWeeks={17}
          regularSeasonWeeks={14}
          onWeekChange={vi.fn()}
        />
      );
      
      expect(screen.getByTestId('compact-week-control')).toBeInTheDocument();
    });
  });

  describe('Custom Props', () => {
    it('applies custom className', () => {
      render(
        <FloatingWeekNavigator 
          {...defaultProps}
          className="custom-class"
        />
      );
      
      // The className should be passed to CompactWeekControl
      expect(screen.getByTestId('compact-week-control')).toBeInTheDocument();
    });

    it('handles different position prop', () => {
      render(
        <FloatingWeekNavigator 
          {...defaultProps}
          position="top-left"
        />
      );
      
      expect(screen.getByTestId('compact-week-control')).toBeInTheDocument();
    });
  });
});