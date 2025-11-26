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
import createMovieTrackerApp from './movietracker/backend/app.js';

// Import automation scheduler
import { automationScheduler } from './services/automationScheduler.js';

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

// MovieTracker API routes (mounted sub-app)
const movieTrackerApp = createMovieTrackerApp();
app.use('/api/movies', movieTrackerApp);

// Automation API routes
app.get('/api/automation/status', async (req, res) => {
  try {
    const status = automationScheduler.getStatus();
    const stats = await automationScheduler.getStats();

    res.json({
      success: true,
      data: {
        ...status,
        stats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get automation status',
      details: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get('/api/automation/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await automationScheduler.getLogs(limit);

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get automation logs',
      details: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/api/automation/trigger', async (req, res) => {
  try {
    const result = await automationScheduler.runManualUpdate();

    res.json({
      success: true,
      message: 'Manual update completed successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message === 'Weekly update already in progress'
        ? 'Update already in progress'
        : 'Failed to run manual update',
      details: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/api/automation/restart', async (req, res) => {
  try {
    const success = automationScheduler.restart();

    res.json({
      success: true,
      message: success ? 'Automation scheduler restarted' : 'Automation disabled',
      data: automationScheduler.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to restart automation scheduler',
      details: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

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
  console.log(`🤖 Automation API available at http://localhost:${PORT}/api/automation`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);

  if (NODE_ENV === 'development') {
    console.log(`🎯 Frontend dev server should be running on http://localhost:5173`);
  }

  // Initialize automation scheduler after server starts
  setTimeout(() => {
    const initialized = automationScheduler.init();
    if (initialized) {
      console.log(`⏰ Automation scheduler active`);
      const status = automationScheduler.getStatus();
      console.log(`   Schedule: ${status.schedule} (${status.timezone})`);
      console.log(`   Next run: ${status.nextRunTime}`);
    }
  }, 1000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  automationScheduler.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  automationScheduler.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;