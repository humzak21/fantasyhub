import { createClient } from '@supabase/supabase-js';

// Support multiple environment variable sources for Railway compatibility
const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof __SUPABASE_URL__ !== 'undefined' && __SUPABASE_URL__) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_URL);

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof __SUPABASE_ANON_KEY__ !== 'undefined' && __SUPABASE_ANON_KEY__) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY);
const supabaseServiceRoleKey = typeof process !== 'undefined' ? process.env.SUPABASE_SERVICE_ROLE_KEY : null;

// Enhanced debugging for Railway deployment
console.log('Supabase environment debug:', {
  hasImportMeta: typeof import.meta !== 'undefined',
  hasImportMetaEnv: typeof import.meta !== 'undefined' && !!import.meta.env,
  hasProcess: typeof process !== 'undefined',
  importMetaEnvKeys: typeof import.meta !== 'undefined' && import.meta.env ? Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')) : [],
  processEnvKeys: typeof process !== 'undefined' ? Object.keys(process.env).filter(k => k.startsWith('VITE_')) : [],
  // Check build-time injected constants
  hasBuildTimeUrl: typeof __SUPABASE_URL__ !== 'undefined',
  hasBuildTimeKey: typeof __SUPABASE_ANON_KEY__ !== 'undefined',
  buildTimeUrl: typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : 'undefined',
  buildTimeKey: typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? (__SUPABASE_ANON_KEY__ ? 'present' : 'empty') : 'undefined',
  // Final resolved values
  url: supabaseUrl ? 'present' : 'missing',
  key: supabaseAnonKey ? 'present' : 'missing',
  fullUrl: supabaseUrl,
  keyLength: supabaseAnonKey?.length
});

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'undefined' || supabaseAnonKey === 'undefined') {
  console.error('❌ Environment Variable Troubleshooting:');
  console.error('1. Check Railway dashboard environment variables are set');
  console.error('2. Ensure variables are named exactly: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  console.error('3. Try also setting SUPABASE_URL and SUPABASE_ANON_KEY (without VITE_ prefix)');
  console.error('4. Redeploy after setting environment variables');
  throw new Error(
    `Missing Supabase environment variables. URL: ${supabaseUrl || 'undefined'}, Key: ${supabaseAnonKey ? 'present' : 'undefined'}`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-client-info': 'fantasy-football-power-rankings'
    }
  }
});

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