-- =====================================================
-- FIXED MOVIE TRACKER STATISTICS DATABASE FUNCTIONS
-- =====================================================
-- This file contains fixes for the PostgreSQL functions to resolve type mismatches
-- and add missing functionality needed by the frontend
-- =====================================================

-- 1. FIXED RATING STATISTICS
-- =====================================================

-- Fixed rating statistics with proper types and additional fields
CREATE OR REPLACE FUNCTION get_rating_stats()
RETURNS TABLE(
  average_rating DECIMAL(5,2),
  median_rating DECIMAL(5,2),
  mode_rating INTEGER,
  standard_deviation DECIMAL(5,2),
  total_rated BIGINT,
  five_star_percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH rating_stats AS (
    SELECT 
      (AVG(rating))::DECIMAL(5,2) as avg_rating,
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rating))::DECIMAL(5,2) as median_rating,
      (STDDEV(rating))::DECIMAL(5,2) as std_dev,
      COUNT(*) as total_rated,
      COUNT(*) FILTER (WHERE rating = 5) as five_star_count
    FROM diary 
    WHERE rating IS NOT NULL
  ),
  mode_rating_calc AS (
    SELECT rating::INTEGER as mode_val
    FROM diary 
    WHERE rating IS NOT NULL 
    GROUP BY rating::INTEGER
    ORDER BY COUNT(*) DESC, rating::INTEGER DESC 
    LIMIT 1
  )
  SELECT 
    rs.avg_rating,
    rs.median_rating,
    COALESCE(mrc.mode_val, 0),
    rs.std_dev,
    rs.total_rated,
    CASE 
      WHEN rs.total_rated > 0 THEN ((rs.five_star_count::DECIMAL / rs.total_rated * 100))::DECIMAL(5,2)
      ELSE 0::DECIMAL(5,2)
    END as five_star_percentage
  FROM rating_stats rs
  CROSS JOIN mode_rating_calc mrc;
END;
$$ LANGUAGE plpgsql;

-- 2. RUNTIME STATISTICS
-- =====================================================

-- Runtime statistics function
CREATE OR REPLACE FUNCTION get_runtime_stats()
RETURNS TABLE(
  total_runtime INTEGER,
  average_runtime DECIMAL(5,2),
  median_runtime DECIMAL(5,2),
  longest_runtime INTEGER,
  longest_title TEXT,
  shortest_runtime INTEGER,
  shortest_title TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH runtime_stats AS (
    SELECT 
      SUM(runtime) as total_runtime,
      (AVG(runtime))::DECIMAL(5,2) as avg_runtime,
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY runtime))::DECIMAL(5,2) as median_runtime
    FROM diary 
    WHERE runtime IS NOT NULL AND runtime > 0
  ),
  longest_film AS (
    SELECT runtime, title 
    FROM diary 
    WHERE runtime IS NOT NULL AND runtime > 0
    ORDER BY runtime DESC 
    LIMIT 1
  ),
  shortest_film AS (
    SELECT runtime, title 
    FROM diary 
    WHERE runtime IS NOT NULL AND runtime > 0
    ORDER BY runtime ASC 
    LIMIT 1
  )
  SELECT 
    rs.total_runtime,
    rs.avg_runtime,
    rs.median_runtime,
    lf.runtime,
    lf.title,
    sf.runtime,
    sf.title
  FROM runtime_stats rs
  CROSS JOIN longest_film lf
  CROSS JOIN shortest_film sf;
END;
$$ LANGUAGE plpgsql;

-- Runtime distribution by bins function
CREATE OR REPLACE FUNCTION get_runtime_distribution()
RETURNS TABLE(
  runtime_bin TEXT,
  film_count BIGINT,
  percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH unique_films AS (
    SELECT DISTINCT ON (LOWER(title))
      LOWER(title) as film_title,
      runtime
    FROM diary 
    WHERE runtime IS NOT NULL AND runtime > 0
    ORDER BY LOWER(title), watched_date DESC  -- Keep the most recent entry for each unique film
  ),
  runtime_bins AS (
    SELECT 
      CASE 
        WHEN runtime < 90 THEN '<90 min'
        WHEN runtime >= 90 AND runtime < 120 THEN '90-120 min'
        WHEN runtime >= 120 AND runtime < 150 THEN '120-150 min'
        WHEN runtime >= 150 THEN '>150 min'
        ELSE 'Unknown'
      END as bin_label,
      COUNT(*) as count_films
    FROM unique_films
    GROUP BY CASE 
      WHEN runtime < 90 THEN '<90 min'
      WHEN runtime >= 90 AND runtime < 120 THEN '90-120 min'
      WHEN runtime >= 120 AND runtime < 150 THEN '120-150 min'
      WHEN runtime >= 150 THEN '>150 min'
      ELSE 'Unknown'
    END
  ),
  total_films AS (
    SELECT COUNT(*) as total_count
    FROM unique_films
  )
  SELECT 
    rb.bin_label,
    rb.count_films,
    CASE 
      WHEN tf.total_count > 0 THEN ((rb.count_films::DECIMAL / tf.total_count * 100))::DECIMAL(5,2)
      ELSE 0::DECIMAL(5,2)
    END as percentage
  FROM runtime_bins rb
  CROSS JOIN total_films tf
  ORDER BY 
    CASE rb.bin_label
      WHEN '<90 min' THEN 1
      WHEN '90-120 min' THEN 2
      WHEN '120-150 min' THEN 3
      WHEN '>150 min' THEN 4
      ELSE 5
    END;
END;
$$ LANGUAGE plpgsql;

-- 3. WATCH SPAN STATISTICS
-- =====================================================

-- Watch span function with proper date handling
CREATE OR REPLACE FUNCTION get_watch_span()
RETURNS TABLE(
  first_watch_date DATE,
  last_watch_date DATE,
  watch_span TEXT,
  total_days INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH date_stats as (
    SELECT 
      MIN(watched_date) as first_date,
      MAX(watched_date) as last_date
    FROM diary
    WHERE watched_date IS NOT NULL
  )
  SELECT 
    ds.first_date,
    ds.last_date,
    CASE 
      WHEN ds.last_date IS NOT NULL AND ds.first_date IS NOT NULL THEN
        CONCAT(
          EXTRACT(YEAR FROM AGE(ds.last_date, ds.first_date))::TEXT, ' years, ',
          EXTRACT(MONTH FROM AGE(ds.last_date, ds.first_date))::TEXT, ' months'
        )
      ELSE 'No data'
    END as watch_span,
    CASE 
      WHEN ds.last_date IS NOT NULL AND ds.first_date IS NOT NULL THEN
        (ds.last_date - ds.first_date)::INTEGER
      ELSE 0
    END as total_days
  FROM date_stats ds;
END;
$$ LANGUAGE plpgsql;

-- Get earliest and latest films watched
CREATE OR REPLACE FUNCTION get_earliest_latest_films()
RETURNS TABLE(
  earliest_film JSONB,
  latest_film JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH earliest_watch AS (
    SELECT 
      title,
      watched_date,
      poster_url,
      release_year
    FROM diary
    WHERE watched_date IS NOT NULL
    ORDER BY watched_date ASC, id ASC  -- Use id as tiebreaker for same dates
    LIMIT 1
  ),
  latest_watch AS (
    SELECT 
      title,
      watched_date,
      poster_url,
      release_year
    FROM diary
    WHERE watched_date IS NOT NULL
    ORDER BY watched_date DESC, id DESC  -- Use id as tiebreaker for same dates
    LIMIT 1
  )
  SELECT 
    jsonb_build_object(
      'title', ew.title,
      'watched_date', ew.watched_date,
      'poster_url', ew.poster_url,
      'release_year', ew.release_year
    ) as earliest_film,
    jsonb_build_object(
      'title', lw.title,
      'watched_date', lw.watched_date,
      'poster_url', lw.poster_url,
      'release_year', lw.release_year
    ) as latest_film
  FROM earliest_watch ew
  CROSS JOIN latest_watch lw;
END;
$$ LANGUAGE plpgsql;

-- 4. REWATCH STATISTICS
-- =====================================================

-- Rewatch statistics function
CREATE OR REPLACE FUNCTION get_rewatch_stats()
RETURNS TABLE(
  total_rewatches BIGINT,
  rewatch_percentage DECIMAL(5,2),
  unique_films_rewatched BIGINT,
  top_rewatched JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH rewatch_data AS (
    SELECT 
      COUNT(*) FILTER (WHERE rewatch = 'Yes' OR rewatch = 'true' OR rewatch::TEXT = 'true') as rewatch_count,
      COUNT(*) as total_count,
      COUNT(DISTINCT LOWER(title)) FILTER (WHERE rewatch = 'Yes' OR rewatch = 'true' OR rewatch::TEXT = 'true') as unique_rewatched
    FROM diary
  ),
  top_rewatched_films AS (
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'title', title,
          'watch_count', watch_count,
          'poster_url', poster_url
        )
        ORDER BY watch_count DESC
      ) as top_films
    FROM (
      SELECT 
        title,
        COUNT(*) as watch_count,
        -- Get the most recent poster_url for this title (in case multiple entries exist)
        (SELECT poster_url 
         FROM diary d2 
         WHERE LOWER(d2.title) = LOWER(d1.title) 
         AND d2.poster_url IS NOT NULL 
         ORDER BY d2.watched_date DESC 
         LIMIT 1) as poster_url
      FROM diary d1
      GROUP BY title
      HAVING COUNT(*) > 1
      ORDER BY watch_count DESC
      LIMIT 10
    ) rewatched_films
  )
  SELECT 
    rd.rewatch_count,
    CASE 
      WHEN rd.total_count > 0 THEN ((rd.rewatch_count::DECIMAL / rd.total_count * 100))::DECIMAL(5,2)
      ELSE 0::DECIMAL(5,2)
    END as rewatch_percentage,
    rd.unique_rewatched,
    COALESCE(trf.top_films, '[]'::jsonb)
  FROM rewatch_data rd
  CROSS JOIN top_rewatched_films trf;
END;
$$ LANGUAGE plpgsql;

-- 5. RELEASE YEAR ANALYSIS (FIXED)
-- =====================================================

-- Fixed release year analysis function
CREATE OR REPLACE FUNCTION get_release_year_analysis()
RETURNS TABLE(
  average_release_year DECIMAL(8,2),
  median_release_year INTEGER,
  oldest_year INTEGER,
  oldest_title TEXT,
  newest_year INTEGER,
  newest_title TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH year_stats AS (
    SELECT 
      (AVG(release_year))::DECIMAL(8,2) as avg_year,
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY release_year))::INTEGER as median_year
    FROM diary 
    WHERE release_year IS NOT NULL AND release_year > 1800
  ),
  oldest_film AS (
    SELECT release_year, title 
    FROM diary 
    WHERE release_year IS NOT NULL AND release_year > 1800
    ORDER BY release_year ASC 
    LIMIT 1
  ),
  newest_film AS (
    SELECT release_year, title 
    FROM diary 
    WHERE release_year IS NOT NULL AND release_year > 1800
    ORDER BY release_year DESC 
    LIMIT 1
  )
  SELECT 
    ys.avg_year,
    ys.median_year,
    of.release_year,
    of.title,
    nf.release_year,
    nf.title
  FROM year_stats ys
  CROSS JOIN oldest_film of
  CROSS JOIN newest_film nf;
END;
$$ LANGUAGE plpgsql;

-- 6. FILMS BY DECADE
-- =====================================================

-- Films by decade function
CREATE OR REPLACE FUNCTION get_films_by_decade()
RETURNS TABLE(
  decade INTEGER,
  film_count BIGINT,
  percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH decade_stats AS (
    SELECT 
      (FLOOR(release_year::NUMERIC / 10) * 10)::INTEGER as decade_val,
      COUNT(*) as count_val
    FROM diary 
    WHERE release_year IS NOT NULL AND release_year > 1800
    GROUP BY (FLOOR(release_year::NUMERIC / 10) * 10)::INTEGER
  ),
  total_with_years AS (
    SELECT COUNT(*) as total 
    FROM diary 
    WHERE release_year IS NOT NULL AND release_year > 1800
  )
  SELECT 
    ds.decade_val,
    ds.count_val,
    CASE 
      WHEN twy.total > 0 THEN ((ds.count_val::DECIMAL / twy.total * 100))::DECIMAL(5,2)
      ELSE 0::DECIMAL(5,2)
    END as percentage
  FROM decade_stats ds
  CROSS JOIN total_with_years twy
  ORDER BY ds.decade_val;
END;
$$ LANGUAGE plpgsql;

-- 7. WATCHING GAPS ANALYSIS
-- =====================================================

-- Watching gaps analysis function
CREATE OR REPLACE FUNCTION get_watching_gaps_analysis()
RETURNS TABLE(
  average_gap_days DECIMAL(8,2),
  median_gap_days INTEGER,
  longest_gap_days INTEGER,
  longest_gap_start DATE,
  longest_gap_end DATE,
  shortest_gap_days INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH gaps AS (
    SELECT 
      watched_date,
      LAG(watched_date) OVER (ORDER BY watched_date) as prev_date,
      watched_date - LAG(watched_date) OVER (ORDER BY watched_date) as gap_days
    FROM (
      SELECT DISTINCT watched_date 
      FROM diary 
      WHERE watched_date IS NOT NULL
      ORDER BY watched_date
    ) unique_dates
  ),
  gap_stats AS (
    SELECT 
      (AVG(gap_days))::DECIMAL(8,2) as avg_gap,
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days))::INTEGER as median_gap,
      MAX(gap_days) as max_gap,
      MIN(gap_days) FILTER (WHERE gap_days > 0) as min_gap
    FROM gaps 
    WHERE gap_days IS NOT NULL AND gap_days > 0
  ),
  longest_gap AS (
    SELECT 
      prev_date as gap_start,
      watched_date as gap_end
    FROM gaps 
    WHERE gap_days = (SELECT MAX(gap_days) FROM gaps WHERE gap_days IS NOT NULL)
    LIMIT 1
  )
  SELECT 
    gs.avg_gap,
    gs.median_gap,
    gs.max_gap,
    lg.gap_start,
    lg.gap_end,
    gs.min_gap
  FROM gap_stats gs
  CROSS JOIN longest_gap lg;
END;
$$ LANGUAGE plpgsql; 