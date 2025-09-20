import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

const MobileLoadingSpinner = ({
  size = 'default',
  variant = 'default',
  text,
  className,
  fullScreen = false,
  overlay = false,
  ...props
}) => {
  // Size configurations
  const sizes = {
    sm: {
      spinner: 'h-4 w-4',
      text: 'text-sm',
      gap: 'gap-2'
    },
    default: {
      spinner: 'h-6 w-6',
      text: 'text-base',
      gap: 'gap-3'
    },
    lg: {
      spinner: 'h-8 w-8',
      text: 'text-lg',
      gap: 'gap-4'
    },
    xl: {
      spinner: 'h-12 w-12',
      text: 'text-xl',
      gap: 'gap-4'
    }
  };

  // Variant styles
  const variants = {
    default: 'text-blue-600',
    secondary: 'text-gray-600',
    white: 'text-white',
    muted: 'text-gray-400'
  };

  const sizeConfig = sizes[size];
  const variantClass = variants[variant];

  const spinnerContent = (
    <div className={cn(
      'flex flex-col items-center justify-center',
      sizeConfig.gap,
      className
    )}>
      <Loader2 
        className={cn(
          'animate-spin',
          sizeConfig.spinner,
          variantClass
        )}
        {...props}
      />
      {text && (
        <span className={cn(
          'font-medium text-center',
          sizeConfig.text,
          variantClass
        )}>
          {text}
        </span>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className={cn(
        'fixed inset-0 z-50',
        'flex items-center justify-center',
        'bg-white',
        overlay && 'bg-white/90 backdrop-blur-sm'
      )}>
        {spinnerContent}
      </div>
    );
  }

  if (overlay) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 backdrop-blur-sm">
        {spinnerContent}
      </div>
    );
  }

  return spinnerContent;
};

// Skeleton loading component for mobile
const MobileSkeleton = ({ 
  className,
  variant = 'default',
  ...props 
}) => {
  const variants = {
    default: 'bg-gray-200',
    card: 'bg-gray-100 rounded-lg',
    text: 'bg-gray-200 rounded',
    avatar: 'bg-gray-200 rounded-full',
    button: 'bg-gray-200 rounded-lg'
  };

  return (
    <div
      className={cn(
        'animate-pulse',
        variants[variant],
        className
      )}
      {...props}
    />
  );
};

// Pulse loading indicator
const MobilePulse = ({
  size = 'default',
  variant = 'default',
  className,
  ...props
}) => {
  const sizes = {
    sm: 'h-2 w-2',
    default: 'h-3 w-3',
    lg: 'h-4 w-4'
  };

  const variants = {
    default: 'bg-blue-600',
    secondary: 'bg-gray-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    error: 'bg-red-600'
  };

  return (
    <div className={cn(
      'flex items-center justify-center gap-1',
      className
    )}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            'rounded-full animate-pulse',
            sizes[size],
            variants[variant]
          )}
          style={{
            animationDelay: `${i * 0.2}s`,
            animationDuration: '1s'
          }}
          {...props}
        />
      ))}
    </div>
  );
};

// Loading overlay for mobile interactions
const MobileLoadingOverlay = ({
  isVisible,
  text,
  variant = 'default',
  children
}) => {
  if (!isVisible) return children;

  return (
    <div className="relative">
      {children}
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-lg">
        <MobileLoadingSpinner
          size="lg"
          variant={variant}
          text={text}
        />
      </div>
    </div>
  );
};

// Progress indicator for mobile
const MobileProgress = ({
  value = 0,
  max = 100,
  size = 'default',
  variant = 'default',
  showPercentage = false,
  className,
  ...props
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const sizes = {
    sm: 'h-2',
    default: 'h-3',
    lg: 'h-4'
  };

  const variants = {
    default: 'bg-blue-600',
    secondary: 'bg-gray-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    error: 'bg-red-600'
  };

  return (
    <div className={cn('w-full', className)}>
      <div className={cn(
        'w-full bg-gray-200 rounded-full overflow-hidden',
        sizes[size]
      )}>
        <div
          className={cn(
            'h-full transition-all duration-300 ease-out rounded-full',
            variants[variant]
          )}
          style={{ width: `${percentage}%` }}
          {...props}
        />
      </div>
      {showPercentage && (
        <div className="mt-1 text-sm text-gray-600 text-center">
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  );
};

export {
  MobileLoadingSpinner,
  MobileSkeleton,
  MobilePulse,
  MobileLoadingOverlay,
  MobileProgress
};

export default MobileLoadingSpinner;