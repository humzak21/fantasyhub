import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../../services/supabaseClient.js'
import { useIsAdmin } from '../utils/adminUtils'
import { readAuthLinkError, describeMagicLinkError } from '../utils/magicLink.js'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Set once at mount when the URL carries a failed magic link; see
  // readAuthLinkError. Cleared by the login popover once it has shown it.
  const [authLinkError, setAuthLinkError] = useState(() =>
    typeof window === 'undefined' ? null : readAuthLinkError(window.location.hash)
  )

  // Initialize auth state from Supabase
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if supabase client is initialized
        if (!supabase || !supabase.auth) {
          console.error('Supabase client not initialized')
          setLoading(false)
          return
        }

        // Get initial session
        const { data: { session }, error } = await supabase.auth.getSession()
        if (!error && session?.user) {
          setUser(session.user)
        }
      } catch {
        // A session that cannot be read is a signed-out viewer.
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()

    // A failed link's fragment has been read into state; leave the address
    // bar clean so a reload does not re-report it. A successful link's
    // fragment is stripped by supabase-js itself.
    if (typeof window !== 'undefined' && readAuthLinkError(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    // Listen for auth changes only if supabase is initialized
    if (!supabase || !supabase.auth) {
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setLoading(false)
        
        if (session?.user) {
          setUser(session.user)
        } else {
          setUser(null)
        }
      }
    )

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  const signIn = async (email, password) => {
    try {
      if (!supabase || !supabase.auth) {
        return { success: false, error: 'Authentication service not available' }
      }

      setLoading(true)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) {
        throw error
      }
      
      return { success: true, user: data.user }
    } catch (error) {
      return { success: false, error: error.message }
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email, password, name = '') => {
    try {
      setLoading(true)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: undefined, // Prevent redirect
          data: {
            name: name.trim(),
            full_name: name.trim() // Keep both for consistency
          }
        }
      })

      if (error) {
        throw error
      }


      // Check if user needs to confirm email
      if (data.user && !data.session) {
        return {
          success: true,
          user: data.user,
          message: 'Please check your email to confirm your account'
        }
      }

      return { success: true, user: data.user }
    } catch (error) {
      return { success: false, error: error.message }
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        throw error
      }
      
      setUser(null)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      
      if (error) {
        throw error
      }
      
      return { success: true, message: 'Password reset email sent' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Email a one-time login link. Nothing here touches `loading`: App.jsx
   * swaps the whole tree for a spinner while it is true, which would unmount
   * the popover mid-request. The popover carries its own busy flag, as the
   * forgot-password path does.
   *
   * `shouldCreateUser: false` — this league is a fixed set of people, so an
   * unknown address is a typo or a stranger, not a sign-up. The redirect is
   * the page the link was requested from, and it is only honoured if the
   * origin is in the Supabase dashboard's redirect allowlist (see CLAUDE.md).
   */
  const signInWithMagicLink = async (email) => {
    try {
      if (!supabase || !supabase.auth) {
        return { success: false, error: 'Authentication service not available' }
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        },
      })

      if (error) {
        return { success: false, error: describeMagicLinkError(error) }
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: describeMagicLinkError(error) }
    }
  }

  const clearAuthLinkError = () => setAuthLinkError(null)

  const updatePassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        throw error
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  const updateProfile = async (profileData) => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: profileData
      })

      if (error) {
        throw error
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Check if current user is admin
  const isAdmin = useIsAdmin(user)
  const isAuthenticated = !!user

  const value = {
    user,
    loading,
    isAuthenticated,
    isAdmin,
    signIn,
    signUp,
    signOut,
    signInWithMagicLink,
    authLinkError,
    clearAuthLinkError,
    resetPassword,
    updatePassword,
    updateProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}