import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../../src/contexts/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { User, LogIn, LogOut, Mail, Lock, CheckCircle, Settings, Wand2 } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * The popover has four faces, one `mode` at a time. Each carries one accent:
 * sign-in is the primary (warm: *yours*, *act*), sign-up is `success`, and the
 * two email-a-link faces — password reset and magic link — share `warning`,
 * because both end the same way: "go check your inbox".
 */
const MODE = {
  signIn: {
    title: 'Welcome Back',
    description: 'Sign in to your fantasy football dashboard',
    accent: 'text-primary',
    fill: 'bg-primary text-primary-foreground hover:bg-primary/90',
  },
  signUp: {
    title: 'Create Account',
    description: 'Ask to join the league. New accounts are approved by the admin once you confirm your email.',
    accent: 'text-success',
    fill: 'bg-success text-success-foreground hover:bg-success/90',
  },
  forgot: {
    title: 'Reset Password',
    description: 'Enter your email to receive a password reset link',
    accent: 'text-warning',
    fill: 'bg-warning text-warning-foreground hover:bg-warning/90',
  },
  magic: {
    title: 'Email Me a Login Link',
    description: 'No password needed. We will email you a link that signs you in.',
    accent: 'text-warning',
    fill: 'bg-warning text-warning-foreground hover:bg-warning/90',
  },
}

const EMPTY_FORM = { email: '', password: '', name: '' }

const ErrorBox = ({ message }) =>
  message ? (
    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg" role="alert">
      <p className="text-destructive text-sm">{message}</p>
    </div>
  ) : null

/**
 * Shown wherever an email has just been sent. The built-in mailer is slow,
 * rate-limited and lands in spam often enough that "nothing arrived" is the
 * common support question; answering it here is cheaper than answering it in
 * the group chat.
 */
export const EmailSentNote = () => (
  <p className="text-xs text-muted-foreground px-2" data-testid="email-sent-note">
    Emails can take a minute to arrive and may land in your spam folder.
    Sends are rate-limited, so if nothing turns up, wait a minute before
    trying again.
  </p>
)

/** The "check your inbox" panel both email-a-link faces end on. */
const SentPanel = ({ title, children, onDone, accent = 'text-warning' }) => (
  <div className="text-center space-y-4 py-4">
    <CheckCircle className={cn('h-12 w-12 mx-auto', accent)} />
    <div className="space-y-2">
      <h3 className={cn('text-lg font-semibold', accent)}>{title}</h3>
      <p className="text-sm text-muted-foreground px-2">{children}</p>
      <EmailSentNote />
    </div>
    <Button onClick={onDone} className="w-full" variant="outline" tabIndex={1}>
      Done
    </Button>
  </div>
)

export const LoginDropdown = () => {
  const {
    user, signIn, signUp, signOut, resetPassword,
    signInWithMagicLink, authLinkError, clearAuthLinkError,
  } = useAuth()
  const navigate = useNavigate()
  const [showLoginForm, setShowLoginForm] = useState(false)
  const [mode, setMode] = useState('signIn')
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [resetEmail, setResetEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSuccessMessage, setShowSuccessMessage] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('showSignUpSuccess') === 'true'
    }
    return false
  })
  const [successMessage, setSuccessMessage] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('signUpSuccessMessage') || ''
    }
    return ''
  })
  // Whether sign-up sent a confirmation email. Only then does the success
  // panel talk about inboxes; a sign-up that came back with a session sent
  // nothing, and telling that member to check spam would be a wild goose.
  const [signUpEmailSent, setSignUpEmailSent] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('signUpEmailSent') === 'true'
    }
    return false
  })
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false)
  // The address a magic link went to; non-empty means "show the sent panel".
  const [magicLinkSentTo, setMagicLinkSentTo] = useState('')

  const isSignUp = mode === 'signUp'
  const face = MODE[mode]

  // Refs for form fields
  const nameInputRef = useRef(null)
  const emailInputRef = useRef(null)
  const passwordInputRef = useRef(null)

  // Auto-focus the first field when the form opens
  useEffect(() => {
    if (showLoginForm && !showSuccessMessage) {
      const timer = setTimeout(() => {
        if (isSignUp && nameInputRef.current) {
          nameInputRef.current.focus()
        } else if (emailInputRef.current) {
          emailInputRef.current.focus()
        }
      }, 100) // Small delay to ensure dropdown is rendered

      return () => clearTimeout(timer)
    }
  }, [showLoginForm, showSuccessMessage, isSignUp])

  // A magic link that failed (expired, already used) lands the member here
  // signed out. Open on the magic-link face with the reason showing, so the
  // remedy — request another — is the form already in front of them.
  useEffect(() => {
    if (authLinkError && !user) {
      setMode('magic')
      setError(authLinkError)
      setShowLoginForm(true)
    }
  }, [authLinkError, user])

  const dismissLinkError = () => {
    if (authLinkError) clearAuthLinkError?.()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    e.stopPropagation() // Prevent event bubbling
    setLoading(true)
    setError('')

    try {
      const result = isSignUp
        ? await signUp(formData.email, formData.password, formData.name)
        : await signIn(formData.email, formData.password)

      if (result.success) {
        if (isSignUp) {
          // Set success message immediately
          const message = result.message || 'Account created successfully! You can now sign in.'
          setSuccessMessage(message)
          setSignUpEmailSent(Boolean(result.emailSent))
          setShowSuccessMessage(true)

          // Persist to localStorage in case of page refresh
          localStorage.setItem('signUpSuccessMessage', message)
          localStorage.setItem('showSignUpSuccess', 'true')
          localStorage.setItem('signUpEmailSent', result.emailSent ? 'true' : 'false')

          // Small delay to ensure popup renders before other state changes
          setTimeout(() => {
            setFormData(EMPTY_FORM)
            setMode('signIn')
          }, 100)
        } else {
          // Normal sign in success
          setShowLoginForm(false)
          setFormData(EMPTY_FORM)
        }
      } else {
        setError(result.error || 'Authentication failed')
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (error) setError('')
    dismissLinkError()
  }

  const handleKeyDown = (e, nextFieldRef) => {
    if (e.key === 'Tab' && !e.shiftKey && nextFieldRef && nextFieldRef.current) {
      e.preventDefault()
      nextFieldRef.current.focus()
    }
  }

  const resetForm = () => {
    setFormData(EMPTY_FORM)
    setError('')
  }

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (!resetEmail.trim()) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await resetPassword(resetEmail)

      if (result.success) {
        setResetPasswordSuccess(true)
        setResetEmail('')
      } else {
        setError(result.error || 'Failed to send password reset email')
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleMagicLinkSubmit = async (e) => {
    e.preventDefault()
    e.stopPropagation()

    const email = formData.email.trim()
    if (!email) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    setError('')
    dismissLinkError()

    try {
      const result = await signInWithMagicLink(email)
      if (result.success) {
        setMagicLinkSentTo(email)
      } else {
        setError(result.error || 'Failed to send a login link')
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleBackToLogin = () => {
    setMode('signIn')
    setResetEmail('')
    setError('')
    setResetPasswordSuccess(false)
    setMagicLinkSentTo('')
    dismissLinkError()
  }

  const closePopover = () => {
    setShowLoginForm(false)
    setMagicLinkSentTo('')
    setResetPasswordSuccess(false)
    setMode('signIn')
    setError('')
    dismissLinkError()
  }

  const handleOpenChange = (open) => {
    if (open) {
      setShowLoginForm(true)
    } else {
      closePopover()
    }
  }

  // Show success popup even if user is logged in (after sign up)
  if (showSuccessMessage) {
    return (
      <Popover open={true} onOpenChange={() => {}}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <LogIn className="mr-2 h-4 w-4" />
            Success
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="text-center space-y-4 py-4">
                <CheckCircle className="h-12 w-12 text-success mx-auto" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-success">Account Created!</h3>
                  <p className="text-sm text-muted-foreground px-2">
                    {successMessage}
                  </p>
                  {signUpEmailSent && <EmailSentNote />}
                </div>
                <Button
                  onClick={() => {
                    setShowSuccessMessage(false)
                    setSuccessMessage('')
                    setSignUpEmailSent(false)
                    // Clear localStorage
                    localStorage.removeItem('showSignUpSuccess')
                    localStorage.removeItem('signUpSuccessMessage')
                    localStorage.removeItem('signUpEmailSent')
                  }}
                  className={cn('w-full', MODE.signUp.fill)}
                >
                  Got it!
                </Button>
              </div>
            </CardContent>
          </Card>
        </PopoverContent>
      </Popover>
    )
  }

  if (user) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {user.user_metadata?.full_name ? user.user_metadata.full_name.charAt(0).toUpperCase() : user.user_metadata?.name ? user.user_metadata.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <div className="flex items-center justify-start gap-2 p-2">
              <div className="flex flex-col space-y-1 leading-none">
                <p className="font-medium">{user.user_metadata?.full_name || user.user_metadata?.name || 'User'}</p>
                <p className="w-[200px] truncate text-sm text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </div>
            <DropdownMenuSeparator />
            {/* The theme submenu is gone. It offered exactly one option —
                "Dark", already selected, calling a function whose body was a
                comment — beside two more that were commented out. A menu with
                one inert choice is not a setting; the app is dark by design.
                See src/contexts/DarkModeContext.jsx. */}
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )
  }

  const backToSignIn = (
    <div className="text-center border-t pt-4">
      <Button
        type="button"
        variant="ghost"
        onClick={handleBackToLogin}
        className="text-sm font-medium text-primary hover:text-primary"
        tabIndex={3}
      >
        ← Back to Sign In
      </Button>
    </div>
  )

  return (
    <Popover open={showLoginForm} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <LogIn className="mr-2 h-4 w-4" />
          Login
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className={cn('text-lg transition-colors', face.accent)}>
              {face.title}
            </CardTitle>
            <CardDescription>{face.description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {resetPasswordSuccess ? (
              <SentPanel title="Email Sent!" onDone={closePopover}>
                Check your email for a password reset link.
              </SentPanel>
            ) : magicLinkSentTo ? (
              <SentPanel title="Check your email" onDone={closePopover}>
                We sent a login link to <span className="text-foreground">{magicLinkSentTo}</span>.
                It expires in an hour and works on any device. Click it and you are in.
              </SentPanel>
            ) : mode === 'forgot' ? (
              <>
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="Enter your email"
                        value={resetEmail}
                        onChange={(e) => {
                          setResetEmail(e.target.value)
                          if (error) setError('')
                        }}
                        className="pl-10"
                        required
                        tabIndex={1}
                        autoFocus
                      />
                    </div>
                  </div>

                  <ErrorBox message={error} />

                  <Button
                    type="submit"
                    disabled={loading}
                    className={cn('w-full', face.fill)}
                    tabIndex={2}
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </Button>
                </form>

                {backToSignIn}
              </>
            ) : mode === 'magic' ? (
              <>
                <form onSubmit={handleMagicLinkSubmit} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="magic-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={emailInputRef}
                        id="magic-email"
                        type="email"
                        placeholder="Enter your email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className="pl-10"
                        required
                        tabIndex={1}
                      />
                    </div>
                  </div>

                  <ErrorBox message={error} />

                  <Button
                    type="submit"
                    disabled={loading}
                    className={cn('w-full', face.fill)}
                    tabIndex={2}
                  >
                    {loading ? 'Sending...' : 'Send Login Link'}
                  </Button>
                </form>

                {backToSignIn}
              </>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className={`transition-all duration-300 ${
                    isSignUp ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden'
                  }`}>
                    <div className="space-y-2 pb-3">
                      <Label htmlFor="name" className="text-success font-medium">Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-success" />
                        <Input
                          ref={nameInputRef}
                          id="name"
                          type="text"
                          placeholder="Enter your name"
                          value={formData.name}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, emailInputRef)}
                          className="pl-10"
                          required={isSignUp}
                          tabIndex={isSignUp ? 1 : -1}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={emailInputRef}
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, passwordInputRef)}
                        className="pl-10"
                        required
                        tabIndex={isSignUp ? 2 : 1}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={passwordInputRef}
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        className="pl-10"
                        required
                        tabIndex={isSignUp ? 3 : 2}
                      />
                    </div>
                  </div>

                  <ErrorBox message={error} />

                  <Button
                    type="submit"
                    disabled={loading}
                    className={cn('w-full transition-colors', face.fill)}
                    tabIndex={isSignUp ? 4 : 3}
                  >
                    {loading
                      ? 'Please wait...'
                      : isSignUp
                        ? 'Create Account'
                        : 'Sign In'
                    }
                  </Button>
                </form>

                <div className="space-y-1 border-t pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMode(isSignUp ? 'signIn' : 'signUp')
                      resetForm()
                    }}
                    className={cn(
                      'w-full text-sm font-medium transition-colors',
                      isSignUp ? 'text-primary hover:text-primary' : 'text-success hover:text-success'
                    )}
                    tabIndex={isSignUp ? 5 : 4}
                  >
                    {isSignUp
                      ? '← Already have an account? Sign in'
                      : "Don't have an account? Sign up →"
                    }
                  </Button>
                  {!isSignUp && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setMode('forgot')
                          setError('')
                        }}
                        className="w-full text-sm font-medium text-warning hover:text-warning"
                        tabIndex={5}
                      >
                        Forgot Password?
                      </Button>
                      {/* The email typed above carries across, so a member who
                          reached for the password field and thought better of
                          it is one click from a link. */}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setMode('magic')
                          setError('')
                        }}
                        className="w-full text-sm font-medium text-warning hover:text-warning"
                        tabIndex={6}
                      >
                        <Wand2 className="h-4 w-4" />
                        Email me a login link
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  )
}
