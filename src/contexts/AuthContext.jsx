import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../../services/supabaseClient.js'
import { useIsAdmin } from '../utils/adminUtils'
import { readAuthLinkError, describeMagicLinkError, describeEmailRateLimit } from '../utils/magicLink.js'
import { RESET_PASSWORD_PATH, isRecoveryLanding } from '../utils/passwordReset.js'

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
  /**
   * True from a password-reset link until a new password has been saved.
   *
   * A recovery link is a login: Supabase hands the browser a full session the
   * moment it is clicked, and before 2026-09-04 that was the end of the story
   * — `/reset-password` had no route, the visitor bounced to the default tab
   * signed in, and the password they had forgotten stayed forgotten. The
   * audit log showed five such logins and not one password change after
   * them, which is what the "I got in through Forgot Password" reports were.
   *
   * While this is true, App.jsx renders <ResetPasswordPage /> in place of the
   * tabs. It is component state and nothing else: the session is a real one
   * either way (the database cannot tell a recovery session from a password
   * one), so a reload after abandoning the page leaves the visitor signed in
   * exactly as the link did. The page offers "sign out instead" for that.
   */
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(() => isRecoveryLanding())

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

        // The link's own announcement, for the case the path check above
        // did not cover: a link opened while the app was already mounted.
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecoveryPending(true)
        }

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


      // No session back means Supabase sent a confirmation email; the
      // popover uses `emailSent` to decide whether to talk about inboxes.
      if (data.user && !data.session) {
        return {
          success: true,
          user: data.user,
          emailSent: true,
          message: 'Please check your email to confirm your account. The league admin will then approve it.'
        }
      }

      return { success: true, user: data.user, emailSent: false }
    } catch (error) {
      return { success: false, error: describeEmailRateLimit(error) || error.message }
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
        redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
      })
      
      if (error) {
        throw error
      }
      
      return { success: true, message: 'Password reset email sent' }
    } catch (error) {
      return { success: false, error: describeEmailRateLimit(error) || error.message }
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

  /**
   * Set a new password, and sign out every *other* session.
   *
   * Sessions here never expire on their own (the audit of 2026-09-04 found a
   * live one from the previous September), so "I changed my password" has to
   * be what ends a session on a lost phone or a shared laptop — nothing else
   * will. `scope: 'others'` keeps this browser signed in; the revocation is
   * best-effort, because a password that saved is a password that saved, and
   * a blip on the follow-up call should not read as "try again" and send the
   * member into a loop of resetting a password that already took.
   *
   * Also ends a pending recovery: setting the password is what the reset
   * link was for.
   */
  const updatePassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        throw error
      }

      let othersSignedOut = true
      try {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
        if (signOutError) othersSignedOut = false
      } catch {
        othersSignedOut = false
      }

      setPasswordRecoveryPending(false)
      return { success: true, othersSignedOut }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Leave a recovery without setting a password. The only honest way to do
   * that is to drop the session the link created: the alternative — staying
   * signed in with the old, forgotten password — is the state this page
   * exists to prevent. Wraps `signOut` so the page has one verb.
   */
  const abandonPasswordRecovery = async () => {
    const result = await signOut()
    setPasswordRecoveryPending(false)
    return result
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
    passwordRecoveryPending,
    abandonPasswordRecovery,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}