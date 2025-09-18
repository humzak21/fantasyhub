// Runtime environment configuration for Railway deployment
// This loads environment variables at runtime instead of build time

let envConfig = null;

// Try to load environment variables from multiple sources
export function getEnvironmentConfig() {
  if (envConfig) {
    return envConfig;
  }

  // Source 1: Vite's import.meta.env (works in development)
  let supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
  let supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  let adminUserId = import.meta.env?.VITE_ADMIN_USER_ID;

  // Source 2: Build-time injected constants (if Vite define worked)
  if (!supabaseUrl && typeof __SUPABASE_URL__ !== 'undefined' && __SUPABASE_URL__ !== 'undefined') {
    supabaseUrl = __SUPABASE_URL__;
  }
  if (!supabaseAnonKey && typeof __SUPABASE_ANON_KEY__ !== 'undefined' && __SUPABASE_ANON_KEY__ !== 'undefined') {
    supabaseAnonKey = __SUPABASE_ANON_KEY__;
  }

  // Source 3: Window object (for Railway runtime injection)
  if (typeof window !== 'undefined' && window.__ENV__) {
    supabaseUrl = supabaseUrl || window.__ENV__.VITE_SUPABASE_URL || window.__ENV__.SUPABASE_URL;
    supabaseAnonKey = supabaseAnonKey || window.__ENV__.VITE_SUPABASE_ANON_KEY || window.__ENV__.SUPABASE_ANON_KEY;
    adminUserId = adminUserId || window.__ENV__.VITE_ADMIN_USER_ID;
  }

  // Source 4: Hardcoded for Railway (last resort - you'd set these in Railway)
  if (!supabaseUrl) {
    // Railway can inject these at runtime via a startup script
    supabaseUrl = globalThis.RAILWAY_SUPABASE_URL;
  }
  if (!supabaseAnonKey) {
    supabaseAnonKey = globalThis.RAILWAY_SUPABASE_ANON_KEY;
  }

  console.log('Environment config resolution:', {
    source1_importMeta: !!import.meta.env?.VITE_SUPABASE_URL,
    source2_buildTime: typeof __SUPABASE_URL__ !== 'undefined' && __SUPABASE_URL__ !== 'undefined',
    source3_window: typeof window !== 'undefined' && !!window.__ENV__,
    source4_global: !!globalThis.RAILWAY_SUPABASE_URL,
    finalUrl: supabaseUrl ? 'present' : 'missing',
    finalKey: supabaseAnonKey ? 'present' : 'missing'
  });

  envConfig = {
    supabaseUrl,
    supabaseAnonKey,
    adminUserId,
    isDevelopment: import.meta.env?.NODE_ENV === 'development',
    isProduction: import.meta.env?.NODE_ENV === 'production'
  };

  return envConfig;
}

// Reset config (useful for testing)
export function resetEnvironmentConfig() {
  envConfig = null;
}