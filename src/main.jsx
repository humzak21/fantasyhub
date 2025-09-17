import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import '../globals.css'

// Environment configuration
console.log('🚀 Starting Fantasy Football Power Rankings')
console.log('📊 Version:', import.meta.env.VITE_APP_VERSION || '1.0.0')
console.log('🏗️ Environment:', import.meta.env.NODE_ENV || 'development')

if (import.meta.env.VITE_ENABLE_DEBUG === 'true') {
  console.log('🐛 Debug mode enabled')
  console.log('⚙️ Environment variables:', {
    NODE_ENV: import.meta.env.NODE_ENV,
    VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
    VITE_ENABLE_DARK_MODE: import.meta.env.VITE_ENABLE_DARK_MODE,
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)