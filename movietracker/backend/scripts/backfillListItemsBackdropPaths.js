import dotenv from 'dotenv';
import { supabaseAdmin, isSupabaseConfigured } from '../config/database.js';
import tmdbService, { isTMDBConfigured } from '../services/tmdbService.js';

// Only load .env in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const PAGE_SIZE = 500; // rows fetched per page from DB
const CONCURRENCY = 5; // parallel TMDB lookups
const REQUEST_DELAY_MS = 300; // small stagger between requests

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchMissingBackdropRows() {
  const rows = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from('list_items')
      .select('movie_title, tmdb_id')
      .is('movie_backdrop_path', null)
      .range(from, to);

    if (error) {
      throw new Error(`Failed fetching list_items (page ${page + 1}): ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);
    if (data.length < PAGE_SIZE) {
      break; // last page
    }
    page += 1;
  }

  return rows;
}

async function getBackdropPathForItem(item) {
  try {
    if (item.tmdb_id) {
      const details = await tmdbService.getMovieDetails(item.tmdb_id);
      return details?.backdrop_path || null;
    }

    if (item.movie_title) {
      const data = await tmdbService.fetchMovieData(String(item.movie_title).trim());
      return data?.backdrop_path || null;
    }

    return null;
  } catch {
    return null;
  }
}

async function updateBackdropPath(item, path) {
  let query = supabaseAdmin
    .from('list_items')
    .update({ movie_backdrop_path: path })
    .is('movie_backdrop_path', null);

  if (item.tmdb_id) {
    query = query.eq('tmdb_id', item.tmdb_id);
  }
  if (item.movie_title) {
    query = query.eq('movie_title', item.movie_title);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
}

async function backfillBackdropPaths() {
  if (!isSupabaseConfigured) {
    console.error('❌ Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY/SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  if (!supabaseAdmin) {
    console.error('❌ Supabase admin client not configured. Set SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  if (!isTMDBConfigured) {
    console.error('❌ TMDB not configured. Set TMDB_API_KEY.');
    process.exit(1);
  }

  console.log('🚀 Starting backfill of list_items.movie_backdrop_path from TMDB...');

  const items = await fetchMissingBackdropRows();
  console.log(`Found ${items.length} list_items without a movie_backdrop_path`);

  let processed = 0;
  let updated = 0;
  let notFound = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (item, idx) => {
        try {
          await sleep(idx * REQUEST_DELAY_MS);
          const path = await getBackdropPathForItem(item);
          if (!path) {
            notFound += 1;
            processed += 1;
            return;
          }
          await updateBackdropPath(item, path);
          updated += 1;
          processed += 1;
        } catch (err) {
          failed += 1;
          processed += 1;
          console.warn(`Failed to update "${item.movie_title || 'Unknown'}" (tmdb_id: ${item.tmdb_id || 'n/a'}): ${err.message}`);
        }
      })
    );
  }

  console.log('\n🎉 Backfill complete');
  console.log(`Processed: ${processed}`);
  console.log(`Updated:   ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Failed:    ${failed}`);
}

// Execute when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillBackdropPaths()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exit(1);
    });
}

export default backfillBackdropPaths;



