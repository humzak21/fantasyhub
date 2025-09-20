/**
 * Server-side Supabase Client
 * 
 * This version uses process.env instead of import.meta.env
 * for Node.js compatibility.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from multiple files
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config();

// Use process.env for server-side operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate required environment variables
if (!supabaseUrl) {
  console.error('❌ Missing SUPABASE_URL or VITE_SUPABASE_URL environment variable');
  process.exit(1);
}

if (!supabaseAnonKey && !supabaseServiceRoleKey) {
  console.error('❌ Missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

// Create standard client (for general operations)
export const supabase = supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-client-info': 'fantasy-football-power-rankings-server'
    }
  }
}) : null;

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

// Log connection status
console.log('🔗 Supabase Server Client Configuration:');
console.log(`   URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
console.log(`   Anon Key: ${supabaseAnonKey ? '✅ Set' : '❌ Missing'}`);
console.log(`   Service Role Key: ${supabaseServiceRoleKey ? '✅ Set' : '❌ Missing'}`);
console.log(`   Standard Client: ${supabase ? '✅ Ready' : '❌ Not available'}`);
console.log(`   Admin Client: ${supabaseAdmin ? '✅ Ready' : '❌ Not available'}`);