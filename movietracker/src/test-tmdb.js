// Simple test script to verify TMDB functionality
import { fetchMovieFromTMDB } from './utils/movieData.js';

export async function testTMDBIntegration() {
  console.log('🧪 Testing TMDB Integration...');
  
  try {
    // Test 1: Fetch a popular movie
    console.log('Testing: The Dark Knight (2008)');
    const darkKnight = await fetchMovieFromTMDB('The Dark Knight', 2008);
    
    if (darkKnight) {
      console.log('✅ Successfully fetched The Dark Knight');
      console.log('- Title:', darkKnight.title);
      console.log('- Poster Path:', darkKnight.posterPath);
      console.log('- Poster URL:', darkKnight.posterUrl);
      console.log('- TMDB ID:', darkKnight.id);
      
      // Test image loading
      if (darkKnight.posterUrl) {
        console.log('🖼️ Testing image loading...');
        const img = new Image();
        img.onload = () => {
          console.log('✅ Image loaded successfully!');
          console.log('- Image dimensions:', img.naturalWidth, 'x', img.naturalHeight);
        };
        img.onerror = (error) => {
          console.error('❌ Image failed to load:', error);
        };
        img.src = darkKnight.posterUrl;
      }
    } else {
      console.error('❌ Failed to fetch The Dark Knight');
    }
    
    // Test 2: Fetch another movie
    console.log('\nTesting: Inception (2010)');
    const inception = await fetchMovieFromTMDB('Inception', 2010);
    
    if (inception) {
      console.log('✅ Successfully fetched Inception');
      console.log('- Title:', inception.title);
      console.log('- Poster URL:', inception.posterUrl);
    } else {
      console.error('❌ Failed to fetch Inception');
    }
    
    return { darkKnight, inception };
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return null;
  }
}

// Auto-run test if in browser
if (typeof window !== 'undefined') {
  window.testTMDB = testTMDBIntegration;
  console.log('TMDB Test loaded. Run window.testTMDB() in console to test.');
} 