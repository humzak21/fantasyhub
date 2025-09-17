// Admin utility functions
// This module provides functions to check if a user has admin privileges

import { supabase } from '../../services/supabaseClient.js';

// Configuration - Set this to your admin user's UUID from Supabase Auth
// You can find this in your Supabase dashboard under Authentication > Users
// Set VITE_ADMIN_USER_ID in your .env.local file
const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID || 'your-admin-user-uuid-here';

/**
 * Check if the current authenticated user is an admin
 * @returns {boolean} True if current user is admin, false otherwise
 */
export const isCurrentUserAdmin = () => {
  const user = supabase.auth.getUser();
  return user?.data?.user?.id === ADMIN_USER_ID;
};

/**
 * Check if a specific user ID is the admin
 * @param {string} userId - The user ID to check
 * @returns {boolean} True if the user is admin, false otherwise
 */
export const isUserAdmin = (userId) => {
  return userId === ADMIN_USER_ID;
};

/**
 * Get the admin user ID
 * @returns {string} The admin user ID
 */
export const getAdminUserId = () => {
  return ADMIN_USER_ID;
};

/**
 * Hook to check admin status with real-time updates
 * @param {Object} user - The current user object from useAuth
 * @returns {boolean} True if current user is admin, false otherwise
 */
export const useIsAdmin = (user) => {
  return user?.id === ADMIN_USER_ID;
};

// Instructions for setup:
// 1. Create your admin user account through the app
// 2. Run: SELECT id, email FROM auth.users; in your Supabase SQL editor
// 3. Set ADMIN_USER_ID in your .env.local file with your actual admin user UUID
// 4. Update the database function as well in restrict_admin_to_single_user.sql