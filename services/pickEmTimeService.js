// Pick'ems Time Management Service
// Handles automatic status updates and time-based controls

import { calculatePickEmSchedule } from '../types/index.js';

export class PickEmTimeService {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.intervals = new Map();
    this.callbacks = new Map();
  }

  // Start monitoring a pick'em week for automatic status updates
  startMonitoring(pickEmWeekId, statusCallback) {
    // Clear any existing interval for this week
    this.stopMonitoring(pickEmWeekId);

    // Store the callback
    this.callbacks.set(pickEmWeekId, statusCallback);

    // Check status every minute
    const interval = setInterval(async () => {
      try {
        await this.checkAndUpdateStatus(pickEmWeekId);
      } catch (error) {
        // Silently handle errors in background checks
      }
    }, 60000); // Check every minute

    this.intervals.set(pickEmWeekId, interval);

    // Do an initial check
    this.checkAndUpdateStatus(pickEmWeekId);
  }

  // Stop monitoring a pick'em week
  stopMonitoring(pickEmWeekId) {
    const interval = this.intervals.get(pickEmWeekId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(pickEmWeekId);
    }
    this.callbacks.delete(pickEmWeekId);
  }

  // Check and update status for a pick'em week
  async checkAndUpdateStatus(pickEmWeekId) {
    try {
      // Get the pick'em week data
      const { data: weekData, error } = await this.dataManager.client
        .from('pick_em_weeks')
        .select('*')
        .eq('id', pickEmWeekId)
        .single();

      if (error) throw error;

      const now = new Date();
      const opensAt = new Date(weekData.submission_opens_at);
      const closesAt = new Date(weekData.submission_closes_at);
      const revealsAt = new Date(weekData.results_reveal_at);

      let newStatus = null;
      let shouldUpdate = false;

      // Determine what the status should be
      if (now < opensAt) {
        // Upcoming - no status change needed unless currently active
        if (weekData.is_active) {
          newStatus = { is_active: false, is_closed: false };
          shouldUpdate = true;
        }
      } else if (now >= opensAt && now <= closesAt) {
        // Should be open/active
        if (!weekData.is_active || weekData.is_closed) {
          newStatus = { is_active: true, is_closed: false };
          shouldUpdate = true;
        }
      } else if (now > closesAt && now < revealsAt) {
        // Should be closed
        if (weekData.is_active || !weekData.is_closed) {
          newStatus = { is_active: false, is_closed: true };
          shouldUpdate = true;
        }
      } else if (now >= revealsAt) {
        // Results should be available - check if we need to calculate them
        if (!weekData.is_completed) {
          try {
            // Try to calculate results automatically
            await this.dataManager.calculatePickEmResults(pickEmWeekId);
            newStatus = { is_active: false, is_closed: true, is_completed: true };
            shouldUpdate = true;
          } catch (error) {
            // Just mark as time for results without calculating
            newStatus = { is_active: false, is_closed: true };
            shouldUpdate = true;
          }
        }
      }

      // Update the database if needed
      if (shouldUpdate && newStatus) {
        const { error: updateError } = await this.dataManager.client
          .from('pick_em_weeks')
          .update(newStatus)
          .eq('id', pickEmWeekId);

        if (updateError) {
          // Handle update error silently
        }
      }

      // Notify callback about current status
      const callback = this.callbacks.get(pickEmWeekId);
      if (callback) {
        const currentStatus = this.getTimeStatus(opensAt, closesAt, revealsAt);
        callback(currentStatus, weekData);
      }

    } catch (error) {
      // Handle errors silently
    }
  }

  // Get the current time-based status
  getTimeStatus(opensAt, closesAt, revealsAt) {
    const now = new Date();

    if (now < opensAt) {
      return {
        status: 'upcoming',
        canSubmit: false,
        resultsAvailable: false,
        timeUntilOpen: opensAt - now,
        message: 'Submissions not yet open'
      };
    } else if (now >= opensAt && now <= closesAt) {
      return {
        status: 'open',
        canSubmit: true,
        resultsAvailable: false,
        timeUntilClose: closesAt - now,
        message: 'Submissions are open!'
      };
    } else if (now > closesAt && now < revealsAt) {
      return {
        status: 'closed',
        canSubmit: false,
        resultsAvailable: false,
        timeUntilReveal: revealsAt - now,
        message: 'Submissions are closed'
      };
    } else {
      return {
        status: 'completed',
        canSubmit: false,
        resultsAvailable: true,
        message: 'Results are available'
      };
    }
  }

  // Calculate default pick'em schedule for a week (aligned with fantasy week system).
  // This was a fourth copy of the season start date and the open/close/reveal
  // offsets; it now defers to the one derivation in utils/seasonConfig.js.
  calculateWeekSchedule(weekNumber) {
    return calculatePickEmSchedule(weekNumber);
  }

  // Clean up all intervals
  destroy() {
    this.intervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.intervals.clear();
    this.callbacks.clear();
  }
}

// Singleton instance
let timeServiceInstance = null;

export const getPickEmTimeService = (dataManager) => {
  if (!timeServiceInstance) {
    timeServiceInstance = new PickEmTimeService(dataManager);
  }
  return timeServiceInstance;
};