import React, { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

const MobileButton = React.forwardRef(({
  className,
  variant = 'default',
  size = 'default',
  loading = false,
  disabled = false,
  children,
  onClick,
  onTouchStart,
  onTouchEnd,
  hapticFeedback = false,
  ripple = true,
  ...props
}, ref) => {
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState([]);
  const buttonRef = useRef(null);
  const touchTimeoutRef = useRef(null);

  // Combine refs
  const combinedRef = ref || buttonRef;

  // Handle touch interactions
  const handleTouchStart = (e) => {
    // Always call the original onTouchStart first
    if (onTouchStart) {
      onTouchStart(e);
    }

    if (disabled || loading) return;

    setIsPressed(true);
    
    // Create ripple effect
    if (ripple && combinedRef.current) {
      const rect = combinedRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      const newRipple = {
        id: Date.now() + Math.random(), // Add randomness to prevent duplicate keys
        x,
        y,
        size: Math.max(rect.width, rect.height) * 2
      };
      
      setRipples(prev => [...prev, newRipple]);
      
      // Remove ripple after animation
      setTimeout(() => {
        setRipples(prev => prev.filter(r => r.id !== newRipple.id));
      }, 600);
    }

    // Haptic feedback (if supported)
    if (hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }

    // Clear any existing timeout
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
    }

    // Set timeout to reset pressed state
    touchTimeoutRef.current = setTimeout(() => {
      setIsPressed(false);
    }, 150);
  };

  const handleTouchEnd = (e) => {
    if (disabled || loading) return;

    // Clear timeout and reset pressed state
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
    }
    
    setTimeout(() => {
      setIsPressed(false);
    }, 50);

    if (onTouchEnd) {
      onTouchEnd(e);
    }
  };

  const handleClick = (e) => {
    if (disabled || loading) return;
    
    if (onClick) {
      onClick(e);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }
    };
  }, []);

  // Variant styles
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-md',
    destructive: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-md',
    outline: 'border-2 border-gray-300 bg-white text-gray-900 hover:bg-gray-50 active:bg-gray-100',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400',
    ghost: 'text-gray-900 hover:bg-gray-100 active:bg-gray-200',
    link: 'text-blue-600 underline-offset-4 hover:underline active:text-blue-800'
  };

  // Size styles
  const sizes = {
    sm: 'h-10 px-4 text-sm min-w-[80px]',
    default: 'h-12 px-6 text-base min-w-[100px]',
    lg: 'h-14 px-8 text-lg min-w-[120px]',
    xl: 'h-16 px-10 text-xl min-w-[140px]',
    icon: 'h-12 w-12 p-0'
  };

  return (
    <button
      ref={combinedRef}
      className={cn(
        // Base styles
        'relative inline-flex items-center justify-center',
        'rounded-lg font-medium',
        'touch-manipulation select-none',
        'transition-all duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:pointer-events-none',
        'overflow-hidden',
        
        // Touch target minimum size
        'min-h-[44px] min-w-[44px]',
        
        // Pressed state
        isPressed && !disabled && !loading && 'scale-95',
        
        // Variant and size
        variants[variant],
        sizes[size],
        
        className
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      {...props}
    >
      {/* Ripple effects */}
      {ripple && ripples.map(ripple => (
        <span
          key={ripple.id}
          className="absolute pointer-events-none bg-white/30 rounded-full animate-ping"
          style={{
            left: ripple.x - ripple.size / 2,
            top: ripple.y - ripple.size / 2,
            width: ripple.size,
            height: ripple.size,
            animationDuration: '600ms'
          }}
        />
      ))}
      
      {/* Loading spinner */}
      {loading && (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      )}
      
      {/* Button content */}
      <span className={cn(
        'flex items-center justify-center gap-2',
        loading && 'opacity-70'
      )}>
        {children}
      </span>
    </button>
  );
});

MobileButton.displayName = 'MobileButton';

export default MobileButton;