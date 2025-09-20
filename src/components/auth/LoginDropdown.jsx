import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../../src/contexts/AuthContext.jsx'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { User, LogIn, LogOut, UserPlus, Mail, Lock, CheckCircle } from 'lucide-react'

export const LoginDropdown = () => {
  const { user, signIn, signUp, signOut } = useAuth()
  const [showLoginForm, setShowLoginForm] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [formData, setFormData] = useState({ email: '', password: '', name: '' })
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
          setShowSuccessMessage(true)

          // Persist to localStorage in case of page refresh
          localStorage.setItem('signUpSuccessMessage', message)
          localStorage.setItem('showSignUpSuccess', 'true')

          // Small delay to ensure popup renders before other state changes
          setTimeout(() => {
            setFormData({ email: '', password: '', name: '' })
            setIsSignUp(false)
          }, 100)
        } else {
          // Normal sign in success
          setShowLoginForm(false)
          setFormData({ email: '', password: '', name: '' })
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
  }

  const handleKeyDown = (e, nextFieldRef) => {
    if (e.key === 'Tab' && !e.shiftKey && nextFieldRef && nextFieldRef.current) {
      e.preventDefault()
      nextFieldRef.current.focus()
    }
  }

  const resetForm = () => {
    setFormData({ email: '', password: '', name: '' })
    setError('')
  }

  // Show success popup even if user is logged in (after sign up)
  if (showSuccessMessage) {
    return (
      <DropdownMenu open={true} onOpenChange={() => {}}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <LogIn className="mr-2 h-4 w-4" />
            Success
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80" align="end">
          <Card className="border-0 shadow-none">
            <CardContent className="space-y-4 p-6">
              <div className="text-center space-y-4 py-4">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-green-700">Account Created!</h3>
                  <p className="text-sm text-gray-600 px-2">
                    {successMessage}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setShowSuccessMessage(false)
                    setSuccessMessage('')
                    // Clear localStorage
                    localStorage.removeItem('showSignUpSuccess')
                    localStorage.removeItem('signUpSuccessMessage')
                  }}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  Got it!
                </Button>
              </div>
            </CardContent>
          </Card>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {user.user_metadata?.name ? user.user_metadata.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <div className="flex items-center justify-start gap-2 p-2">
            <div className="flex flex-col space-y-1 leading-none">
              <p className="font-medium">{user.user_metadata?.name || 'User'}</p>
              <p className="w-[200px] truncate text-sm text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu open={showLoginForm} onOpenChange={setShowLoginForm}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <LogIn className="mr-2 h-4 w-4" />
          Login
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className={`text-lg transition-colors ${isSignUp ? 'text-green-600' : 'text-blue-600'}`}>
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </CardTitle>
            <CardDescription>
              {isSignUp
                ? 'Start tracking your fantasy football power rankings'
                : 'Sign in to your fantasy football dashboard'
              }
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {showSuccessMessage ? (
              <div className="text-center space-y-4 py-4">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-green-700">Account Created!</h3>
                  <p className="text-sm text-gray-600 px-2">
                    {successMessage}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setShowSuccessMessage(false)
                    setShowLoginForm(false)
                    setSuccessMessage('')
                    // Clear localStorage
                    localStorage.removeItem('showSignUpSuccess')
                    localStorage.removeItem('signUpSuccessMessage')
                  }}
                  className="w-full bg-green-600 hover:bg-green-700"
                  tabIndex={1}
                >
                  Got it!
                </Button>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className={`transition-all duration-300 ${
                    isSignUp ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden'
                  }`}>
                    <div className="space-y-2 pb-3">
                      <Label htmlFor="name" className="text-green-700 font-medium">Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-green-500" />
                        <Input
                          ref={nameInputRef}
                          id="name"
                          type="text"
                          placeholder="Enter your name"
                          value={formData.name}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, emailInputRef)}
                          className="pl-10 border-green-200 focus:border-green-500 focus:ring-green-500"
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

                  {error && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <p className="text-destructive text-sm">{error}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading}
                    className={`w-full transition-colors ${
                      isSignUp
                        ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                        : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                    }`}
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

                <div className="text-center border-t pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setIsSignUp(!isSignUp)
                      resetForm()
                    }}
                    className={`text-sm font-medium transition-colors ${
                      isSignUp
                        ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                        : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                    }`}
                    tabIndex={isSignUp ? 5 : 4}
                  >
                    {isSignUp
                      ? '← Already have an account? Sign in'
                      : "Don't have an account? Sign up →"
                    }
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
