import React, { useState, useEffect } from 'react';
import { AlertCircle, Check, Info } from 'lucide-react';
import { cn } from '../../../lib/utils';

// Mobile Form Validation Hook
export const useMobileFormValidation = (initialValues = {}, validationRules = {}) => {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isValid, setIsValid] = useState(false);

  // Validation functions
  const validateField = (name, value) => {
    const rules = validationRules[name];
    if (!rules) return null;

    for (const rule of rules) {
      const error = rule(value, values);
      if (error) return error;
    }
    return null;
  };

  // Validate all fields
  const validateAll = () => {
    const newErrors = {};
    let hasErrors = false;

    Object.keys(validationRules).forEach(fieldName => {
      const error = validateField(fieldName, values[fieldName]);
      if (error) {
        newErrors[fieldName] = error;
        hasErrors = true;
      }
    });

    setErrors(newErrors);
    setIsValid(!hasErrors);
    return !hasErrors;
  };

  // Handle field change
  const handleChange = (name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));
    
    // Validate field if it's been touched
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors(prev => ({
        ...prev,
        [name]: error
      }));
    }
  };

  // Handle field blur
  const handleBlur = (name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    
    const error = validateField(name, values[name]);
    setErrors(prev => ({
      ...prev,
      [name]: error
    }));
  };

  // Reset form
  const reset = () => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsValid(false);
  };

  // Update validation when values change
  useEffect(() => {
    const hasErrors = Object.values(errors).some(error => error !== null);
    setIsValid(!hasErrors && Object.keys(touched).length > 0);
  }, [errors, touched]);

  return {
    values,
    errors,
    touched,
    isValid,
    handleChange,
    handleBlur,
    validateAll,
    reset,
    setValues,
    setErrors
  };
};

// Common validation rules
export const validationRules = {
  required: (value) => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return 'This field is required';
    }
    return null;
  },

  email: (value) => {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return 'Please enter a valid email address';
    }
    return null;
  },

  minLength: (min) => (value) => {
    if (!value) return null;
    if (value.length < min) {
      return `Must be at least ${min} characters long`;
    }
    return null;
  },

  maxLength: (max) => (value) => {
    if (!value) return null;
    if (value.length > max) {
      return `Must be no more than ${max} characters long`;
    }
    return null;
  },

  number: (value) => {
    if (!value) return null;
    if (isNaN(Number(value))) {
      return 'Please enter a valid number';
    }
    return null;
  },

  min: (min) => (value) => {
    if (!value) return null;
    if (Number(value) < min) {
      return `Must be at least ${min}`;
    }
    return null;
  },

  max: (max) => (value) => {
    if (!value) return null;
    if (Number(value) > max) {
      return `Must be no more than ${max}`;
    }
    return null;
  },

  pattern: (regex, message) => (value) => {
    if (!value) return null;
    if (!regex.test(value)) {
      return message || 'Invalid format';
    }
    return null;
  },

  custom: (validator, message) => (value, allValues) => {
    if (!validator(value, allValues)) {
      return message || 'Invalid value';
    }
    return null;
  }
};

// Mobile Form Field Wrapper
export const MobileFormField = ({
  children,
  label,
  error,
  success,
  hint,
  required = false,
  className
}) => {
  return (
    <div className={cn('w-full space-y-2', className)}>
      {/* Label */}
      {label && (
        <label className={cn(
          'block text-sm font-medium transition-colors duration-200',
          error ? 'text-red-600' : success ? 'text-green-600' : 'text-gray-700'
        )}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Input */}
      {children}

      {/* Hint */}
      {hint && !error && !success && (
        <div className="flex items-start gap-2 text-sm text-gray-600">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{hint}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="flex items-start gap-2 text-sm text-green-600">
          <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}
    </div>
  );
};

// Mobile Form Section
export const MobileFormSection = ({
  title,
  description,
  children,
  className
}) => {
  return (
    <div className={cn('space-y-4', className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          )}
          {description && (
            <p className="text-sm text-gray-600">{description}</p>
          )}
        </div>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
};

// Mobile Form Actions
export const MobileFormActions = ({
  children,
  className,
  layout = 'horizontal' // 'horizontal' | 'vertical' | 'stacked'
}) => {
  const layoutClasses = {
    horizontal: 'flex gap-3',
    vertical: 'flex flex-col gap-3',
    stacked: 'space-y-3'
  };

  return (
    <div className={cn(
      'w-full pt-4 border-t border-gray-200',
      layoutClasses[layout],
      className
    )}>
      {children}
    </div>
  );
};

// Mobile Form Error Summary
export const MobileFormErrorSummary = ({
  errors,
  className
}) => {
  const errorList = Object.entries(errors).filter(([_, error]) => error);
  
  if (errorList.length === 0) return null;

  return (
    <div className={cn(
      'p-4 bg-red-50 border border-red-200 rounded-lg',
      className
    )}>
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-red-800 mb-2">
            Please fix the following errors:
          </h4>
          <ul className="text-sm text-red-700 space-y-1">
            {errorList.map(([field, error]) => (
              <li key={field} className="flex items-start gap-2">
                <span className="w-1 h-1 bg-red-600 rounded-full mt-2 flex-shrink-0" />
                <span>{error}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default {
  useMobileFormValidation,
  validationRules,
  MobileFormField,
  MobileFormSection,
  MobileFormActions,
  MobileFormErrorSummary
};