// TMDB API utilities and movie data parsing

/**
 * Construct TMDB image URL with different sizes
 * @param {string} path - Image path from TMDB
 * @param {string} size - Image size (w92, w154, w185, w342, w500, w780, original for posters)
 * @returns {string|null} Complete image URL or null
 */
export const getTMDBImageUrl = (path, size = 'w500') => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

/**
 * Get multiple image sizes for a TMDB image path
 * @param {string} path - Image path from TMDB
 * @returns {Object} Object with different image sizes
 */
export const getTMDBImageSizes = (path) => {
  if (!path) return null;
  
  return {
    small: getTMDBImageUrl(path, 'w185'),
    medium: getTMDBImageUrl(path, 'w342'),
    large: getTMDBImageUrl(path, 'w500'),
    xlarge: getTMDBImageUrl(path, 'w780'),
    original: getTMDBImageUrl(path, 'original')
  };
};

/**
 * Parse the detailed ratings CSV to get 0-100 ratings for each movie
 * @returns {Promise<Map>} Map of movie titles to their detailed ratings (0-100)
 */
export const parseDetailedRatings = async () => {
  try {
    const response = await fetch('/movie_tracker_detailed_ratings.csv');
    const csvText = await response.text();
    
    const lines = csvText.trim().split('\n');
    const ratingsMap = new Map();
    
    // Skip the header line and process each movie entry
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Split by comma and extract the relevant parts
      const parts = line.split(',');
      if (parts.length >= 3) {
        const movieTitle = parts[1]; // Second column is the movie title
        const detailedRating = parseFloat(parts[2]); // Third column is the 0-100 rating
        
        if (movieTitle && !isNaN(detailedRating)) {
          ratingsMap.set(movieTitle.trim(), detailedRating);
        }
      }
    }
    
    console.log(`Loaded detailed ratings for ${ratingsMap.size} movies`);
    return ratingsMap;
  } catch (error) {
    console.error('Error parsing detailed ratings CSV:', error);
    return new Map();
  }
};

// Parse the movie data from CSV format
export const parseMovieData = async () => {
  try {
    const response = await fetch('/movies_complete.csv');
    const csvText = await response.text();
    
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    
    const movies = [];
    
    // Load detailed ratings
    const detailedRatings = await parseDetailedRatings();
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      // Handle CSV parsing with quoted fields
      const values = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim()); // Add the last value
      
      if (values.length >= 5) {
        const [title, month, day, year, rating] = values;
        const cleanTitle = title.replace(/^"|"$/g, ''); // Remove quotes if present
        
        // Create a proper date string
        const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        
        // Get detailed rating if available
        const detailedRating = detailedRatings.get(cleanTitle);
        
        movies.push({
          title: cleanTitle,
          month: parseInt(month),
          day: parseInt(day),
          year: parseInt(year),
          rating: parseFloat(rating),
          detailedRating: detailedRating || null, // 0-100 scale rating
          date: dateStr
        });
      }
    }
    
    return movies;
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return [];
  }
};

export const getMovieStats = (movies) => {
  const totalMovies = movies.length;
  const uniqueMovies = new Set(movies.map(m => m.title)).size;
  const averageRating = movies.reduce((sum, m) => sum + m.rating, 0) / totalMovies;
  const fiveStarMovies = movies.filter(m => m.rating === 5).length;
  
  // Get year distribution (watch year)
  const yearCounts = {};
  movies.forEach(movie => {
    const watchYear = movie.year;
    yearCounts[watchYear] = (yearCounts[watchYear] || 0) + 1;
  });

  // Get rating distribution
  const ratingCounts = {};
  movies.forEach(movie => {
    const rating = movie.rating;
    ratingCounts[rating] = (ratingCounts[rating] || 0) + 1;
  });

  // Get monthly distribution
  const monthCounts = {};
  movies.forEach(movie => {
    const month = new Date(movie.date).toLocaleString('default', { month: 'long', year: 'numeric' });
    monthCounts[month] = (monthCounts[month] || 0) + 1;
  });

  return {
    totalMovies,
    uniqueMovies,
    averageRating: Math.round(averageRating * 100) / 100,
    fiveStarMovies,
    yearCounts,
    ratingCounts,
    monthCounts,
    rewatchPercentage: Math.round(((totalMovies - uniqueMovies) / totalMovies) * 100)
  };
};

export const getTopMovies = (movies, limit = 10) => {
  return movies
    .filter(m => m.rating >= 4.5)
    .sort((a, b) => b.rating - a.rating || new Date(b.date) - new Date(a.date))
    .slice(0, limit);
};

/**
 * Get all movies with perfect detailed ratings (100/100)
 * @param {Array} movies - Array of movie objects
 * @returns {Array} Movies with 100/100 detailed rating
 */
export const getPerfectRatedMovies = (movies) => {
  return movies
    .filter(m => m.detailedRating === 100)
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by most recently watched
};

/**
 * Get movies by detailed rating range
 * @param {Array} movies - Array of movie objects
 * @param {number} minRating - Minimum detailed rating (0-100)
 * @param {number} maxRating - Maximum detailed rating (0-100)
 * @returns {Array} Movies within the rating range (unique titles, latest entry only)
 */
export const getMoviesByDetailedRating = (movies, minRating, maxRating = 100) => {
  // Filter by rating range first
  const filteredMovies = movies
    .filter(m => m.detailedRating !== null && m.detailedRating >= minRating && m.detailedRating <= maxRating);
  
  // Create a map to store the latest entry for each unique title
  const uniqueMoviesMap = new Map();
  
  filteredMovies.forEach(movie => {
    const existingMovie = uniqueMoviesMap.get(movie.title);
    
    // If no existing movie or this one is more recent, update the map
    if (!existingMovie || new Date(movie.date) > new Date(existingMovie.date)) {
      uniqueMoviesMap.set(movie.title, movie);
    }
  });
  
  // Convert map values back to array and sort
  return Array.from(uniqueMoviesMap.values())
    .sort((a, b) => b.detailedRating - a.detailedRating || new Date(b.date) - new Date(a.date));
};

/**
 * Convert detailed rating (0-100) to star rating (0-5)
 * @param {number} detailedRating - Rating on 0-100 scale
 * @returns {number} Rating on 0-5 scale
 */
export const convertDetailedRatingToStars = (detailedRating) => {
  if (detailedRating === null || detailedRating === undefined) return null;
  return Math.round((detailedRating / 100) * 5 * 2) / 2; // Round to nearest 0.5
};

export const getRecentMovies = (movies, limit = 20) => {
  return movies
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
};

export const getMoviesByYear = (movies, year) => {
  return movies.filter(movie => movie.year === year);
};

export const searchMovies = (movies, query) => {
  if (!query) return movies;
  
  const lowerQuery = query.toLowerCase();
  
  return movies.filter(movie => {
    // Search in title
    if (movie.title.toLowerCase().includes(lowerQuery)) return true;
    
    // Search in TMDB data if available
    if (movie.tmdb) {
      // Search in overview
      if (movie.tmdb.overview && movie.tmdb.overview.toLowerCase().includes(lowerQuery)) return true;
      
      // Search in genres
      if (movie.tmdb.genres && movie.tmdb.genres.some(genre =>
        genre.name.toLowerCase().includes(lowerQuery)
      )) return true;
      
      // Search in cast
      if (movie.tmdb.cast && movie.tmdb.cast.some(actor =>
        actor.name.toLowerCase().includes(lowerQuery) ||
        actor.character.toLowerCase().includes(lowerQuery)
      )) return true;
      
      // Search in crew
      if (movie.tmdb.crew && movie.tmdb.crew.some(person =>
        person.name.toLowerCase().includes(lowerQuery)
      )) return true;
    }
    
    return false;
  });
};

export const filterMoviesByRating = (movies, minRating) => {
  return movies.filter(movie => movie.rating >= minRating);
};

// TMDB API Configuration
// Note: API key is now handled by the backend proxy
const TMDB_BASE_URL = '/api/tmdb'; // Use proxy instead of direct API
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

// Cache for API responses to avoid redundant calls
const movieCache = new Map();
const genreCache = new Map();

/**
 * Fetch movie data from TMDB API by title
 * @param {string} title - Movie title to search for
 * @param {number} year - Optional release year for better matching
 * @returns {Promise<Object|null>} Complete movie data or null if not found
 */
export const fetchMovieFromTMDB = async (title, year = null) => {
  const cacheKey = `${title.toLowerCase()}_${year || 'any'}`;
  
  // Check cache first
  if (movieCache.has(cacheKey)) {
    return movieCache.get(cacheKey);
  }

  try {
    // Step 1: Search for the movie (API key handled by backend)
    const searchUrl = `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}`;
    const searchResponse = await fetch(searchUrl);
    
    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    if (!searchData.results || searchData.results.length === 0) {
      console.warn(`No results found for movie: ${title}`);
      movieCache.set(cacheKey, null);
      return null;
    }

    // Get the best match (first result, or match by year if provided)
    let bestMatch = searchData.results[0];
    if (year) {
      const yearMatch = searchData.results.find(movie =>
        movie.release_date && new Date(movie.release_date).getFullYear() === year
      );
      if (yearMatch) bestMatch = yearMatch;
    }

    // Step 2: Get detailed movie information (API key handled by backend)
    const detailsUrl = `${TMDB_BASE_URL}/movie/${bestMatch.id}?append_to_response=credits,images,videos`;
    const detailsResponse = await fetch(detailsUrl);
    
    if (!detailsResponse.ok) {
      throw new Error(`Details fetch failed: ${detailsResponse.status}`);
    }
    
    const movieDetails = await detailsResponse.json();

    // Step 3: Process and structure the data
    const processedMovie = {
      id: movieDetails.id,
      title: movieDetails.title,
      originalTitle: movieDetails.original_title,
      overview: movieDetails.overview,
      releaseDate: movieDetails.release_date,
      runtime: movieDetails.runtime,
      genres: movieDetails.genres || [],
      voteAverage: movieDetails.vote_average,
      voteCount: movieDetails.vote_count,
      popularity: movieDetails.popularity,
      
      // Images
      posterPath: movieDetails.poster_path,
      backdropPath: movieDetails.backdrop_path,
      posterUrl: movieDetails.poster_path ? `${TMDB_IMAGE_BASE_URL}/w500${movieDetails.poster_path}` : null,
      backdropUrl: movieDetails.backdrop_path ? `${TMDB_IMAGE_BASE_URL}/w1280${movieDetails.backdrop_path}` : null,
      
      // Additional images
      images: {
        posters: movieDetails.images?.posters?.slice(0, 5).map(img => ({
          filePath: img.file_path,
          url: `${TMDB_IMAGE_BASE_URL}/w500${img.file_path}`,
          aspectRatio: img.aspect_ratio,
          width: img.width,
          height: img.height
        })) || [],
        backdrops: movieDetails.images?.backdrops?.slice(0, 5).map(img => ({
          filePath: img.file_path,
          url: `${TMDB_IMAGE_BASE_URL}/w1280${img.file_path}`,
          aspectRatio: img.aspect_ratio,
          width: img.width,
          height: img.height
        })) || []
      },
      
      // Cast and Crew
      cast: movieDetails.credits?.cast?.slice(0, 10).map(person => ({
        id: person.id,
        name: person.name,
        character: person.character,
        profilePath: person.profile_path,
        profileUrl: person.profile_path ? `${TMDB_IMAGE_BASE_URL}/w185${person.profile_path}` : null
      })) || [],
      
      crew: movieDetails.credits?.crew?.filter(person =>
        ['Director', 'Producer', 'Writer', 'Screenplay'].includes(person.job)
      ).map(person => ({
        id: person.id,
        name: person.name,
        job: person.job,
        profilePath: person.profile_path,
        profileUrl: person.profile_path ? `${TMDB_IMAGE_BASE_URL}/w185${person.profile_path}` : null
      })) || [],
      
      // Videos (trailers, etc.)
      videos: movieDetails.videos?.results?.filter(video =>
        video.site === 'YouTube' && video.type === 'Trailer'
      ).slice(0, 3).map(video => ({
        id: video.id,
        key: video.key,
        name: video.name,
        type: video.type,
        url: `https://www.youtube.com/watch?v=${video.key}`
      })) || [],
      
      // Production info
      productionCompanies: movieDetails.production_companies?.map(company => ({
        id: company.id,
        name: company.name,
        logoPath: company.logo_path,
        logoUrl: company.logo_path ? `${TMDB_IMAGE_BASE_URL}/w185${company.logo_path}` : null
      })) || [],
      
      productionCountries: movieDetails.production_countries || [],
      spokenLanguages: movieDetails.spoken_languages || [],
      
      // Additional metadata
      adult: movieDetails.adult,
      budget: movieDetails.budget,
      revenue: movieDetails.revenue,
      status: movieDetails.status,
      tagline: movieDetails.tagline,
      homepage: movieDetails.homepage
    };

    // Cache the result
    movieCache.set(cacheKey, processedMovie);
    return processedMovie;

  } catch (error) {
    console.error(`Error fetching movie data for "${title}":`, error);
    movieCache.set(cacheKey, null);
    return null;
  }
};

/**
 * Fetch genre list from TMDB
 * @returns {Promise<Object>} Genre mapping object
 */
export const fetchGenresFromTMDB = async () => {
  if (genreCache.has('genres')) {
    return genreCache.get('genres');
  }

  try {
    const genresUrl = `${TMDB_BASE_URL}/genre/movie/list`;
    const response = await fetch(genresUrl);
    
    if (!response.ok) {
      throw new Error(`Genres fetch failed: ${response.status}`);
    }
    
    const data = await response.json();
    const genreMap = {};
    
    data.genres.forEach(genre => {
      genreMap[genre.id] = genre.name;
    });
    
    genreCache.set('genres', genreMap);
    return genreMap;
  } catch (error) {
    console.error('Error fetching genres from TMDB:', error);
    return {};
  }
};

/**
 * Enhanced function to get genre statistics from actual movie data
 * @param {Array} movies - Array of movie objects with titles
 * @returns {Promise<Object>} Genre statistics
 */
export const getGenreStats = async (movies) => {
  const genreStats = {};
  const genreMap = await fetchGenresFromTMDB();
  
  // Process each unique movie title
  const uniqueTitles = [...new Set(movies.map(m => m.title))];
  
  for (const title of uniqueTitles) {
    try {
      const movieData = await fetchMovieFromTMDB(title);
      if (movieData && movieData.genres) {
        movieData.genres.forEach(genre => {
          if (!genreStats[genre.name]) {
            genreStats[genre.name] = [];
          }
          genreStats[genre.name].push(title);
        });
      }
    } catch (error) {
      console.warn(`Could not fetch genre data for: ${title}`);
    }
  }
  
  return genreStats;
};

/**
 * Batch fetch movie data for multiple titles
 * @param {Array} titles - Array of movie titles
 * @param {number} batchSize - Number of concurrent requests (default: 5)
 * @returns {Promise<Array>} Array of movie data objects
 */
export const batchFetchMovies = async (titles, batchSize = 5) => {
  const results = [];
  
  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize);
    const batchPromises = batch.map(title => fetchMovieFromTMDB(title));
    
    try {
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    } catch (error) {
      console.error('Error in batch fetch:', error);
      // Add nulls for failed batch
      results.push(...new Array(batch.length).fill(null));
    }
    
    // Add a small delay between batches to respect API rate limits
    if (i + batchSize < titles.length) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  
  return results;
};

/**
 * Get enhanced movie data by combining CSV data with TMDB data
 * @param {Array} csvMovies - Movies from CSV parsing
 * @returns {Promise<Array>} Enhanced movie objects
 */
export const getEnhancedMovieData = async (csvMovies) => {
  const uniqueTitles = [...new Set(csvMovies.map(m => m.title))];
  const tmdbData = await batchFetchMovies(uniqueTitles);
  
  // Create a map of TMDB data by title
  const tmdbMap = new Map();
  uniqueTitles.forEach((title, index) => {
    if (tmdbData[index]) {
      tmdbMap.set(title.toLowerCase(), tmdbData[index]);
    }
  });
  
  // Enhance CSV movies with TMDB data
  return csvMovies.map(csvMovie => {
    const tmdbMovie = tmdbMap.get(csvMovie.title.toLowerCase());
    
    return {
      ...csvMovie,
      tmdb: tmdbMovie,
      // Add convenient access to common TMDB fields
      genres: tmdbMovie?.genres || [],
      posterUrl: tmdbMovie?.posterUrl || null,
      backdropUrl: tmdbMovie?.backdropUrl || null,
      overview: tmdbMovie?.overview || null,
      tmdbRating: tmdbMovie?.voteAverage || null,
      releaseDate: tmdbMovie?.releaseDate || null,
      runtime: tmdbMovie?.runtime || null
    };
  });
};

/**
 * Get movies by genre
 * @param {Array} movies - Enhanced movie array
 * @param {string} genreName - Genre name to filter by
 * @returns {Array} Movies matching the genre
 */
export const getMoviesByGenre = (movies, genreName) => {
  return movies.filter(movie =>
    movie.genres && movie.genres.some(genre =>
      genre.name.toLowerCase() === genreName.toLowerCase()
    )
  );
};

/**
 * Get movies by director
 * @param {Array} movies - Enhanced movie array
 * @param {string} directorName - Director name to filter by
 * @returns {Array} Movies by the specified director
 */
export const getMoviesByDirector = (movies, directorName) => {
  return movies.filter(movie =>
    movie.tmdb && movie.tmdb.crew && movie.tmdb.crew.some(person =>
      person.job === 'Director' &&
      person.name.toLowerCase().includes(directorName.toLowerCase())
    )
  );
};

/**
 * Get movies by actor
 * @param {Array} movies - Enhanced movie array
 * @param {string} actorName - Actor name to filter by
 * @returns {Array} Movies featuring the specified actor
 */
export const getMoviesByActor = (movies, actorName) => {
  return movies.filter(movie =>
    movie.tmdb && movie.tmdb.cast && movie.tmdb.cast.some(actor =>
      actor.name.toLowerCase().includes(actorName.toLowerCase())
    )
  );
};

/**
 * Get comprehensive movie statistics including TMDB data
 * @param {Array} movies - Enhanced movie array
 * @returns {Object} Comprehensive statistics
 */
export const getEnhancedMovieStats = (movies) => {
  const basicStats = getMovieStats(movies);
  
  // Additional TMDB-based statistics
  const moviesWithTMDB = movies.filter(m => m.tmdb);
  const genreDistribution = {};
  const decadeDistribution = {};
  const runtimeStats = [];
  
  moviesWithTMDB.forEach(movie => {
    // Genre distribution
    if (movie.genres) {
      movie.genres.forEach(genre => {
        genreDistribution[genre.name] = (genreDistribution[genre.name] || 0) + 1;
      });
    }
    
    // Decade distribution
    if (movie.tmdb.releaseDate) {
      const year = new Date(movie.tmdb.releaseDate).getFullYear();
      const decade = Math.floor(year / 10) * 10;
      const decadeLabel = `${decade}s`;
      decadeDistribution[decadeLabel] = (decadeDistribution[decadeLabel] || 0) + 1;
    }
    
    // Runtime stats
    if (movie.tmdb.runtime) {
      runtimeStats.push(movie.tmdb.runtime);
    }
  });
  
  // Calculate runtime statistics
  const avgRuntime = runtimeStats.length > 0
    ? Math.round(runtimeStats.reduce((sum, runtime) => sum + runtime, 0) / runtimeStats.length)
    : 0;
  
  const sortedRuntimes = runtimeStats.sort((a, b) => a - b);
  const medianRuntime = sortedRuntimes.length > 0
    ? sortedRuntimes[Math.floor(sortedRuntimes.length / 2)]
    : 0;
  
  return {
    ...basicStats,
    tmdbDataAvailable: moviesWithTMDB.length,
    tmdbCoveragePercentage: Math.round((moviesWithTMDB.length / movies.length) * 100),
    genreDistribution,
    decadeDistribution,
    runtimeStats: {
      average: avgRuntime,
      median: medianRuntime,
      shortest: Math.min(...runtimeStats) || 0,
      longest: Math.max(...runtimeStats) || 0,
      total: runtimeStats.reduce((sum, runtime) => sum + runtime, 0)
    }
  };
};

/**
 * Get trending movies from TMDB (optional feature)
 * @param {string} timeWindow - 'day' or 'week'
 * @returns {Promise<Array>} Array of trending movies
 */
export const getTrendingMovies = async (timeWindow = 'week') => {
  try {
    const trendingUrl = `${TMDB_BASE_URL}/trending/movie/${timeWindow}`;
    const response = await fetch(trendingUrl);
    
    if (!response.ok) {
      throw new Error(`Trending fetch failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.results.map(movie => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      releaseDate: movie.release_date,
      voteAverage: movie.vote_average,
      posterUrl: movie.poster_path ? `${TMDB_IMAGE_BASE_URL}/w500${movie.poster_path}` : null,
      backdropUrl: movie.backdrop_path ? `${TMDB_IMAGE_BASE_URL}/w1280${movie.backdrop_path}` : null
    }));
  } catch (error) {
    console.error('Error fetching trending movies:', error);
    return [];
  }
};