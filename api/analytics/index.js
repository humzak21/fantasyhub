/**
 * Analytics API Router
 * 
 * Main router for analytics API endpoints.
 * Handles authentication, rate limiting, and request routing.
 */

import express from 'express';
import { FFAnalyticsService } from '../../services/ffAnalyticsService.js';
import { supabaseAdmin } from '../../services/supabaseClient.server.js';

const router = express.Router();

// Initialize analytics service (shared instance)
let analyticsService = null;

const getAnalyticsService = async () => {
  if (!analyticsService) {
    analyticsService = new FFAnalyticsService(supabaseAdmin);
    await analyticsService.initialize();
  }
  return analyticsService;
};

// Middleware for error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Middleware for authentication (optional - adjust based on your auth system)
const requireAuth = (req, res, next) => {
  // Add your authentication logic here
  // For now, we'll allow all requests
  next();
};

// GET /api/analytics/status
router.get('/status', asyncHandler(async (req, res) => {
  try {
    const service = await getAnalyticsService();
    const stats = service.getStats();
    
    res.json({
      success: true,
      status: 'operational',
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      status: 'error'
    });
  }
}));

// POST /api/analytics/sync
router.post('/sync', requireAuth, asyncHandler(async (req, res) => {
  const { week, force = false } = req.body;
  
  try {
    const service = await getAnalyticsService();
    const results = await service.updateAllPlayerAnalytics(week, force);
    
    res.json({
      success: true,
      message: 'Analytics sync completed',
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.type
    });
  }
}));

// GET /api/analytics/team/:teamId
router.get('/team/:teamId', asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const { week, season } = req.query;
  
  try {
    const service = await getAnalyticsService();
    const teamAnalytics = await service.getTeamAnalyticsScore(
      teamId,
      week ? parseInt(week) : null,
      season ? parseInt(season) : null
    );
    
    res.json({
      success: true,
      data: teamAnalytics,
      teamId,
      week: week || 'current',
      season: season || new Date().getFullYear()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.type
    });
  }
}));

// GET /api/analytics/player/:playerId
router.get('/player/:playerId', asyncHandler(async (req, res) => {
  const { playerId } = req.params;
  const { week, season } = req.query;
  
  try {
    const service = await getAnalyticsService();
    const playerAnalytics = await service.getPlayerAnalytics(
      playerId,
      week ? parseInt(week) : null,
      season ? parseInt(season) : null
    );
    
    res.json({
      success: true,
      data: playerAnalytics,
      playerId,
      week: week || 'current',
      season: season || new Date().getFullYear()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.type
    });
  }
}));

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Analytics API error:', error);
  
  res.status(500).json({
    success: false,
    error: error.message || 'Internal server error',
    type: error.type || 'UNKNOWN_ERROR'
  });
});

export default router;