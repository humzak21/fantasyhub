import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import FantasyFootballApp from '../FantasyFootballApp.jsx'
import { UserSettingsPage } from './components/auth/UserSettingsPage.jsx'
import ResetPasswordPage from './components/auth/ResetPasswordPage.jsx'
import DisplayNamePrompt from './components/auth/DisplayNamePrompt.jsx'
import { useAuth } from './contexts/AuthContext.jsx'
import { RESET_PASSWORD_PATH } from './utils/passwordReset.js'
import ErrorBoundary from '../utils/errorBoundary.jsx'

function App() {
  const { loading, passwordRecoveryPending } = useAuth()
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading Fantasy Football Power Rankings...</p>
        </div>
      </div>
    )
  }

  // One shell. There used to be two, picked by user-agent sniffing: the phone
  // shell was missing playoffs, history and standings entirely and never
  // received `isAdmin`, so admin tabs could not render on a phone at all.
  // iPads got the phone shell and a narrow desktop window got the desktop one,
  // neither of which follows from the actual viewport. Everything is one
  // responsive tree now, which is also what makes a new feature mobile-ready
  // without anyone doing extra work.

  // A password-reset link signs the browser in and lands here with a session
  // and no new password. Nothing else renders until one is saved (or the
  // member signs out): a recovery session that wanders off to the tabs is
  // exactly the "Forgot Password skipped the login" report. The route below
  // covers a reload, where the flag is gone but the path is not.
  if (passwordRecoveryPending) {
    return (
      <ErrorBoundary key="reset-password-error-boundary">
        <ResetPasswordPage />
      </ErrorBoundary>
    )
  }

  return (
    <>
      {/*
        One mount for the whole app. It sits below the `loading` gate above so it
        cannot flash before auth resolves, and it is skipped on /settings, where
        the page already offers the same field.
      */}
      {pathname !== '/settings' && <DisplayNamePrompt />}

      <Routes>
        {/* The reset link's landing page. Static, so it outranks /:tab. */}
        <Route
          path={RESET_PASSWORD_PATH}
          element={
            <ErrorBoundary key="reset-password-error-boundary">
              <ResetPasswordPage />
            </ErrorBoundary>
          }
        />
        {/* Tabs are routes. React Router ranks static segments above the
            dynamic one, so /settings and the legacy redirects below win over
            /:tab without depending on declaration order. The shell validates
            :tab against the viewer's own tab list and redirects if it is
            unknown or forbidden. */}
        <Route path="/" element={<FantasyFootballApp />} />
        <Route path="/:tab" element={<FantasyFootballApp />} />

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