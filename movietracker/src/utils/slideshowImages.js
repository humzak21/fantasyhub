// Import slideshow images statically for production compatibility
import skyfall004 from '../assets/skyfall004.jpg';
import m0091 from '../assets/M_0091.jpg';
import jKhsC3yguywiKF1XA6OlslFhlwT from '../assets/jKhsC3yguywiKF1XA6OlslFhlwT.jpg';
import dunkirk666 from '../assets/Dunkirk_666.jpg';
import dunkirk668 from '../assets/Dunkirk_668.jpg';
import dunkirk053 from '../assets/Dunkirk_053.jpg';
import spiderverse0940 from '../assets/Spiderverse_0940.jpg';
import theBatman2856 from '../assets/TheBatman_2856.jpg';
import theBatman1738 from '../assets/TheBatman_1738.jpg';
import theBatman1736 from '../assets/TheBatman_1736.jpg';
import theBatman1348 from '../assets/TheBatman_1348.jpg';
import theBatman0184 from '../assets/TheBatman_0184.jpg';
import theBatman0204 from '../assets/TheBatman_0204.jpg';
import zRKQW58MBEY078AxkHxEJzUskCl from '../assets/zRKQW58MBEY078AxkHxEJzUskCl.jpg';
import br2049_696 from '../assets/BR2049_696.jpg';
import br2049_241 from '../assets/BR2049_241.jpg';
import br2049_223 from '../assets/BR2049_223.jpg';
import br2049_222 from '../assets/BR2049_222.jpg';
import br2049_112 from '../assets/BR2049_112.jpg';
import br2049_006 from '../assets/BR2049_006.jpg';
import br2049_004 from '../assets/BR2049_004.jpg';
import c6PNllNr6scbHpbrZlGdvldxZjX from '../assets/c6PNllNr6scbHpbrZlGdvldxZjX.jpg';
import ijgJxqQ6XDjLF9clAem3lnn4lNG from '../assets/ijgJxqQ6XDjLF9clAem3lnn4lNG.jpg';
import sAtoMqDVhNDQBc3QJL3RF6hlhGq from '../assets/sAtoMqDVhNDQBc3QJL3RF6hlhGq.jpg';
import bMdSmfI0qwpAkvhAL7sqpjmwgf4 from '../assets/bMdSmfI0qwpAkvhAL7sqpjmwgf4.jpg';
import prisonersFeatured from '../assets/Prisoners-Featured.jpeg';
import mv5BMTY1Nzk4ODUwMF5BMl5BanBnXkFtZTcwMzc0OTk1Mw from '../assets/MV5BMTY1Nzk4ODUwMF5BMl5BanBnXkFtZTcwMzc0OTk1Mw@@._V1_.jpg';
import ingloriousBasterdsLarge from '../assets/inglourious_basterds-891465956-large.jpg';
import ingloriousBasterdsFeatured from '../assets/inglourious_basterds_featured.jpg';
import inceptionEndingTopSpinning from '../assets/inception-ending-top-spinning.jpg';

// Static slideshow images array for production compatibility
const slideshowImages = [
  skyfall004,
  m0091,
  jKhsC3yguywiKF1XA6OlslFhlwT,
  dunkirk666,
  dunkirk668,
  dunkirk053,
  spiderverse0940,
  theBatman2856,
  theBatman1738,
  theBatman1736,
  theBatman1348,
  theBatman0184,
  theBatman0204,
  zRKQW58MBEY078AxkHxEJzUskCl,
  br2049_696,
  br2049_241,
  br2049_223,
  br2049_222,
  br2049_112,
  br2049_006,
  br2049_004,
  c6PNllNr6scbHpbrZlGdvldxZjX,
  ijgJxqQ6XDjLF9clAem3lnn4lNG,
  sAtoMqDVhNDQBc3QJL3RF6hlhGq,
  bMdSmfI0qwpAkvhAL7sqpjmwgf4,
  prisonersFeatured,
  mv5BMTY1Nzk4ODUwMF5BMl5BanBnXkFtZTcwMzc0OTk1Mw,
  ingloriousBasterdsLarge,
  ingloriousBasterdsFeatured,
  inceptionEndingTopSpinning
];

// Utility function to shuffle an array
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Dynamic import function for slideshow images
export const importSlideshowImages = () => {
  try {
    // In production, use the static imports
    if (import.meta.env.PROD) {
      console.log('Production mode: Using static slideshow images');
      return shuffleArray(slideshowImages);
    }
    
    // In development, try dynamic import for hot reloading
    try {
      const imageModules = import.meta.glob('/src/assets/*.{jpg,jpeg,png,webp,gif,bmp}', { eager: true });
      console.log('Development mode: Found image modules:', Object.keys(imageModules));
      
      // Filter out logo files and font files from slideshow
      const filteredModules = Object.entries(imageModules).filter(([path, module]) => {
        const fileName = path.toLowerCase();
        return !fileName.includes('logo') && 
               !fileName.includes('razed') && 
               !fileName.includes('.ttf') &&
               !fileName.includes('.svg');
      });
      
      const imageUrls = filteredModules
        .map(([path, module]) => module.default)
        .filter(url => url);
      
      console.log('Development mode: Loaded slideshow images:', imageUrls);
      return imageUrls.length > 0 ? shuffleArray(imageUrls) : shuffleArray(slideshowImages);
    } catch (devError) {
      console.warn('Development dynamic import failed, falling back to static images:', devError);
      return shuffleArray(slideshowImages);
    }
  } catch (error) {
    console.error('Error in importSlideshowImages:', error);
    return shuffleArray(slideshowImages); // Fallback to static images
  }
}; 