import React, { useState, useRef } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../../lib/utils';

// Mobile Checkbox Component
const MobileCheckbox = React.forwardRef(({
  className,
  label,
  description,
  checked = false,
  indeterminate = false,
  disabled = false,
  size = 'default',
  variant = 'default',
  onChange,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const checkboxRef = useRef(null);
  const combinedRef = ref || checkboxRef;

  const handleChange = (e) => {
    if (!disabled && onChange) {
      onChange(e.target.checked, e);
    }
  };

  const handleFocus = (e) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  // Size variants
  const sizes = {
    sm: {
      container: 'min-h-[40px]',
      checkbox: 'h-4 w-4',
      icon: 'h-3 w-3',
      label: 'text-sm',
      description: 'text-xs'
    },
    default: {
      container: 'min-h-[48px]',
      checkbox: 'h-5 w-5',
      icon: 'h-4 w-4',
      label: 'text-base',
      description: 'text-sm'
    },
    lg: {
      container: 'min-h-[56px]',
      checkbox: 'h-6 w-6',
      icon: 'h-5 w-5',
      label: 'text-lg',
      description: 'text-base'
    }
  };

  // Variant styles
  const variants = {
    default: {
      checkbox: 'border-gray-300 bg-white',
      checkedCheckbox: 'border-blue-600 bg-blue-600',
      focusRing: 'ring-blue-500',
      label: 'text-gray-900',
      description: 'text-gray-600'
    },
    success: {
      checkbox: 'border-gray-300 bg-white',
      checkedCheckbox: 'border-green-600 bg-green-600',
      focusRing: 'ring-green-500',
      label: 'text-gray-900',
      description: 'text-gray-600'
    },
    warning: {
      checkbox: 'border-gray-300 bg-white',
      checkedCheckbox: 'border-yellow-600 bg-yellow-600',
      focusRing: 'ring-yellow-500',
      label: 'text-gray-900',
      description: 'text-gray-600'
    }
  };

  const sizeClasses = sizes[size];
  const variantClasses = variants[variant];

  return (
    <label className={cn(
      'flex items-start gap-3 cursor-pointer touch-manipulation',
      sizeClasses.container,
      disabled && 'cursor-not-allowed opacity-50',
      className
    )}>
      {/* Hidden Input */}
      <input
        ref={combinedRef}
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />

      {/* Custom Checkbox */}
      <div className={cn(
        'relative flex-shrink-0 rounded border-2 transition-all duration-200',
        'flex items-center justify-center',
        sizeClasses.checkbox,
        
        // Base styles
        !checked && !indeterminate && variantClasses.checkbox,
        (checked || indeterminate) && variantClasses.checkedCheckbox,
        
        // Focus styles
        isFocused && `ring-2 ring-offset-2 ${variantClasses.focusRing}`,
        
        // Disabled styles
        disabled && 'border-gray-300 bg-gray-100'
      )}>
        {/* Check Icon */}
        {checked && !indeterminate && (
          <Check className={cn(
            'text-white transition-all duration-200',
            sizeClasses.icon
          )} />
        )}

        {/* Indeterminate Icon */}
        {indeterminate && (
          <Minus className={cn(
            'text-white transition-all duration-200',
            sizeClasses.icon
          )} />
        )}
      </div>

      {/* Label and Description */}
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && (
            <div className={cn(
              'font-medium leading-tight',
              sizeClasses.label,
              variantClasses.label,
              disabled && 'text-gray-400'
            )}>
              {label}
            </div>
          )}
          {description && (
            <div className={cn(
              'mt-1 leading-tight',
              sizeClasses.description,
              variantClasses.description,
              disabled && 'text-gray-400'
            )}>
              {description}
            </div>
          )}
        </div>
      )}
    </label>
  );
});

MobileCheckbox.displayName = 'MobileCheckbox';

// Mobile Radio Component
const MobileRadio = React.forwardRef(({
  className,
  label,
  description,
  checked = false,
  disabled = false,
  size = 'default',
  variant = 'default',
  name,
  value,
  onChange,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const radioRef = useRef(null);
  const combinedRef = ref || radioRef;

  const handleChange = (e) => {
    if (!disabled && onChange) {
      onChange(e.target.value, e);
    }
  };

  const handleFocus = (e) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  // Size variants
  const sizes = {
    sm: {
      container: 'min-h-[40px]',
      radio: 'h-4 w-4',
      dot: 'h-2 w-2',
      label: 'text-sm',
      description: 'text-xs'
    },
    default: {
      container: 'min-h-[48px]',
      radio: 'h-5 w-5',
      dot: 'h-2.5 w-2.5',
      label: 'text-base',
      description: 'text-sm'
    },
    lg: {
      container: 'min-h-[56px]',
      radio: 'h-6 w-6',
      dot: 'h-3 w-3',
      label: 'text-lg',
      description: 'text-base'
    }
  };

  // Variant styles
  const variants = {
    default: {
      radio: 'border-gray-300 bg-white',
      checkedRadio: 'border-blue-600 bg-white',
      dot: 'bg-blue-600',
      focusRing: 'ring-blue-500',
      label: 'text-gray-900',
      description: 'text-gray-600'
    },
    success: {
      radio: 'border-gray-300 bg-white',
      checkedRadio: 'border-green-600 bg-white',
      dot: 'bg-green-600',
      focusRing: 'ring-green-500',
      label: 'text-gray-900',
      description: 'text-gray-600'
    },
    warning: {
      radio: 'border-gray-300 bg-white',
      checkedRadio: 'border-yellow-600 bg-white',
      dot: 'bg-yellow-600',
      focusRing: 'ring-yellow-500',
      label: 'text-gray-900',
      description: 'text-gray-600'
    }
  };

  const sizeClasses = sizes[size];
  const variantClasses = variants[variant];

  return (
    <label className={cn(
      'flex items-start gap-3 cursor-pointer touch-manipulation',
      sizeClasses.container,
      disabled && 'cursor-not-allowed opacity-50',
      className
    )}>
      {/* Hidden Input */}
      <input
        ref={combinedRef}
        type="radio"
        className="sr-only"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />

      {/* Custom Radio */}
      <div className={cn(
        'relative flex-shrink-0 rounded-full border-2 transition-all duration-200',
        'flex items-center justify-center',
        sizeClasses.radio,
        
        // Base styles
        !checked && variantClasses.radio,
        checked && variantClasses.checkedRadio,
        
        // Focus styles
        isFocused && `ring-2 ring-offset-2 ${variantClasses.focusRing}`,
        
        // Disabled styles
        disabled && 'border-gray-300 bg-gray-100'
      )}>
        {/* Radio Dot */}
        {checked && (
          <div className={cn(
            'rounded-full transition-all duration-200',
            sizeClasses.dot,
            variantClasses.dot,
            disabled && 'bg-gray-400'
          )} />
        )}
      </div>

      {/* Label and Description */}
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && (
            <div className={cn(
              'font-medium leading-tight',
              sizeClasses.label,
              variantClasses.label,
              disabled && 'text-gray-400'
            )}>
              {label}
            </div>
          )}
          {description && (
            <div className={cn(
              'mt-1 leading-tight',
              sizeClasses.description,
              variantClasses.description,
              disabled && 'text-gray-400'
            )}>
              {description}
            </div>
          )}
        </div>
      )}
    </label>
  );
});

MobileRadio.displayName = 'MobileRadio';

// Mobile Radio Group Component
const MobileRadioGroup = ({
  className,
  label,
  description,
  options = [],
  value,
  onChange,
  name,
  disabled = false,
  size = 'default',
  variant = 'default',
  layout = 'vertical', // 'vertical' | 'horizontal'
  ...props
}) => {
  const handleChange = (optionValue, e) => {
    if (!disabled && onChange) {
      onChange(optionValue, e);
    }
  };

  const layoutClasses = {
    vertical: 'space-y-3',
    horizontal: 'flex flex-wrap gap-4'
  };

  return (
    <div className={cn('w-full', className)} {...props}>
      {/* Group Label */}
      {label && (
        <div className="mb-3">
          <div className="text-sm font-medium text-gray-700">{label}</div>
          {description && (
            <div className="mt-1 text-sm text-gray-600">{description}</div>
          )}
        </div>
      )}

      {/* Radio Options */}
      <div className={layoutClasses[layout]}>
        {options.map((option) => (
          <MobileRadio
            key={option.value}
            name={name}
            value={option.value}
            checked={value === option.value}
            label={option.label}
            description={option.description}
            disabled={disabled || option.disabled}
            size={size}
            variant={variant}
            onChange={handleChange}
          />
        ))}
      </div>
    </div>
  );
};

// Mobile Checkbox Group Component
const MobileCheckboxGroup = ({
  className,
  label,
  description,
  options = [],
  value = [],
  onChange,
  disabled = false,
  size = 'default',
  variant = 'default',
  layout = 'vertical', // 'vertical' | 'horizontal'
  ...props
}) => {
  const handleChange = (optionValue, checked, e) => {
    if (disabled) return;

    let newValue;
    if (checked) {
      newValue = [...value, optionValue];
    } else {
      newValue = value.filter(v => v !== optionValue);
    }

    if (onChange) {
      onChange(newValue, e);
    }
  };

  const layoutClasses = {
    vertical: 'space-y-3',
    horizontal: 'flex flex-wrap gap-4'
  };

  return (
    <div className={cn('w-full', className)} {...props}>
      {/* Group Label */}
      {label && (
        <div className="mb-3">
          <div className="text-sm font-medium text-gray-700">{label}</div>
          {description && (
            <div className="mt-1 text-sm text-gray-600">{description}</div>
          )}
        </div>
      )}

      {/* Checkbox Options */}
      <div className={layoutClasses[layout]}>
        {options.map((option) => (
          <MobileCheckbox
            key={option.value}
            checked={value.includes(option.value)}
            label={option.label}
            description={option.description}
            disabled={disabled || option.disabled}
            size={size}
            variant={variant}
            onChange={(checked, e) => handleChange(option.value, checked, e)}
          />
        ))}
      </div>
    </div>
  );
};

export {
  MobileCheckbox,
  MobileRadio,
  MobileRadioGroup,
  MobileCheckboxGroup
};

export default {
  MobileCheckbox,
  MobileRadio,
  MobileRadioGroup,
  MobileCheckboxGroup
};