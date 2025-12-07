// Temporary debug script to check authentication status
// Add this to your browser console while on the Awards page

// Check 1: Local Storage Session
console.log('=== AUTH DEBUG ===');
const sessionKeys = Object.keys(localStorage).filter(k => k.includes('supabase'));
console.log('Session keys in localStorage:', sessionKeys);

sessionKeys.forEach(key => {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    console.log(`${key}:`, {
      hasUser: !!data?.user,
      userId: data?.user?.id,
      userEmail: data?.user?.email,
      metadata: data?.user?.user_metadata,
      hasAccessToken: !!data?.access_token
    });
  } catch (e) {
    console.log(`${key}: (not JSON)`);
  }
});

// Check 2: Supabase Client Session
import { supabase } from '../services/supabaseClient.js';
const { data, error } = await supabase.auth.getSession();
console.log('Current session:', {
  hasSession: !!data?.session,
  userId: data?.session?.user?.id,
  userEmail: data?.session?.user?.email,
  metadata: data?.session?.user?.user_metadata,
  error
});

// Check 3: User object
const { data: userData, error: userError } = await supabase.auth.getUser();
console.log('Current user:', {
  hasUser: !!userData?.user,
  userId: userData?.user?.id,
  userEmail: userData?.user?.email,
  isAdmin: userData?.user?.user_metadata?.isAdmin,
  metadata: userData?.user?.user_metadata,
  error: userError
});
