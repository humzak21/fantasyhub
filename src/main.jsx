import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { DarkModeProvider } from './contexts/DarkModeContext.jsx'
import '../globals.css'
import '../styles/dark-mode.css'
import '../styles/mobile.css'

// Environment configuration

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <DarkModeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </DarkModeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)