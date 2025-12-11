import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import movieService from '../services/movieService.js';
import tmdbService from '../services/tmdbService.js';

// Only load .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

async function parseCSVData(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function seedFromCSV() {
  console.log('🌱 Starting database seeding from CSV files...');

  try {
    // Path to your CSV files (adjust as needed)
    const csvPath = path.join(process.cwd(), '..', 'movies_complete.csv');
    const detailedRatingsPath = path.join(process.cwd(), '..', 'movie_tracker_detailed_ratings.csv');

    console.log('📖 Reading CSV files...');
    
    // Check if files exist
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ CSV file not found: ${csvPath}`);
      return;
    }

    // Read main movie data
    const movieData = await parseCSVData(csvPath);
    console.log(`📊 Found ${movieData.length} movie entries`);

    // Read detailed ratings if file exists
    let detailedRatings = new Map();
    if (fs.existsSync(detailedRatingsPath)) {
      const detailedData = await parseCSVData(detailedRatingsPath);
      detailedData.forEach(row => {
        // Assuming format: id, title, detailed_rating
        if (row.title && row.detailed_rating) {
          detailedRatings.set(row.title.trim(), parseFloat(row.detailed_rating));
        }
      });
      console.log(`📊 Found ${detailedRatings.size} detailed ratings`);
    }

    // Process movies in batches to avoid overwhelming TMDB API
    const batchSize = 5;
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < movieData.length; i += batchSize) {
      const batch = movieData.slice(i, i + batchSize);
      console.log(`\n🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(movieData.length / batchSize)}`);

      for (const row of batch) {
        try {
          // Parse the CSV row data
          const title = row.title || row.Title || row['Movie Title'];
          const month = parseInt(row.month || row.Month || 1);
          const day = parseInt(row.day || row.Day || 1);
          const year = parseInt(row.year || row.Year);
          const rating = parseFloat(row.rating || row.Rating || row['User Rating']);

          if (!title || !year || isNaN(rating)) {
            console.warn(`⚠️ Skipping invalid row: ${JSON.stringify(row)}`);
            continue;
          }

          // Create watch date
          const watchDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          
          // Get detailed rating if available
          const detailedRating = detailedRatings.get(title) || null;

          console.log(`🎬 Processing: ${title} (${year}) - Rating: ${rating}/5`);

          // Fetch and save movie
          const result = await movieService.fetchAndSaveMovie(
            title,
            null, // Let TMDB search find the best match
            rating,
            detailedRating,
            watchDate,
            false // Assume first watch unless we have logic to detect rewatches
          );

          if (result.success) {
            successCount++;
            console.log(`✅ Successfully added: ${title}`);
          } else {
            errorCount++;
            errors.push({ title, error: result.error });
            console.log(`❌ Failed to add: ${title} - ${result.error}`);
          }

          // Rate limiting delay
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
          errorCount++;
          errors.push({ title: row.title || 'Unknown', error: error.message });
          console.error(`❌ Error processing movie:`, error);
        }
      }

      // Longer delay between batches
      if (i + batchSize < movieData.length) {
        console.log('⏳ Waiting before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n🎉 Seeding completed!');
    console.log(`✅ Successfully processed: ${successCount} movies`);
    console.log(`❌ Failed to process: ${errorCount} movies`);

    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach(({ title, error }) => {
        console.log(`  - ${title}: ${error}`);
      });
    }

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

async function seedGenres() {
  console.log('🎭 Seeding genres from TMDB...');
  
  try {
    const genres = await tmdbService.getGenres();
    
    for (const genre of genres) {
      await movieService.upsertGenre({
        tmdb_id: genre.id,
        name: genre.name
      });
    }
    
    console.log(`✅ Successfully seeded ${genres.length} genres`);
  } catch (error) {
    console.error('❌ Failed to seed genres:', error);
  }
}

async function runSeed() {
  console.log('🚀 Starting comprehensive database seeding...\n');
  
  try {
    // First seed genres
    await seedGenres();
    
    // Then seed movies from CSV
    await seedFromCSV();
    
    console.log('\n🎉 Database seeding completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Seeding process failed:', error);
    process.exit(1);
  }
}

// Run seeding if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSeed();
}

export { seedFromCSV, seedGenres, runSeed }; 