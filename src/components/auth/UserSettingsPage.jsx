import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { supabase } from '../../../services/supabaseClient.js'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Alert, AlertDescription } from '../ui/alert'
import { User, Save, CheckCircle, AlertCircle, ArrowLeft, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export const UserSettingsPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize display name from user metadata
  useEffect(() => {
    if (user) {
      const currentDisplayName = user.user_metadata?.full_name || user.user_metadata?.name || ''
      setDisplayName(currentDisplayName)
      setHasChanges(false)
    }
  }, [user])

  // Clear message after a few seconds
  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ type: '', text: '' })
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [message])

  const handleDisplayNameChange = (value) => {
    setDisplayName(value)
    const currentDisplayName = user?.user_metadata?.full_name || user?.user_metadata?.name || ''
    setHasChanges(value.trim() !== currentDisplayName)
    setMessage({ type: '', text: '' })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!displayName.trim()) {
      setMessage({ type: 'error', text: 'Full name cannot be empty' })
      return
    }

    setLoading(true)
    setMessage({ type: '', text: '' })

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: displayName.trim(),
          name: displayName.trim() // Keep both for backwards compatibility
        }
      })

      if (error) {
        throw error
      }

      setMessage({
        type: 'success',
        text: 'Full name updated successfully! This will help match you with your team in the league.'
      })
      setHasChanges(false)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to update full name. Please try again.'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate(-1)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-gray-600">Please sign in to access user settings.</p>
            <Button onClick={handleBack} className="mt-4">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Settings className="h-6 w-6" />
              <h1 className="text-2xl font-bold">User Settings</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Sidebar Navigation (for future expansion) */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="ghost" className="w-full justify-start" disabled>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Main Settings Panel */}
          <div className="md:col-span-2 space-y-6">
            {/* Profile Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>
                  Update your profile information. Your full name helps us match you with your team in the league.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="displayName">
                      Full Name <span className="text-sm text-gray-500">(First Last)</span>
                    </Label>
                    <Input
                      id="displayName"
                      type="text"
                      placeholder="Enter your full name (e.g., John Smith)"
                      value={displayName}
                      onChange={(e) => handleDisplayNameChange(e.target.value)}
                      className="max-w-md"
                    />
                    <p className="text-sm text-gray-500">
                      We use your full name to match you with your team in the league. Please use your real name as it appears in your fantasy league.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="max-w-md bg-gray-50 text-gray-500"
                    />
                    <p className="text-sm text-gray-500">
                      Email cannot be changed from here. Contact support if you need to update your email.
                    </p>
                  </div>

                  {message.text && (
                    <Alert className={`max-w-md ${message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                      <div className="flex items-center gap-2">
                        {message.type === 'error' ? (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        <AlertDescription className={message.type === 'error' ? 'text-red-700' : 'text-green-700'}>
                          {message.text}
                        </AlertDescription>
                      </div>
                    </Alert>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button
                      type="submit"
                      disabled={loading || !hasChanges}
                      className="flex items-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {loading ? 'Saving...' : 'Save Changes'}
                    </Button>
                    {hasChanges && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const currentDisplayName = user?.user_metadata?.full_name || user?.user_metadata?.name || ''
                          setDisplayName(currentDisplayName)
                          setHasChanges(false)
                          setMessage({ type: '', text: '' })
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Account Information */}
            <Card>
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>
                  View your account details and status.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-gray-600">Account Created</p>
                    <p>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600">Last Sign In</p>
                    <p>{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600">Email Verified</p>
                    <p>{user?.email_confirmed_at ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600">User ID</p>
                    <p className="font-mono text-xs">{user?.id?.slice(0, 8)}...</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}