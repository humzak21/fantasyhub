// @vitest-environment node
//
// Runs in node rather than jsdom on purpose: the browser/server split is the
// behaviour under test, and jsdom would make `isBrowser()` true everywhere.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAnonClient, getAdminClient, resolveClient, isAdminClient, resetClients } from '../client.js';
import { DbErrorKind } from '../errors.js';

const KEYS = ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
let saved;

// A syntactically valid JWT is enough; nothing here reaches the network.
const FAKE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoidGVzdCJ9.signature';

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  resetClients();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetClients();
});

describe('client resolution', () => {
  it('returns null instead of throwing when the project is not configured', () => {
    expect(getAnonClient()).toBeNull();
    expect(getAdminClient()).toBeNull();
  });

  it('memoises the anon client so only one GoTrue instance exists', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = FAKE_KEY;

    const first = getAnonClient();
    expect(first).not.toBeNull();
    expect(getAnonClient()).toBe(first);
  });

  it('memoises the admin client separately from the anon client', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = FAKE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;

    const admin = getAdminClient();
    expect(getAdminClient()).toBe(admin);
    expect(getAnonClient()).not.toBe(admin);
  });

  it('prefers the service-role client in Node, which is what scripts rely on', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = FAKE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;

    expect(isAdminClient()).toBe(true);
    expect(resolveClient()).toBe(getAdminClient());
  });

  it('falls back to the anon client when no service-role key is present', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = FAKE_KEY;

    expect(isAdminClient()).toBe(false);
    expect(resolveClient()).toBe(getAnonClient());
  });

  it('reports a missing URL distinctly from missing keys', () => {
    expect(() => resolveClient()).toThrow(/Missing SUPABASE_URL/);

    resetClients();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    try {
      resolveClient();
      throw new Error('expected resolveClient to throw');
    } catch (error) {
      expect(error.kind).toBe(DbErrorKind.CONFIG);
      expect(error.message).toMatch(/Missing Supabase authentication keys/);
    }
  });

  it('reads VITE_-prefixed variables too, since that is what .env.local holds', () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = FAKE_KEY;

    expect(getAnonClient()).not.toBeNull();
  });
});
