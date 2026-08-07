import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MobileButton from '../MobileButton';

// Mock navigator.vibrate
Object.defineProperty(navigator, 'vibrate', {
  writable: true,
  value: vi.fn()
});

describe('MobileButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default props', () => {
    render(<MobileButton>Click me</MobileButton>);
    
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Click me');
  });

  it('applies correct variant styles', () => {
    const { rerender } = render(<MobileButton variant="destructive">Delete</MobileButton>);
    
    let button = screen.getByRole('button');
    expect(button).toHaveClass('bg-red-600');
    
    rerender(<MobileButton variant="outline">Outline</MobileButton>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('border-2');
    
    rerender(<MobileButton variant="ghost">Ghost</MobileButton>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('text-gray-900');
  });

  it('applies correct size styles', () => {
    const { rerender } = render(<MobileButton size="sm">Small</MobileButton>);
    
    let button = screen.getByRole('button');
    expect(button).toHaveClass('h-10');
    
    rerender(<MobileButton size="lg">Large</MobileButton>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('h-14');
    
    rerender(<MobileButton size="icon">Icon</MobileButton>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('h-12', 'w-12');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<MobileButton onClick={handleClick}>Click me</MobileButton>);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows loading state correctly', () => {
    render(<MobileButton loading>Loading</MobileButton>);
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    
    // Check for loading spinner
    const spinner = screen.getByRole('button').querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('disables button when disabled prop is true', () => {
    const handleClick = vi.fn();
    render(<MobileButton disabled onClick={handleClick}>Disabled</MobileButton>);
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('handles touch interactions', () => {
    const handleTouchStart = vi.fn();
    const handleTouchEnd = vi.fn();
    
    render(
      <MobileButton 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        Touch me
      </MobileButton>
    );
    
    const button = screen.getByRole('button');
    
    fireEvent.touchStart(button, {
      touches: [{ clientX: 100, clientY: 100 }]
    });
    expect(handleTouchStart).toHaveBeenCalled();
    
    fireEvent.touchEnd(button);
    expect(handleTouchEnd).toHaveBeenCalled();
  });

  it('creates ripple effect on touch', async () => {
    render(<MobileButton ripple>Ripple</MobileButton>);
    
    const button = screen.getByRole('button');
    
    fireEvent.touchStart(button, {
      touches: [{ clientX: 50, clientY: 50 }]
    });
    
    // Check for ripple element
    await waitFor(() => {
      const ripple = button.querySelector('.animate-ping');
      expect(ripple).toBeInTheDocument();
    });
  });

  it('provides haptic feedback when enabled', () => {
    render(<MobileButton hapticFeedback>Haptic</MobileButton>);
    
    const button = screen.getByRole('button');
    
    fireEvent.touchStart(button, {
      touches: [{ clientX: 50, clientY: 50 }]
    });
    
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
  });

  it('does not provide haptic feedback when disabled', () => {
    render(<MobileButton hapticFeedback disabled>Disabled Haptic</MobileButton>);
    
    const button = screen.getByRole('button');
    
    fireEvent.touchStart(button, {
      touches: [{ clientX: 50, clientY: 50 }]
    });
    
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it('applies pressed state styling during touch', async () => {
    render(<MobileButton>Press me</MobileButton>);
    
    const button = screen.getByRole('button');
    
    fireEvent.touchStart(button, {
      touches: [{ clientX: 50, clientY: 50 }]
    });
    
    // Should have pressed state class
    expect(button).toHaveClass('scale-95');
    
    fireEvent.touchEnd(button);
    
    // Should remove pressed state after delay
    await waitFor(() => {
      expect(button).not.toHaveClass('scale-95');
    }, { timeout: 200 });
  });

  it('prevents interactions when loading', () => {
    const handleClick = vi.fn();
    const handleTouchStart = vi.fn();
    
    render(
      <MobileButton 
        loading 
        onClick={handleClick}
        onTouchStart={handleTouchStart}
      >
        Loading
      </MobileButton>
    );
    
    const button = screen.getByRole('button');
    
    fireEvent.click(button);
    fireEvent.touchStart(button, {
      touches: [{ clientX: 50, clientY: 50 }]
    });
    
    expect(handleClick).not.toHaveBeenCalled();
    expect(handleTouchStart).toHaveBeenCalled(); // onTouchStart still fires but doesn't create effects
  });

  it('has minimum touch target size', () => {
    render(<MobileButton>Touch target</MobileButton>);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('min-h-[44px]');
    // The min-w-[44px] is overridden by the default size min-w-[100px]
    expect(button).toHaveClass('min-w-[100px]');
  });

  it('supports custom className', () => {
    render(<MobileButton className="custom-class">Custom</MobileButton>);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef();
    render(<MobileButton ref={ref}>Ref test</MobileButton>);
    
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('disables ripple effect when ripple prop is false', () => {
    render(<MobileButton ripple={false}>No ripple</MobileButton>);
    
    const button = screen.getByRole('button');
    
    fireEvent.touchStart(button, {
      touches: [{ clientX: 50, clientY: 50 }]
    });
    
    // Should not create ripple
    const ripple = button.querySelector('.animate-ping');
    expect(ripple).not.toBeInTheDocument();
  });

  it('cleans up timeouts on unmount', () => {
    const { unmount } = render(<MobileButton>Cleanup test</MobileButton>);
    
    const button = screen.getByRole('button');
    
    fireEvent.touchStart(button, {
      touches: [{ clientX: 50, clientY: 50 }]
    });
    
    // Unmount should not cause any errors
    expect(() => unmount()).not.toThrow();
  });

  it('handles multiple rapid touches gracefully', () => {
    render(<MobileButton>Rapid touch</MobileButton>);
    
    const button = screen.getByRole('button');
    
    // Rapid fire touch events
    for (let i = 0; i < 5; i++) {
      fireEvent.touchStart(button, {
        touches: [{ clientX: 50 + i, clientY: 50 + i }]
      });
      fireEvent.touchEnd(button);
    }
    
    // Should handle gracefully without errors
    expect(button).toBeInTheDocument();
  });

  it('maintains accessibility attributes', () => {
    render(
      <MobileButton 
        aria-label="Accessible button"
        role="button"
        tabIndex={0}
      >
        Accessible
      </MobileButton>
    );
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Accessible button');
    expect(button).toHaveAttribute('tabIndex', '0');
  });
});