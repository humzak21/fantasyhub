import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../../src/contexts/AuthContext.jsx'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { User, LogIn, Mail, Lock, CheckCircle, ArrowLeft } from 'lucide-react'

export const MobileLoginForm = ({ onBack, onSuccess }) => {
  const { signIn, signUp } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [formData, setFormData] = useState({ email: '', password: '', name: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  // Refs for form fields
  const nameInputRef = useRef(null)
  const emailInputRef = useRef(null)
  const passwordInputRef = useRef(null)

  // Auto-focus the first field when switching modes
  useEffect(() => {
    if (!showSuccessMessage) {
      const timer = setTimeout(() => {
        if (isSignUp && nameInputRef.current) {
          nameInputRef.current.focus()
        } else if (emailInputRef.current) {
          emailInputRef.current.focus()
        }
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [isSignUp, showSuccessMessage])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = isSignUp
        ? await signUp(formData.email, formData.password, formData.name)
        : await signIn(formData.email, formData.password)

      if (result.success) {
        if (isSignUp) {
          const message = result.message || 'Account created successfully! You can now sign in.'
          setSuccessMessage(message)
          setShowSuccessMessage(true)
          setFormData({ email: '', password: '', name: '' })
          setIsSignUp(false)
        } else {
          // Normal sign in success
          onSuccess?.()
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

  const resetForm = () => {
    setFormData({ email: '', password: '', name: '' })
    setError('')
  }

  const handleBackClick = () => {
    resetForm()
    onBack?.()
  }

  const handleSuccessComplete = () => {
    setShowSuccessMessage(false)
    setSuccessMessage('')
    onSuccess?.()
  }

  if (showSuccessMessage) {
    return (
      <div className="p-4">
        <Card>
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
                onClick={handleSuccessComplete}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                Got it!
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center space-x-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackClick}
              className="p-1 h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle className={`text-lg transition-colors ${isSignUp ? 'text-green-600' : 'text-blue-600'}`}>
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </CardTitle>
          </div>
          <CardDescription>
            {isSignUp
              ? 'Start tracking your fantasy football power rankings'
              : 'Sign in to your fantasy football dashboard'
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="mobile-name" className="text-green-700 font-medium">Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-green-500" />
                  <Input
                    ref={nameInputRef}
                    id="mobile-name"
                    type="text"
                    placeholder="Enter your name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="pl-10 border-green-200 focus:border-green-500 focus:ring-green-500"
                    required={isSignUp}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="mobile-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={emailInputRef}
                  id="mobile-email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile-password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={passwordInputRef}
                  id="mobile-password"
                  type="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="pl-10"
                  required
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
            >
              {isSignUp
                ? '← Already have an account? Sign in'
                : "Don't have an account? Sign up →"
              }
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}