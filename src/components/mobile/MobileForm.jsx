import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check, X, AlertCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';
import MobileButton from './MobileButton';
import { MobileInput, MobileTextarea } from './MobileInput';

// Mobile Form Container
const MobileForm = React.forwardRef(({
  className,
  children,
  onSubmit,
  loading = false,
  ...props
}, ref) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit && !loading) {
      onSubmit(e);
    }
  };

  return (
    <form
      ref={ref}
      className={cn(
        'w-full space-y-6',
        'touch-manipulation',
        className
      )}
      onSubmit={handleSubmit}
      {...props}
    >
      {children}
    </form>
  );
});

MobileForm.displayName = 'MobileForm';

// Mobile Select Component
const MobileSelect = React.forwardRef(({
  className,
  label,
  placeholder = 'Select an option',
  options = [],
  value,
  onChange,
  error,
  success,
  disabled = false,
  searchable = false,
  multiple = false,
  ...props
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedValues, setSelectedValues] = useState(multiple ? (value || []) : []);
  const selectRef = useRef(null);
  const combinedRef = ref || selectRef;

  // Filter options based on search term
  const filteredOptions = searchable
    ? options.filter(option => 
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  // Get display value
  const getDisplayValue = () => {
    if (multiple) {
      if (selectedValues.length === 0) return placeholder;
      if (selectedValues.length === 1) {
        const option = options.find(opt => opt.value === selectedValues[0]);
        return option?.label || '';
      }
      return `${selectedValues.length} selected`;
    } else {
      const option = options.find(opt => opt.value === value);
      return option?.label || placeholder;
    }
  };

  // Handle option selection
  const handleOptionSelect = (optionValue) => {
    if (multiple) {
      const newValues = selectedValues.includes(optionValue)
        ? selectedValues.filter(v => v !== optionValue)
        : [...selectedValues, optionValue];
      
      setSelectedValues(newValues);
      onChange?.(newValues);
    } else {
      onChange?.(optionValue);
      setIsOpen(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (combinedRef.current && !combinedRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const hasError = Boolean(error);
  const hasSuccess = Boolean(success);

  return (
    <div ref={combinedRef} className={cn('relative w-full', className)}>
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

      {/* Select Button */}
      <button
        type="button"
        className={cn(
          // Base styles
          'w-full px-4 py-3 text-base text-left',
          'bg-white border-2 rounded-lg',
          'transition-all duration-200 ease-out',
          'flex items-center justify-between',
          
          // Mobile optimizations
          'min-h-[48px]', // Minimum touch target
          'touch-manipulation',
          
          // Focus styles
          'focus:outline-none focus:ring-0',
          isOpen && !hasError && !hasSuccess && 'border-blue-500 shadow-lg shadow-blue-500/20',
          
          // State styles
          hasError && 'border-red-500 bg-red-50',
          hasSuccess && 'border-green-500 bg-green-50',
          disabled && 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed',
          
          // Default border
          !isOpen && !hasError && !hasSuccess && 'border-gray-300 hover:border-gray-400'
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        {...props}
      >
        <span className={cn(
          value || (multiple && selectedValues.length > 0) ? 'text-gray-900' : 'text-gray-400'
        )}>
          {getDisplayValue()}
        </span>
        <ChevronDown className={cn(
          'h-5 w-5 transition-transform duration-200',
          isOpen && 'rotate-180'
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-xl max-h-60 overflow-hidden">
          {/* Search Input */}
          {searchable && (
            <div className="p-3 border-b border-gray-200">
              <MobileInput
                placeholder="Search options..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                clearable
                onClear={() => setSearchTerm('')}
              />
            </div>
          )}

          {/* Options List */}
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-gray-500 text-center">
                No options found
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = multiple 
                  ? selectedValues.includes(option.value)
                  : value === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'w-full px-4 py-3 text-left text-base',
                      'hover:bg-gray-50 active:bg-gray-100',
                      'transition-colors duration-150',
                      'flex items-center justify-between',
                      'min-h-[48px] touch-manipulation',
                      isSelected && 'bg-blue-50 text-blue-700'
                    )}
                    onClick={() => handleOptionSelect(option.value)}
                  >
                    <span>{option.label}</span>
                    {isSelected && <Check className="h-4 w-4" />}
                  </button>
                );
              })
            )}
          </div>
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

MobileSelect.displayName = 'MobileSelect';

// Mobile Date Picker Component
const MobileDatePicker = React.forwardRef(({
  className,
  label,
  value,
  onChange,
  error,
  success,
  disabled = false,
  min,
  max,
  placeholder = 'Select date',
  ...props
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(value || '');
  const dateRef = useRef(null);
  const combinedRef = ref || dateRef;

  // Format date for display
  const formatDisplayDate = (dateString) => {
    if (!dateString) return placeholder;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Handle date change
  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    onChange?.(newDate);
    setIsOpen(false);
  };

  const hasError = Boolean(error);
  const hasSuccess = Boolean(success);

  return (
    <div ref={combinedRef} className={cn('relative w-full', className)}>
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

      {/* Date Button */}
      <button
        type="button"
        className={cn(
          // Base styles
          'w-full px-4 py-3 text-base text-left',
          'bg-white border-2 rounded-lg',
          'transition-all duration-200 ease-out',
          'flex items-center justify-between',
          
          // Mobile optimizations
          'min-h-[48px]', // Minimum touch target
          'touch-manipulation',
          
          // Focus styles
          'focus:outline-none focus:ring-0',
          isOpen && !hasError && !hasSuccess && 'border-blue-500 shadow-lg shadow-blue-500/20',
          
          // State styles
          hasError && 'border-red-500 bg-red-50',
          hasSuccess && 'border-green-500 bg-green-50',
          disabled && 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed',
          
          // Default border
          !isOpen && !hasError && !hasSuccess && 'border-gray-300 hover:border-gray-400'
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={cn(
          selectedDate ? 'text-gray-900' : 'text-gray-400'
        )}>
          {formatDisplayDate(selectedDate)}
        </span>
        <Calendar className="h-5 w-5 text-gray-400" />
      </button>

      {/* Native Date Input (Hidden) */}
      {isOpen && (
        <input
          type="date"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          value={selectedDate}
          onChange={handleDateChange}
          min={min}
          max={max}
          disabled={disabled}
          {...props}
        />
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

MobileDatePicker.displayName = 'MobileDatePicker';

// Mobile Number Input Component
const MobileNumberInput = React.forwardRef(({
  className,
  label,
  value,
  onChange,
  error,
  success,
  disabled = false,
  min,
  max,
  step = 1,
  placeholder = '0',
  showSteppers = true,
  ...props
}, ref) => {
  const [inputValue, setInputValue] = useState(value || '');
  const inputRef = useRef(null);
  const combinedRef = ref || inputRef;

  // Handle value change
  const handleChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange?.(newValue);
  };

  // Handle stepper buttons
  const handleIncrement = () => {
    const currentValue = parseFloat(inputValue) || 0;
    const newValue = currentValue + step;
    if (max === undefined || newValue <= max) {
      const formattedValue = newValue.toString();
      setInputValue(formattedValue);
      onChange?.(formattedValue);
    }
  };

  const handleDecrement = () => {
    const currentValue = parseFloat(inputValue) || 0;
    const newValue = currentValue - step;
    if (min === undefined || newValue >= min) {
      const formattedValue = newValue.toString();
      setInputValue(formattedValue);
      onChange?.(formattedValue);
    }
  };

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
      <div className="relative flex">
        <input
          ref={combinedRef}
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          className={cn(
            // Base styles
            'w-full px-4 py-3 text-base text-center',
            'bg-white border-2 rounded-lg',
            'transition-all duration-200 ease-out',
            'placeholder:text-gray-400',
            
            // Mobile optimizations
            'min-h-[48px]', // Minimum touch target
            'touch-manipulation',
            'text-[16px]', // Prevents zoom on iOS
            
            // Focus styles
            'focus:outline-none focus:ring-0',
            'focus:border-blue-500 focus:shadow-lg focus:shadow-blue-500/20',
            
            // State styles
            hasError && 'border-red-500 bg-red-50',
            hasSuccess && 'border-green-500 bg-green-50',
            disabled && 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed',
            
            // Default border
            'border-gray-300 hover:border-gray-400',
            
            // Stepper adjustments
            showSteppers && 'rounded-r-none border-r-0'
          )}
          value={inputValue}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          disabled={disabled}
          {...props}
        />

        {/* Stepper Buttons */}
        {showSteppers && (
          <div className="flex flex-col border-2 border-l-0 border-gray-300 rounded-r-lg overflow-hidden">
            <button
              type="button"
              className={cn(
                'flex-1 px-3 bg-white hover:bg-gray-50 active:bg-gray-100',
                'transition-colors duration-150',
                'flex items-center justify-center',
                'min-w-[44px] touch-manipulation',
                'border-b border-gray-300',
                disabled && 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
              onClick={handleIncrement}
              disabled={disabled || (max !== undefined && parseFloat(inputValue) >= max)}
            >
              <span className="text-lg font-bold">+</span>
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 px-3 bg-white hover:bg-gray-50 active:bg-gray-100',
                'transition-colors duration-150',
                'flex items-center justify-center',
                'min-w-[44px] touch-manipulation',
                disabled && 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
              onClick={handleDecrement}
              disabled={disabled || (min !== undefined && parseFloat(inputValue) <= min)}
            >
              <span className="text-lg font-bold">−</span>
            </button>
          </div>
        )}
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

MobileNumberInput.displayName = 'MobileNumberInput';

export {
  MobileForm,
  MobileSelect,
  MobileDatePicker,
  MobileNumberInput
};

export default MobileForm;