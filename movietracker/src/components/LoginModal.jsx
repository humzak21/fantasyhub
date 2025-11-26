import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Mail, Lock, User, X } from 'lucide-react';

const LoginModal = ({ isOpen, onClose }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const { signIn, signUp, loading, error } = useAuth();
  const location = useLocation();

  // Handle body overflow when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsSignUp(false);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setLocalError('');
      setSuccessMessage('');
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setSuccessMessage('');

    console.log('Login attempt started...'); // Debug log

    if (isSignUp) {
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters long');
        return;
      }

      console.log('Attempting sign up...'); // Debug log
      const { data, error } = await signUp(email, password);
      if (error) {
        console.error('Sign up error:', error); // Debug log
        setLocalError(error.message || 'Sign up failed. Please try again.');
      } else {
        console.log('Sign up successful:', data); // Debug log
        setSuccessMessage('Account created successfully! Please check your email to verify your account.');
        setIsSignUp(false);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      }
    } else {
      console.log('Attempting sign in...'); // Debug log
      const { data, error } = await signIn(email, password);
      if (error) {
        console.error('Sign in error:', error); // Debug log
        setLocalError(error.message || 'Sign in failed. Please try again.');
      } else {
        console.log('Sign in successful:', data); // Debug log
        // Close modal on successful login - user stays on current page
        onClose();
      }
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setLocalError('');
    setSuccessMessage('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleClose = () => {
    setLocalError('');
    setSuccessMessage('');
    onClose();
  };

  if (!isOpen) return null;

  // Add error boundary logging
  try {
    return (
      <div className="login-modal-overlay" onClick={handleClose}>
        <div className="login-modal" onClick={(e) => e.stopPropagation()}>
          <button className="login-modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
          
          <div className="login-modal-header">
            <h2>{isSignUp ? 'Create Account' : 'Sign In'}</h2>
            <p>
              {isSignUp ? 'Join MovieTracker to start your journey' : 'Welcome back to MovieTracker'}
            </p>
          </div>

          <form className="login-modal-form" onSubmit={handleSubmit}>
            <div className="login-form-group">
              <label htmlFor="email">Email</label>
              <div className="login-input-wrapper">
                <Mail className="login-input-icon" size={18} />
                <input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="login-form-group">
              <label htmlFor="password">Password</label>
              <div className="login-input-wrapper">
                <Lock className="login-input-icon" size={18} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div className="login-form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <div className="login-input-wrapper">
                  <Lock className="login-input-icon" size={18} />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {(error || localError) && (
              <div className="login-error">
                {localError || error}
              </div>
            )}

            {successMessage && (
              <div className="login-success">
                {successMessage}
              </div>
            )}

            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <div className="login-loading-spinner"></div>
              ) : (
                <>
                  <User size={18} />
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </>
              )}
            </button>

            {!isSignUp && (
              <Link to="/forgot-password" className="login-forgot-link" onClick={handleClose}>
                Forgot your password?
              </Link>
            )}
          </form>

          <div className="login-modal-footer">
            <p>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                className="login-toggle-btn"
                onClick={toggleMode}
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    console.error('LoginModal render error:', err);
    return (
      <div className="login-modal-overlay" onClick={handleClose}>
        <div className="login-modal">
          <div className="login-error">
            Something went wrong. Please refresh the page and try again.
          </div>
        </div>
      </div>
    );
  }
};

export default LoginModal; 