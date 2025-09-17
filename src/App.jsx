import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import FantasyFootballApp from '../FantasyFootballApp.jsx'
import { useAuth } from './contexts/AuthContext.jsx'

function App() {
  const { loading } = useAuth()

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

  return (
    <Routes>
      {/* Main route - show fantasy app directly */}
      <Route 
        path="/" 
        element={<FantasyFootballApp />} 
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