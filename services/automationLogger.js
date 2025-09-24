import { supabaseAdmin } from './supabaseClient.js';

export class AutomationLogger {
  constructor() {
    this.supabase = supabaseAdmin;
  }

  async logExecution(type, status, details = {}, error = null) {
    const logEntry = {
      execution_type: type,
      status: status, // 'started', 'completed', 'failed'
      execution_time: new Date().toISOString(),
      details: details,
      error_message: error?.message || null,
      error_stack: error?.stack || null
    };

    try {
      // Log to console for immediate visibility
      const timestamp = new Date().toLocaleString();
      console.log(`[${timestamp}] AUTOMATION ${type.toUpperCase()}: ${status.toUpperCase()}`);

      if (details && Object.keys(details).length > 0) {
        console.log('Details:', JSON.stringify(details, null, 2));
      }

      if (error) {
        console.error('Error:', error.message);
        if (process.env.NODE_ENV === 'development') {
          console.error('Stack:', error.stack);
        }
      }

      // Attempt to log to database (non-blocking)
      const { error: dbError } = await this.supabase
        .from('automation_logs')
        .insert([logEntry]);

      if (dbError) {
        console.warn('Failed to log to database:', dbError.message);
      }
    } catch (logError) {
      console.error('Logging failed:', logError.message);
    }

    return logEntry;
  }

  async logStart(type, details = {}) {
    return this.logExecution(type, 'started', details);
  }

  async logSuccess(type, details = {}) {
    return this.logExecution(type, 'completed', details);
  }

  async logFailure(type, error, details = {}) {
    return this.logExecution(type, 'failed', details, error);
  }

  async getRecentLogs(limit = 50) {
    try {
      const { data, error } = await this.supabase
        .from('automation_logs')
        .select('*')
        .order('execution_time', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('Failed to fetch logs from database:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get recent logs:', error.message);
      return [];
    }
  }

  async getLogStats(days = 7) {
    try {
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - days);

      const { data, error } = await this.supabase
        .from('automation_logs')
        .select('execution_type, status, execution_time')
        .gte('execution_time', dateThreshold.toISOString());

      if (error) {
        console.warn('Failed to fetch log stats:', error.message);
        return { total: 0, successful: 0, failed: 0, byType: {} };
      }

      const logs = data || [];
      const stats = {
        total: logs.length,
        successful: logs.filter(log => log.status === 'completed').length,
        failed: logs.filter(log => log.status === 'failed').length,
        byType: {}
      };

      // Group by execution type
      logs.forEach(log => {
        if (!stats.byType[log.execution_type]) {
          stats.byType[log.execution_type] = {
            total: 0,
            successful: 0,
            failed: 0
          };
        }
        stats.byType[log.execution_type].total++;
        if (log.status === 'completed') {
          stats.byType[log.execution_type].successful++;
        } else if (log.status === 'failed') {
          stats.byType[log.execution_type].failed++;
        }
      });

      return stats;
    } catch (error) {
      console.error('Failed to get log stats:', error.message);
      return { total: 0, successful: 0, failed: 0, byType: {} };
    }
  }
}

export const automationLogger = new AutomationLogger();