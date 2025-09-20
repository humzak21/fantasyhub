#!/usr/bin/env node

/**
 * FFAnalytics Express Server
 * 
 * Simple Express server to handle analytics API endpoints
 * and serve the Vite frontend in production.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import analytics API routes
import analyticsRouter from './api/analytics/index.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.supabase.co", "wss://api.supabase.co"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL, process.env.VERCEL_URL].filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));

// Logging
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Analytics API routes
app.use('/api/analytics', analyticsRouter);

// Serve static files in production
if (NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  
  // Handle client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  res.status(error.status || 500).json({
    success: false,
    error: NODE_ENV === 'production' ? 'Internal server error' : error.message,
    ...(NODE_ENV !== 'production' && { stack: error.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 FFAnalytics server running on port ${PORT}`);
  console.log(`📊 Analytics API available at http://localhost:${PORT}/api/analytics`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  
  if (NODE_ENV === 'development') {
    console.log(`🎯 Frontend dev server should be running on http://localhost:5173`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;