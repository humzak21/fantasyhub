/**
 * API Route: Get Player Analytics
 * 
 * This endpoint retrieves analytics data for a specific player.
 * 
 * Usage: GET /api/analytics/player/{playerId}?week=10&season=2024
 */

import { FFAnalyticsService } from '../../../services/ffAnalyticsService.js';
import { supabaseAdmin } from '../../../services/supabaseClient.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId } = req.query;
    const { week, season } = req.query;

    if (!playerId) {
      return res.status(400).json({ error: 'Player ID is required' });
    }

    // Initialize the server-side analytics service
    const analyticsService = new FFAnalyticsService(supabaseAdmin);
    await analyticsService.initialize();

    // Get player analytics data
    const playerAnalytics = await analyticsService.getPlayerAnalytics(
      playerId,
      week ? parseInt(week) : null,
      season ? parseInt(season) : null
    );

    res.status(200).json({
      success: true,
      data: playerAnalytics,
      playerId,
      week: week || 'current',
      season: season || new Date().getFullYear()
    });

  } catch (error) {
    console.error('Failed to get player analytics:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.type || 'UNKNOWN_ERROR'
    });
  }
}