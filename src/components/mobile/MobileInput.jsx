import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, X, Check, AlertCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';

const MobileInput = React.forwardRef(({
  className,
  type = 'text',
  label,
  placeholder,
  error,
  success,
  disabled = false,
  clearable = false,
  showPasswordToggle = false,
  autoFocus = false,
  value,
  onChange,
  onClear,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasValue, setHasValue] = useState(false);
  const inputRef = useRef(null);
  const combinedRef = ref || inputRef;

  // Update hasValue when value changes
  useEffect(() => {
    setHasValue(value && value.length > 0);
  }, [value]);

  // Auto focus if requested
  useEffect(() => {
    if (autoFocus && combinedRef.current) {
      combinedRef.current.focus();
    }
  }, [autoFocus]);

  const handleFocus = (e) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const handleChange = (e) => {
    setHasValue(e.target.value.length > 0);
    onChange?.(e);
  };

  const handleClear = () => {
    if (combinedRef.current) {
      combinedRef.current.value = '';
      combinedRef.current.focus();
    }
    setHasValue(false);
    onClear?.();
    onChange?.({ target: { value: '' } });
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const inputType = type === 'password' && showPassword ? 'text' : type;
  const hasError = Boolean(error);
  const hasSuccess = Boolean(success);

  return (
    <div className={cn('relative w-full', className)}>
      {/* Label */}
      {label && (
        <label className={cn(
          'block text-sm font-medium mb-2 transition-colors duration-200',
          hasError ? 'text-red-600' : hasSuccess ? 'text-green-600' : 'text-gray-700',
          disabled && 'text-gray-400'
        )}>
          {label}
        </label>
      )}

      {/* Input Container */}
      <div className="relative">
        <input
          ref={combinedRef}
          type={inputType}
          className={cn(
            // Base styles
            'w-full px-4 py-3 text-base',
            'bg-white border-2 rounded-lg',
            'transition-all duration-200 ease-out',
            'placeholder:text-gray-400',
            
            // Mobile optimizations
            'min-h-[48px]', // Minimum touch target
            'touch-manipulation',
            'text-[16px]', // Prevents zoom on iOS
            
            // Focus styles
            'focus:outline-none focus:ring-0',
            isFocused && !hasError && !hasSuccess && 'border-blue-500 shadow-lg shadow-blue-500/20',
            
            // State styles
            hasError && 'border-red-500 bg-red-50',
            hasSuccess && 'border-green-500 bg-green-50',
            disabled && 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed',
            
            // Default border
            !isFocused && !hasError && !hasSuccess && 'border-gray-300 hover:border-gray-400',
            
            // Padding adjustments for icons
            (clearable && hasValue) || showPasswordToggle ? 'pr-12' : '',
            (clearable && hasValue) && showPasswordToggle ? 'pr-20' : ''
          )}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />

        {/* Action Icons Container */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {/* Clear Button */}
          {clearable && hasValue && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className={cn(
                'p-1 rounded-full',
                'text-gray-400 hover:text-gray-600',
                'transition-colors duration-200',
                'touch-manipulation min-w-[32px] min-h-[32px]',
                'flex items-center justify-center'
              )}
              aria-label="Clear input"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Password Toggle */}
          {showPasswordToggle && type === 'password' && (
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className={cn(
                'p-1 rounded-full',
                'text-gray-400 hover:text-gray-600',
                'transition-colors duration-200',
                'touch-manipulation min-w-[32px] min-h-[32px]',
                'flex items-center justify-center'
              )}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}

          {/* Success Icon */}
          {hasSuccess && !hasError && (
            <div className="text-green-500 p-1">
              <Check className="h-4 w-4" />
            </div>
          )}

          {/* Error Icon */}
          {hasError && (
            <div className="text-red-500 p-1">
              <AlertCircle className="h-4 w-4" />
            </div>
          )}
        </div>
      </div>

      {/* Helper Text */}
      {(error || success) && (
        <div className={cn(
          'mt-2 text-sm flex items-start gap-2',
          hasError ? 'text-red-600' : 'text-green-600'
        )}>
          {hasError ? (
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          ) : (
            <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
          )}
          <span>{error || success}</span>
        </div>
      )}
    </div>
  );
});

MobileInput.displayName = 'MobileInput';

// Mobile Textarea Component
const MobileTextarea = React.forwardRef(({
  className,
  label,
  placeholder,
  error,
  success,
  disabled = false,
  rows = 4,
  maxLength,
  showCharCount = false,
  autoResize = false,
  value,
  onChange,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef(null);
  const combinedRef = ref || textareaRef;

  // Update character count
  useEffect(() => {
    setCharCount(value ? value.length : 0);
  }, [value]);

  // Auto resize functionality
  useEffect(() => {
    if (autoResize && combinedRef.current) {
      const textarea = combinedRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value, autoResize]);

  const handleFocus = (e) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const handleChange = (e) => {
    setCharCount(e.target.value.length);
    onChange?.(e);
  };

  const hasError = Boolean(error);
  const hasSuccess = Boolean(success);
  const isOverLimit = maxLength && charCount > maxLength;

  return (
    <div className={cn('relative w-full', className)}>
      {/* Label */}
      {label && (
        <label className={cn(
          'block text-sm font-medium mb-2 transition-colors duration-200',
          hasError ? 'text-red-600' : hasSuccess ? 'text-green-600' : 'text-gray-700',
          disabled && 'text-gray-400'
        )}>
          {label}
        </label>
      )}

      {/* Textarea */}
      <textarea
        ref={combinedRef}
        rows={autoResize ? 1 : rows}
        className={cn(
          // Base styles
          'w-full px-4 py-3 text-base',
          'bg-white border-2 rounded-lg',
          'transition-all duration-200 ease-out',
          'placeholder:text-gray-400',
          'resize-none',
          
          // Mobile optimizations
          'min-h-[48px]', // Minimum touch target
          'touch-manipulation',
          'text-[16px]', // Prevents zoom on iOS
          
          // Focus styles
          'focus:outline-none focus:ring-0',
          isFocused && !hasError && !hasSuccess && 'border-blue-500 shadow-lg shadow-blue-500/20',
          
          // State styles
          hasError && 'border-red-500 bg-red-50',
          hasSuccess && 'border-green-500 bg-green-50',
          disabled && 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed',
          
          // Default border
          !isFocused && !hasError && !hasSuccess && 'border-gray-300 hover:border-gray-400'
        )}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />

      {/* Character Count */}
      {showCharCount && maxLength && (
        <div className={cn(
          'mt-2 text-sm text-right',
          isOverLimit ? 'text-red-600' : 'text-gray-500'
        )}>
          {charCount}/{maxLength}
        </div>
      )}

      {/* Helper Text */}
      {(error || success) && (
        <div className={cn(
          'mt-2 text-sm flex items-start gap-2',
          hasError ? 'text-red-600' : 'text-green-600'
        )}>
          {hasError ? (
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          ) : (
            <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
          )}
          <span>{error || success}</span>
        </div>
      )}
    </div>
  );
});

MobileTextarea.displayName = 'MobileTextarea';

export { MobileInput, MobileTextarea };
export default MobileInput;