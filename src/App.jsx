import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import FantasyFootballApp from '../FantasyFootballApp.jsx'
import MobileFantasyFootballApp from './components/mobile/MobileFantasyFootballApp.jsx'
import { UserSettingsPage } from './components/auth/UserSettingsPage.jsx'
import { useAuth } from './contexts/AuthContext.jsx'
import { useMobileDetection, setMobileViewport, getMobileClasses } from '../utils/mobileDetection.js'
import ErrorBoundary from '../utils/errorBoundary.jsx'

function App() {
  const { loading } = useAuth()
  const { isMobile, deviceInfo } = useMobileDetection()

  // Set up mobile viewport and meta tags
  useEffect(() => {
    if (isMobile) {
      setMobileViewport()
      
      // Add mobile-specific classes to body
      const mobileClasses = getMobileClasses(deviceInfo)
      document.body.className = `${document.body.className} ${mobileClasses}`.trim()
      
      return () => {
        // Cleanup mobile classes on unmount or when switching to desktop
        const classesToRemove = getMobileClasses(deviceInfo).split(' ')
        classesToRemove.forEach(className => {
          document.body.classList.remove(className)
        })
      }
    }
  }, [isMobile, deviceInfo])

  // Show loading screen while auth is initializing
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading Fantasy Football Power Rankings...</p>
        </div>
      </div>
    )
  }

  // Conditional rendering based on mobile detection
  const AppComponent = isMobile ? MobileFantasyFootballApp : FantasyFootballApp

  return (
    <Routes>
      {/* Main route - show appropriate app version based on device */}
      <Route
        path="/"
        element={<AppComponent />}
      />

      {/* User Settings Page */}
      <Route
        path="/settings"
        element={
          <ErrorBoundary key="settings-error-boundary">
            <UserSettingsPage />
          </ErrorBoundary>
        }
      />

      {/* Legacy routes - redirect to main */}
      <Route
        path="/overview"
        element={<Navigate to="/" replace />}
      />
      <Route
        path="/fantasy"
        element={<Navigate to="/" replace />}
      />

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App