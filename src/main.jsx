import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { DarkModeProvider } from './contexts/DarkModeContext.jsx'
import { createQueryClient } from '../hooks/queries/index.js'
import { ViewedWeekProvider } from '../hooks/queries/useWeek.jsx'
import ErrorBoundary from '../utils/errorBoundary.jsx'
import '../globals.css'
import '../styles/fantasy-utilities.css'
import '../styles/dark-mode.css'
import '../styles/mobile.css'

// One client for the process. Created here rather than at module scope in
// queryClient.js so tests can mount a tree with their own.
const queryClient = createQueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <DarkModeProvider>
            <AuthProvider>
              {/* Above the app so desktop and mobile shells share one viewed week */}
              <ViewedWeekProvider>
                <App />
              </ViewedWeekProvider>
            </AuthProvider>
          </DarkModeProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)