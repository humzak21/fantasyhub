import { createClient } from '@supabase/supabase-js';

// Use proper environment variables for Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Supabase Config Check:');
console.log('- URL:', supabaseUrl ? 'Set' : 'Missing');
console.log('- Anon Key:', supabaseAnonKey ? 'Set' : 'Missing');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase configuration missing. Direct database operations will not work.');
  console.warn('Backend API will be used instead.');
}

// For frontend, we'll primarily use the backend API
// But this client can be used for direct database operations if needed
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;

// Test connectivity if client is available
if (supabase) {
  console.log('Supabase client created successfully');
  
  // Simple connectivity test
  supabase.auth.getSession()
    .then(({ data, error }) => {
      if (error) {
        console.warn('Supabase connectivity test failed:', error.message);
      } else {
        console.log('Supabase connectivity test passed');
      }
    })
    .catch(err => {
      console.error('Supabase connectivity test error:', err);
    });
} else {
  console.error('Supabase client could not be created');
}

export default supabase; 