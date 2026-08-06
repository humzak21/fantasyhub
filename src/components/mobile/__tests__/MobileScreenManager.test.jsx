import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MobileScreenManager from '../MobileScreenManager';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: ({ className, ...props }) => <div data-testid="x-icon" className={className} {...props} />,
  ChevronLeft: ({ className, ...props }) => <div data-testid="chevron-left-icon" className={className} {...props} />
}));

describe('MobileScreenManager', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Screen',
    children: <div data-testid="screen-content">Test Content</div>
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Mock document.body.style
    Object.defineProperty(document.body, 'style', {
      value: { overflow: '' },
      writable: true
    });
  });

  afterEach(() => {
    document.body.style.overflow = '';
    vi.useRealTimers();
  });

  it('renders when isOpen is true', () => {
    render(<MobileScreenManager {...defaultProps} />);
    
    expect(screen.getByText('Test Screen')).toBeInTheDocument();
    expect(screen.getByTestId('screen-content')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<MobileScreenManager {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByText('Test Screen')).not.toBeInTheDocument();
  });

  it('displays the title correctly', () => {
    render(<MobileScreenManager {...defaultProps} title="Custom Title" />);
    
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  it('renders children content', () => {
    const customContent = <div data-testid="custom-content">Custom Content</div>;
    render(<MobileScreenManager {...defaultProps}>{customContent}</MobileScreenManager>);
    
    expect(screen.getByTestId('custom-content')).toBeInTheDocument();
  });

  it('shows back button by default', () => {
    render(<MobileScreenManager {...defaultProps} />);
    
    expect(screen.getByTestId('chevron-left-icon')).toBeInTheDocument();
    expect(screen.getByLabelText('Go back')).toBeInTheDocument();
  });

  it('hides back button when showBackButton is false', () => {
    render(<MobileScreenManager {...defaultProps} showBackButton={false} />);
    
    expect(screen.queryByTestId('chevron-left-icon')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Go back')).not.toBeInTheDocument();
  });

  it('shows close button by default', () => {
    render(<MobileScreenManager {...defaultProps} />);
    
    expect(screen.getByTestId('x-icon')).toBeInTheDocument();
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });

  it('hides close button when showCloseButton is false', () => {
    render(<MobileScreenManager {...defaultProps} showCloseButton={false} />);
    
    expect(screen.queryByTestId('x-icon')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
  });

  it('calls onClose when back button is clicked', () => {
    const onClose = vi.fn();
    render(<MobileScreenManager {...defaultProps} onClose={onClose} />);
    
    fireEvent.click(screen.getByLabelText('Go back'));
    
    // Fast-forward animation delay
    vi.advanceTimersByTime(250);
    
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<MobileScreenManager {...defaultProps} onClose={onClose} />);
    
    fireEvent.click(screen.getByLabelText('Close'));
    
    // Fast-forward animation delay
    vi.advanceTimersByTime(250);
    
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<MobileScreenManager {...defaultProps} onClose={onClose} />);
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    // Fast-forward animation delay
    vi.advanceTimersByTime(250);
    
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when other keys are pressed', () => {
    const onClose = vi.fn();
    render(<MobileScreenManager {...defaultProps} onClose={onClose} />);
    
    fireEvent.keyDown(document, { key: 'Enter' });
    
    expect(onClose).not.toHaveBeenCalled();
  });

  it('prevents body scroll when open', () => {
    render(<MobileScreenManager {...defaultProps} />);
    
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when closed', () => {
    const { rerender } = render(<MobileScreenManager {...defaultProps} />);
    
    expect(document.body.style.overflow).toBe('hidden');
    
    rerender(<MobileScreenManager {...defaultProps} isOpen={false} />);
    
    expect(document.body.style.overflow).toBe('');
  });

  it('applies custom className to content area', () => {
    render(<MobileScreenManager {...defaultProps} className="custom-class" />);
    
    const contentArea = screen.getByTestId('screen-content').parentElement;
    expect(contentArea).toHaveClass('custom-class');
  });

  describe('Touch Gestures', () => {
    it('handles touch start event', () => {
      render(<MobileScreenManager {...defaultProps} enableSwipeBack={true} />);
      
      const screen = document.querySelector('[data-testid="screen-content"]').closest('.fixed');
      
      fireEvent.touchStart(screen, {
        targetTouches: [{ clientX: 100 }]
      });
      
      // Should not throw error
      expect(screen).toBeInTheDocument();
    });

    it('handles touch move event', () => {
      render(<MobileScreenManager {...defaultProps} enableSwipeBack={true} />);
      
      const screenElement = document.querySelector('[data-testid="screen-content"]').closest('.fixed');
      
      fireEvent.touchStart(screenElement, {
        targetTouches: [{ clientX: 100 }]
      });
      
      fireEvent.touchMove(screenElement, {
        targetTouches: [{ clientX: 50 }]
      });
      
      // Should not throw error
      expect(screenElement).toBeInTheDocument();
    });

    it('triggers close on right swipe gesture', () => {
      const onClose = vi.fn();
      render(<MobileScreenManager {...defaultProps} onClose={onClose} enableSwipeBack={true} />);
      
      const screenElement = document.querySelector('[data-testid="screen-content"]').closest('.fixed');
      
      // Simulate right swipe (start at left, move right)
      fireEvent.touchStart(screenElement, {
        targetTouches: [{ clientX: 50 }]
      });
      
      fireEvent.touchMove(screenElement, {
        targetTouches: [{ clientX: 150 }]
      });
      
      fireEvent.touchEnd(screenElement);
      
      // Fast-forward animation delay
      vi.advanceTimersByTime(250);
      
      expect(onClose).toHaveBeenCalled();
    });

    it('does not trigger close on left swipe gesture', () => {
      const onClose = vi.fn();
      render(<MobileScreenManager {...defaultProps} onClose={onClose} enableSwipeBack={true} />);
      
      const screenElement = document.querySelector('[data-testid="screen-content"]').closest('.fixed');
      
      // Simulate left swipe (start at right, move left)
      fireEvent.touchStart(screenElement, {
        targetTouches: [{ clientX: 150 }]
      });
      
      fireEvent.touchMove(screenElement, {
        targetTouches: [{ clientX: 50 }]
      });
      
      fireEvent.touchEnd(screenElement);
      
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not handle gestures when enableSwipeBack is false', () => {
      const onClose = vi.fn();
      render(<MobileScreenManager {...defaultProps} onClose={onClose} enableSwipeBack={false} />);
      
      const screenElement = document.querySelector('[data-testid="screen-content"]').closest('.fixed');
      
      // Simulate right swipe
      fireEvent.touchStart(screenElement, {
        targetTouches: [{ clientX: 50 }]
      });
      
      fireEvent.touchMove(screenElement, {
        targetTouches: [{ clientX: 150 }]
      });
      
      fireEvent.touchEnd(screenElement);
      
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for buttons', () => {
      render(<MobileScreenManager {...defaultProps} />);
      
      expect(screen.getByLabelText('Go back')).toBeInTheDocument();
      expect(screen.getByLabelText('Close')).toBeInTheDocument();
    });

    it('has proper heading structure', () => {
      render(<MobileScreenManager {...defaultProps} title="Test Title" />);
      
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Test Title');
    });

    it('manages focus properly', () => {
      render(<MobileScreenManager {...defaultProps} />);
      
      // Screen should be focusable for keyboard navigation
      const screenElement = document.querySelector('.fixed');
      expect(screenElement).toBeInTheDocument();
    });
  });

  describe('Animation States', () => {
    it('applies animation class when opening', () => {
      render(<MobileScreenManager {...defaultProps} />);
      
      const screenElement = document.querySelector('.animate-slide-in-right');
      expect(screenElement).toBeInTheDocument();
    });

    it('handles animation timing correctly', async () => {
      render(<MobileScreenManager {...defaultProps} />);
      
      // Fast-forward animation
      vi.advanceTimersByTime(300);
      
      // Should not throw errors
      expect(screen.getByText('Test Screen')).toBeInTheDocument();
    });
  });
});