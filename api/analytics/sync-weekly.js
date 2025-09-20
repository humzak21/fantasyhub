/**
 * API Route: Sync Weekly Analytics Data
 * 
 * This endpoint triggers the server-side FFAnalyticsService to sync
 * weekly player data from ffanalytics sources.
 * 
 * Usage: POST /api/analytics/sync-weekly
 * Body: { week: number, force: boolean }
 */

import { FFAnalyticsService } from '../../services/ffAnalyticsService.js';
import { supabaseAdmin } from '../../services/supabaseClient.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { week, force = false } = req.body;

    // Initialize the server-side analytics service
    const analyticsService = new FFAnalyticsService(supabaseAdmin);
    await analyticsService.initialize();

    console.log(`Starting weekly analytics sync for week ${week || 'current'}...`);

    // Trigger the analytics update
    const results = await analyticsService.updateAllPlayerAnalytics(week, force);

    console.log('Weekly analytics sync completed:', results);

    res.status(200).json({
      success: true,
      message: 'Weekly analytics sync completed successfully',
      results
    });

  } catch (error) {
    console.error('Weekly analytics sync failed:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.type || 'UNKNOWN_ERROR'
    });
  }
}

// Export config for serverless deployment
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
  // Increase timeout for R script execution
  maxDuration: 300, // 5 minutes
};