import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import FantasyFootballApp from '../FantasyFootballApp.jsx'
import MobileFantasyFootballApp from './components/mobile/MobileFantasyFootballApp.jsx'
import { UserSettingsPage } from './components/auth/UserSettingsPage.jsx'
import DisplayNamePrompt from './components/auth/DisplayNamePrompt.jsx'
import { useAuth } from './contexts/AuthContext.jsx'
import { useMobileDetection } from '../utils/mobileDetection.js'
import ErrorBoundary from '../utils/errorBoundary.jsx'

function App() {
  const { loading } = useAuth()
  const { isMobile } = useMobileDetection()
  const { pathname } = useLocation()

  // No viewport rewrite, no body classes. `setMobileViewport()` used to stamp
  // `user-scalable=no` (a WCAG 1.4.4 failure), and `.mobile-optimized` put a
  // `transform` on <body>, which makes the body the containing block for every
  // `position: fixed` descendant — that is what broke the nav overlay, the
  // loading overlay and the standings drawer. index.html now carries the one
  // viewport tag we want, `viewport-fit=cover` included.

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
    <>
      {/*
        One mount for both shells. It sits below the `loading` gate above so it
        cannot flash before auth resolves, and it is skipped on /settings, where
        the page already offers the same field.
      */}
      {pathname !== '/settings' && <DisplayNamePrompt />}

      <Routes>
        {/* Tabs are routes. React Router ranks static segments above the
            dynamic one, so /settings and the legacy redirects below win over
            /:tab without depending on declaration order. The shell validates
            :tab against the viewer's own tab list and redirects if it is
            unknown or forbidden. */}
        <Route path="/" element={<AppComponent />} />
        <Route path="/:tab" element={<AppComponent />} />

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
    </>
  )
}

export default App