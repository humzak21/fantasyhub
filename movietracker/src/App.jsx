import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DarkModeProvider } from './hooks/useDarkMode.jsx';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Timeline from './pages/Timeline';
import Movies from './pages/Movies';
import TopRated from './pages/TopRated';
import Statistics from './pages/Statistics';
import ForgotPassword from './pages/ForgotPassword';

function App() {
  return (
    <DarkModeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public routes */}
            <Route path="/forgot-password" element={<ForgotPassword />} />
            
            {/* Main app routes */}
            <Route path="/*" element={
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/overview" replace />} />
                  <Route path="/overview" element={<Overview />} />
                  <Route path="/timeline" element={<Timeline />} />
                  <Route path="/movies" element={<Movies />} />
                  <Route path="/statistics" element={<Statistics />} />
                  <Route path="/toprated" element={<TopRated />} />
                </Routes>
              </Layout>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </DarkModeProvider>
  );
}

export default App;