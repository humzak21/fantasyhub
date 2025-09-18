import { createClient } from '@supabase/supabase-js';

// Use proper environment variables for Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = typeof process !== 'undefined' ? process.env.SUPABASE_SERVICE_ROLE_KEY : null;

console.log('Supabase Config Check:');
console.log('- URL:', supabaseUrl ? 'Set' : 'Missing');
console.log('- Anon Key:', supabaseAnonKey ? 'Set' : 'Missing');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase configuration missing. Please check Railway environment variables.');
  console.warn('Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

// Create Supabase client only if we have valid configuration
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'x-client-info': 'fantasy-football-power-rankings'
        }
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
  console.error('Supabase client could not be created - missing environment variables');
}

// Admin client for server-side operations (Node.js scripts)
// Uses service role key which bypasses RLS and has full access
export const supabaseAdmin = supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-client-info': 'fantasy-football-power-rankings-admin'
    }
  }
}) : null;

// Helper function to handle database errors consistently
export const handleSupabaseError = (error, operation = 'Database operation') => {
  console.error(`${operation} failed:`, error);
  
  if (error?.code === 'PGRST116') {
    throw new Error('No data found');
  }
  
  if (error?.code === '23505') {
    throw new Error('Duplicate data - this item already exists');
  }
  
  if (error?.code === '23503') {
    throw new Error('Invalid reference - related data not found');
  }
  
  if (error?.message?.includes('JWT')) {
    throw new Error('Authentication required - please log in');
  }
  
  throw new Error(error?.message || 'An unexpected database error occurred');
};

// Helper function to ensure user is authenticated
export const requireAuth = () => {
  const user = supabase.auth.getUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
};

// Helper function to format data for database insertion/update
export const formatForDatabase = (data) => {
  const formatted = { ...data };
  
  // Convert camelCase to snake_case for database fields
  const camelToSnake = (str) => {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase();
  };
  
  const convertKeys = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(convertKeys);
    }
    
    if (obj && typeof obj === 'object' && obj.constructor === Object) {
      return Object.keys(obj).reduce((acc, key) => {
        const snakeKey = camelToSnake(key);
        acc[snakeKey] = convertKeys(obj[key]);
        return acc;
      }, {});
    }
    
    return obj;
  };
  
  return convertKeys(formatted);
};

// Helper function to format data from database to frontend format
export const formatFromDatabase = (data) => {
  if (!data) return data;
  
  // Convert snake_case to camelCase for frontend
  const snakeToCamel = (str) => {
    return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
  };
  
  const convertKeys = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(convertKeys);
    }
    
    if (obj && typeof obj === 'object' && obj.constructor === Object) {
      return Object.keys(obj).reduce((acc, key) => {
        const camelKey = snakeToCamel(key);
        acc[camelKey] = convertKeys(obj[key]);
        return acc;
      }, {});
    }
    
    return obj;
  };
  
  return convertKeys(data);
};