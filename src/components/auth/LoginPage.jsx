import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../src/contexts/AuthContext.jsx'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Trophy, Mail, Lock, User } from 'lucide-react'

export const LoginPage = () => {
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  
  const { signIn, signUp, resetPassword } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      let result
      
      if (isForgotPassword) {
        result = await resetPassword(formData.email)
        if (result.success) {
          setMessage(result.message || 'Password reset email sent!')
          setIsForgotPassword(false)
        } else {
          setError(result.error || 'Failed to send reset email')
        }
      } else {
        result = isSignUp
          ? await signUp(formData.email, formData.password, formData.name)
          : await signIn(formData.email, formData.password)

        if (result.success) {
          if (result.message) {
            setMessage(result.message)
          } else {
            navigate('/overview')
          }
        } else {
          setError(result.error || 'Authentication failed')
        }
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
    if (message) setMessage('')
  }
  
  const resetForm = () => {
    setFormData({ email: '', password: '', name: '' })
    setError('')
    setMessage('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
      
      <div className="relative min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md glass-effect border-white/20 text-white">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
              <Trophy className="h-8 w-8 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                {isForgotPassword ? 'Reset Password' : isSignUp ? 'Create Account' : 'Welcome Back'}
              </CardTitle>
              <CardDescription className="text-white/70 mt-2">
                {isForgotPassword 
                  ? 'Enter your email to receive a password reset link'
                  : isSignUp 
                    ? 'Start tracking your fantasy football power rankings'
                    : 'Sign in to your fantasy football dashboard'
                }
              </CardDescription>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && !isForgotPassword && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-white/90">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter your name"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50"
                      required={isSignUp}
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/90">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    required
                  />
                </div>
              </div>
              
              {!isForgotPassword && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white/90">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50"
                      required
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <p className="text-red-200 text-sm">{error}</p>
                </div>
              )}

              {message && (
                <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
                  <p className="text-green-200 text-sm">{message}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shadow-blue-500/25"
              >
                {loading 
                  ? 'Please wait...' 
                  : isForgotPassword 
                    ? 'Send Reset Email'
                    : isSignUp 
                      ? 'Create Account' 
                      : 'Sign In'
                }
              </Button>
            </form>

            <div className="text-center space-y-3">
              {isForgotPassword ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsForgotPassword(false)
                    resetForm()
                  }}
                  className="text-white/70 hover:text-white hover:bg-white/10"
                >
                  Back to Sign In
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setIsSignUp(!isSignUp)
                      resetForm()
                    }}
                    className="text-white/70 hover:text-white hover:bg-white/10"
                  >
                    {isSignUp 
                      ? 'Already have an account? Sign in' 
                      : "Don't have an account? Sign up"
                    }
                  </Button>
                  
                  {!isSignUp && (
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setIsForgotPassword(true)
                          resetForm()
                        }}
                        className="text-white/70 hover:text-white hover:bg-white/10 text-sm"
                      >
                        Forgot your password?
                      </Button>
                    </div>
                  )}
                </>
              )}
              
              {/* Add Browse as Guest option */}
              <div className="pt-4 border-t border-white/10">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/fantasy')}
                  className="w-full bg-transparent border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Browse as Guest
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}