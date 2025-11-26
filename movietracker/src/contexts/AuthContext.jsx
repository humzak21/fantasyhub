import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabase';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if supabase is available
    if (!supabase) {
      console.warn('Supabase not configured. Authentication will not work.');
      console.warn('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
      console.warn('VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Not set');
      setLoading(false);
      return;
    }

    console.log('Supabase client initialized successfully');

    // Get initial session
    const getInitialSession = async () => {
      try {
        console.log('Getting initial session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error getting session:', error);
          setError(error.message);
        } else {
          console.log('Initial session:', session ? 'Found' : 'None');
          setUser(session?.user ?? null);
        }
      } catch (err) {
        console.error('Error in getInitialSession:', err);
        setError('Failed to initialize authentication');
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        setUser(session?.user ?? null);
        setLoading(false);
        setError(null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      
      if (!supabase) {
        throw new Error('Supabase not configured');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      return { data, error: null };
    } catch (err) {
      console.error('Sign up error:', err);
      setError(err.message);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      
      console.log('SignIn: Starting authentication process...');
      
      if (!supabase) {
        console.error('SignIn: Supabase client not available');
        throw new Error('Supabase not configured');
      }

      console.log('SignIn: Calling supabase.auth.signInWithPassword...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('SignIn: Response received', { 
        hasData: !!data, 
        hasUser: !!data?.user, 
        hasSession: !!data?.session,
        error: error?.message 
      });

      if (error) {
        console.error('SignIn: Authentication error:', error);
        throw error;
      }

      console.log('SignIn: Authentication successful');
      return { data, error: null };
    } catch (err) {
      console.error('SignIn: Caught error:', err);
      console.error('SignIn: Error details:', {
        message: err.message,
        name: err.name,
        stack: err.stack
      });
      setError(err.message);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      
      if (!supabase) {
        throw new Error('Supabase not configured');
      }

      const { error } = await supabase.auth.signOut();
      
      if (error) {
        throw error;
      }
    } catch (err) {
      console.error('Sign out error:', err);
      setError(err.message);
    }
  };

  const resetPassword = async (email) => {
    try {
      setError(null);
      
      if (!supabase) {
        throw new Error('Supabase not configured');
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      return { error: null };
    } catch (err) {
      console.error('Reset password error:', err);
      setError(err.message);
      return { error: err };
    }
  };

  const value = {
    user,
    loading,
    error,
    signUp,
    signIn,
    signOut,
    resetPassword,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 