// Debug script to test TMDB API functionality
import { fetchMovieFromTMDB, getTMDBImageUrl } from './utils/movieData.js';

// Test function to debug TMDB API calls
async function debugTMDBAPI() {
  console.log('=== TMDB API Debug Test ===');
  
  try {
    console.log('Testing movie search and data fetch...');
    
    // Test with a well-known movie
    const movieData = await fetchMovieFromTMDB('The Dark Knight', 2008);
    
    if (movieData) {
      console.log('✅ Movie data fetched successfully:');
      console.log('Title:', movieData.title);
      console.log('Release Date:', movieData.releaseDate);
      console.log('Overview:', movieData.overview?.substring(0, 100) + '...');
      console.log('Rating:', movieData.voteAverage);
      console.log('Genres:', movieData.genres?.map(g => g.name).join(', '));
      
      // Test image URL generation
      if (movieData.posterPath) {
        const testImageUrl = getTMDBImageUrl(movieData.posterPath, 'w500');
        console.log('Poster URL:', testImageUrl);
      }
      
      console.log('Cast:', movieData.cast?.slice(0, 3).map(c => c.name).join(', '));
      console.log('Director:', movieData.crew?.find(c => c.job === 'Director')?.name);
    } else {
      console.log('❌ No movie data returned');
    }
    
  } catch (error) {
    console.error('❌ Error in TMDB API test:', error);
    console.log('This might be a CORS issue. TMDB API calls from browser might be blocked.');
    console.log('Make sure your backend proxy is running and configured correctly.');
  }
}

// Test function to check API connectivity
async function testAPIConnectivity() {
  console.log('\n=== Testing API Connectivity ===');
  
  try {
    // Test the backend proxy endpoint
    const testUrl = `/api/tmdb/configuration`;
    const response = await fetch(testUrl);
    
    console.log('API connectivity test status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Backend proxy is working correctly');
      console.log('TMDB Configuration received:', !!data.images);
    } else {
      console.log('❌ Backend proxy test failed');
      const errorText = await response.text();
      console.log('Error response:', errorText);
    }
    
  } catch (error) {
    console.error('❌ API connectivity test error:', error);
  }
}

// Main debug function
export async function runTMDBDebug() {
  await testAPIConnectivity();
  await debugTMDBAPI();
}

// Make it available globally for console testing
window.debugTMDB = runTMDBDebug;
console.log('TMDB Debug loaded. Run window.debugTMDB() in console to test.'); 