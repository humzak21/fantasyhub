import { supabaseAdmin, isSupabaseConfigured } from '../config/database.js';

class QuotesController {
  /**
   * Get a random quote from the quotes table
   */
  async getRandomQuote(req, res) {
    try {
      if (!isSupabaseConfigured) {
        return res.status(503).json({
          success: false,
          error: 'Database not configured'
        });
      }

      // First, get the total count of quotes
      const { count, error: countError } = await supabaseAdmin
        .from('quotes')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Error getting quotes count:', countError);
        return res.status(500).json({
          success: false,
          error: 'Failed to get quotes count'
        });
      }

      if (count === 0) {
        return res.status(404).json({
          success: false,
          error: 'No quotes found in database'
        });
      }

      // Generate a random offset
      const randomOffset = Math.floor(Math.random() * count);

      // Get a random quote using the offset
      const { data: quotes, error } = await supabaseAdmin
        .from('quotes')
        .select('quotations')
        .range(randomOffset, randomOffset)
        .limit(1);

      if (error) {
        console.error('Error fetching random quote:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch quote'
        });
      }

      if (!quotes || quotes.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No quote found'
        });
      }

      res.json({
        success: true,
        data: {
          quote: quotes[0].quotations
        }
      });

    } catch (error) {
      console.error('Error in getRandomQuote:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get all quotes (optional, for admin purposes)
   */
  async getAllQuotes(req, res) {
    try {
      if (!isSupabaseConfigured) {
        return res.status(503).json({
          success: false,
          error: 'Database not configured'
        });
      }

      const { data: quotes, error } = await supabaseAdmin
        .from('quotes')
        .select('*')
        .order('id');

      if (error) {
        console.error('Error fetching all quotes:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch quotes'
        });
      }

      res.json({
        success: true,
        data: quotes
      });

    } catch (error) {
      console.error('Error in getAllQuotes:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

export default new QuotesController(); 