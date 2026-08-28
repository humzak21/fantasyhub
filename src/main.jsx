import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { DarkModeProvider } from './contexts/DarkModeContext.jsx'
import { createQueryClient } from '../hooks/queries/index.js'
import { ViewedWeekProvider } from '../hooks/queries/useWeek.jsx'
import { ViewerProvider } from './contexts/ViewerContext.jsx'
import ErrorBoundary from '../utils/errorBoundary.jsx'
import { Toaster } from './components/ui/sonner.jsx'
import '../globals.css'
import '../styles/fantasy-utilities.css'

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
                {/* Viewer identity + name-masking access, derived once */}
                <ViewerProvider>
                  <App />
                  {/* One Toaster for the process, inside DarkModeProvider so
                      it can follow the theme. */}
                  <Toaster />
                </ViewerProvider>
              </ViewedWeekProvider>
            </AuthProvider>
          </DarkModeProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)