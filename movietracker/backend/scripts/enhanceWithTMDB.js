import { supabaseAdmin } from '../config/database.js';
import tmdbService from '../services/tmdbService.js';
import movieService from '../services/movieService.js';
import dotenv from 'dotenv';

// Only load .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const BATCH_SIZE = 10; // Process in smaller batches to respect rate limits
const DELAY_BETWEEN_REQUESTS = 500; // 500ms delay between TMDB requests

async function enhanceExistingData() {
  console.log('🚀 Starting TMDB enhancement of existing diary entries...');

  try {
    // 1. Get all diary entries that don't have TMDB data yet
    console.log('Fetching diary entries without TMDB data...');
    
    const { data: diaryEntries, error: fetchError } = await supabaseAdmin
      .from('diary')
      .select('id, title, release_year, director, tmdb_id')
      .or('tmdb_id.is.null,overview.is.null');

    if (fetchError) {
      throw fetchError;
    }

    if (!diaryEntries || diaryEntries.length === 0) {
      console.log('✅ All diary entries already have TMDB data!');
      return;
    }

    console.log(`Found ${diaryEntries.length} entries to enhance with TMDB data`);

    // 2. Process entries in batches
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < diaryEntries.length; i += BATCH_SIZE) {
      const batch = diaryEntries.slice(i, i + BATCH_SIZE);
      console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(diaryEntries.length / BATCH_SIZE)}...`);

      for (const entry of batch) {
        try {
          console.log(`Processing: "${entry.title}" (${entry.release_year || 'no year'})`);

          // Skip if already has TMDB ID
          if (entry.tmdb_id) {
            console.log(`  ↳ Already has TMDB data, skipping...`);
            skippedCount++;
            continue;
          }

          // Fetch TMDB data
          const tmdbData = await tmdbService.fetchMovieData(entry.title, entry.release_year);

          if (!tmdbData) {
            console.log(`  ↳ ❌ Could not find TMDB data`);
            errorCount++;
            continue;
          }

          // Update diary entry with TMDB data while preserving existing user data
          const updateData = {
            tmdb_id: tmdbData.tmdb_id,
            overview: tmdbData.overview,
            poster_url: tmdbData.poster_path ? tmdbService.getImageUrl(tmdbData.poster_path) : null,
            backdrop_path: tmdbData.backdrop_path,
            vote_average: tmdbData.vote_average,
            vote_count: tmdbData.vote_count,
            popularity: tmdbData.popularity,
            original_language: tmdbData.original_language,
            original_title: tmdbData.original_title,
            tagline: tmdbData.tagline,
            status: tmdbData.status,
            budget: tmdbData.budget,
            revenue: tmdbData.revenue,
            imdb_id: tmdbData.imdb_id,
            homepage: tmdbData.homepage,
            // Update director if we found a better match, otherwise keep existing
            director: tmdbData.directors?.map(d => d.name).join(', ') || entry.director,
            // Update genres array
            genres: tmdbData.genres?.map(g => g.name) || [],
            // Fill in missing release data if available
            release_date: tmdbData.release_date,
            runtime: tmdbData.runtime,
            updated_at: new Date().toISOString()
          };

          // Update the diary entry
          const { error: updateError } = await supabaseAdmin
            .from('diary')
            .update(updateData)
            .eq('id', entry.id);

          if (updateError) {
            console.log(`  ↳ ❌ Database update failed:`, updateError.message);
            errorCount++;
            continue;
          }

          // Try to save to supporting tables (if they exist)
          try {
            // Save directors if supporting tables exist
            const directorIds = [];
            for (const directorData of tmdbData.directors || []) {
              try {
                const director = await movieService.upsertDirector({
                  tmdb_id: directorData.tmdb_id,
                  name: directorData.name,
                  profile_path: directorData.profile_path
                });
                directorIds.push(director.id);
              } catch (error) {
                // Ignore if directors table doesn't exist
                break;
              }
            }

            // Save genres if supporting tables exist
            const genreIds = [];
            for (const genreData of tmdbData.genres || []) {
              try {
                const genre = await movieService.upsertGenre({
                  tmdb_id: genreData.id,
                  name: genreData.name
                });
                genreIds.push(genre.id);
              } catch (error) {
                // Ignore if genres table doesn't exist
                break;
              }
            }

            // Link movie to directors and genres if tables exist
            if (directorIds.length > 0) {
              await movieService.linkMovieDirectors(entry.id, directorIds);
            }
            if (genreIds.length > 0) {
              await movieService.linkMovieGenres(entry.id, genreIds);
            }
          } catch (error) {
            // Ignore relationship table errors - they're optional
          }

          console.log(`  ↳ ✅ Enhanced successfully (TMDB ID: ${tmdbData.tmdb_id})`);
          successCount++;

          // Rate limiting delay
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));

        } catch (error) {
          console.log(`  ↳ ❌ Error processing "${entry.title}":`, error.message);
          errorCount++;
        }
      }

      // Delay between batches
      if (i + BATCH_SIZE < diaryEntries.length) {
        console.log('Waiting before next batch...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 3. Summary
    console.log('\n🎉 Enhancement completed!');
    console.log(`✅ Successfully enhanced: ${successCount} entries`);
    console.log(`⏭️  Skipped (already had TMDB data): ${skippedCount} entries`);
    console.log(`❌ Failed to enhance: ${errorCount} entries`);
    console.log(`📊 Total processed: ${successCount + skippedCount + errorCount} entries`);

    if (errorCount > 0) {
      console.log('\n💡 Some entries failed to enhance. This is normal for:');
      console.log('   - Movies not available in TMDB');
      console.log('   - Misspelled or alternate titles');
      console.log('   - Very old or obscure films');
      console.log('   - TV shows or documentaries not in TMDB movie database');
    }

    console.log('\n🚀 You can now start the backend server with: npm run dev');

  } catch (error) {
    console.error('❌ Enhancement failed:', error);
    console.error('\nPlease check your:');
    console.error('- Database connection');
    console.error('- TMDB API key');
    console.error('- Network connection');
    process.exit(1);
  }
}

// Run enhancement if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  enhanceExistingData()
    .then(() => {
      console.log('\nEnhancement script completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nEnhancement script failed:', error);
      process.exit(1);
    });
}

export default enhanceExistingData; 