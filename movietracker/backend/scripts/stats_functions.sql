-- =====================================================
-- MOVIE TRACKER STATISTICS DATABASE FUNCTIONS (SIMPLIFIED)
-- =====================================================
-- This file contains PostgreSQL functions to calculate statistics
-- from stats_ideas.txt for the Supabase movie tracker application
-- 
-- Simplified version to avoid PostgreSQL ROUND function compatibility issues
-- =====================================================

-- 1. BASIC WATCH METRICS
-- =====================================================

-- Total Films Watched (including rewatches)
CREATE OR REPLACE FUNCTION get_total_viewing_sessions()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM diary);
END;
$$ LANGUAGE plpgsql;

-- Unique Films Watched (no duplicates by title)
CREATE OR REPLACE FUNCTION get_unique_films_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(DISTINCT LOWER(title)) FROM diary);
END;
$$ LANGUAGE plpgsql;

-- Films added this year/month
CREATE OR REPLACE FUNCTION get_films_logged_period(period_type TEXT DEFAULT 'year', target_year INTEGER DEFAULT NULL, target_month INTEGER DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  result INTEGER;
BEGIN
  IF period_type = 'year' THEN
    SELECT COUNT(*) INTO result 
    FROM diary 
    WHERE EXTRACT(YEAR FROM watched_date) = COALESCE(target_year, EXTRACT(YEAR FROM CURRENT_DATE));
  ELSIF period_type = 'month' THEN
    SELECT COUNT(*) INTO result 
    FROM diary 
    WHERE EXTRACT(YEAR FROM watched_date) = COALESCE(target_year, EXTRACT(YEAR FROM CURRENT_DATE))
    AND EXTRACT(MONTH FROM watched_date) = COALESCE(target_month, EXTRACT(MONTH FROM CURRENT_DATE));
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Basic rating statistics (simplified)
CREATE OR REPLACE FUNCTION get_rating_stats()
RETURNS TABLE(
  avg_rating DECIMAL(5,2),
  median_rating DECIMAL(5,2),
  mode_rating INTEGER,
  total_rated BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (AVG(rating))::DECIMAL(5,2) as avg_rating,
    (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rating))::DECIMAL(5,2) as median_rating,
    (SELECT rating FROM (
      SELECT rating, COUNT(*) as freq 
      FROM diary 
      WHERE rating IS NOT NULL 
      GROUP BY rating 
      ORDER BY freq DESC, rating DESC 
      LIMIT 1
    ) mode_subquery) as mode_rating,
    COUNT(*) as total_rated
  FROM diary 
  WHERE rating IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Rating distribution histogram
CREATE OR REPLACE FUNCTION get_rating_distribution()
RETURNS TABLE(
  rating_value DECIMAL(2,1),
  count_films BIGINT,
  percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH unique_ratings AS (
    SELECT DISTINCT ON (LOWER(title))
      LOWER(title) as film_title,
      rating
    FROM diary 
    WHERE rating IS NOT NULL
    ORDER BY LOWER(title), watched_date DESC  -- Keep the most recent rating for each film
  ),
  rating_counts AS (
    SELECT 
      rating as rating_val,
      COUNT(*) as count_val
    FROM unique_ratings
    GROUP BY rating
  ),
  total_count AS (
    SELECT COUNT(*) as total FROM unique_ratings
  )
  SELECT 
    rc.rating_val,
    rc.count_val,
    ((rc.count_val::DECIMAL / tc.total * 100))::DECIMAL(5,2) as percentage
  FROM rating_counts rc
  CROSS JOIN total_count tc
  ORDER BY rc.rating_val DESC;
END;
$$ LANGUAGE plpgsql;

-- 2. TEMPORAL ANALYSIS
-- =====================================================

-- Films watched per year
CREATE OR REPLACE FUNCTION get_films_per_year()
RETURNS TABLE(
  year INTEGER,
  film_count BIGINT,
  unique_films BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(YEAR FROM watched_date)::INTEGER as year,
    COUNT(*) as film_count,
    COUNT(DISTINCT LOWER(title)) as unique_films
  FROM diary
  GROUP BY EXTRACT(YEAR FROM watched_date)
  ORDER BY year;
END;
$$ LANGUAGE plpgsql;

-- Films watched per month (heat map data)
CREATE OR REPLACE FUNCTION get_films_per_month()
RETURNS TABLE(
  year INTEGER,
  month INTEGER,
  month_name TEXT,
  film_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(YEAR FROM watched_date)::INTEGER as year,
    EXTRACT(MONTH FROM watched_date)::INTEGER as month,
    TO_CHAR(watched_date, 'Month') as month_name,
    COUNT(*) as film_count
  FROM diary
  GROUP BY EXTRACT(YEAR FROM watched_date), EXTRACT(MONTH FROM watched_date), TO_CHAR(watched_date, 'Month')
  ORDER BY year, month;
END;
$$ LANGUAGE plpgsql;

-- Daily watch counts (binge detection)
CREATE OR REPLACE FUNCTION get_daily_watch_counts()
RETURNS TABLE(
  watch_date DATE,
  film_count BIGINT,
  is_binge_day BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    watched_date,
    COUNT(*) as film_count,
    (COUNT(*) >= 3) as is_binge_day
  FROM diary
  GROUP BY watched_date
  ORDER BY watched_date;
END;
$$ LANGUAGE plpgsql;

-- 3. GENRE ANALYSIS
-- =====================================================

-- Top genres by count (UNIQUE FILMS ONLY)
CREATE OR REPLACE FUNCTION get_genre_stats()
RETURNS TABLE(
  genre_name TEXT,
  film_count BIGINT,
  percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH unique_films AS (
    SELECT DISTINCT ON (LOWER(title))
      LOWER(title) as film_title,
      genres,
      watched_date
    FROM diary
    WHERE genres IS NOT NULL 
    AND (genres::TEXT != '[]' AND genres::TEXT != '' AND genres::TEXT != 'null')
    ORDER BY LOWER(title), watched_date DESC  -- Keep the most recent entry for each unique film
  ),
  genre_expanded AS (
    SELECT 
      film_title,
      TRIM(unnest(string_to_array(genres::TEXT, ','))) as genre
    FROM unique_films
  ),
  genre_counts AS (
    SELECT 
      genre,
      COUNT(DISTINCT film_title) as count_val
    FROM genre_expanded
    WHERE genre != '' AND genre IS NOT NULL
    GROUP BY genre
  ),
  total_with_genres AS (
    SELECT COUNT(DISTINCT film_title) as total FROM genre_expanded WHERE genre != '' AND genre IS NOT NULL
  )
  SELECT 
    gc.genre as genre_name,
    gc.count_val as film_count,
    ((gc.count_val::DECIMAL / twg.total * 100))::DECIMAL(5,2) as percentage
  FROM genre_counts gc
  CROSS JOIN total_with_genres twg
  ORDER BY gc.count_val DESC;
END;
$$ LANGUAGE plpgsql;

-- 4. DIRECTOR ANALYSIS
-- =====================================================

-- Top directors by unique films count
CREATE OR REPLACE FUNCTION get_director_stats()
RETURNS TABLE(
  director_name TEXT,
  film_count BIGINT,
  avg_rating DECIMAL(5,2),
  unique_films BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH unique_films AS (
    SELECT DISTINCT ON (LOWER(title))
      LOWER(title) as film_title,
      director,
      rating,
      watched_date
    FROM diary
    WHERE director IS NOT NULL 
    AND director != '' 
    AND director != 'null'
    ORDER BY LOWER(title), watched_date DESC  -- Keep the most recent entry for each unique film
  )
  SELECT 
    director as director_name,
    COUNT(DISTINCT film_title) as film_count,
    (AVG(rating))::DECIMAL(5,2) as avg_rating,
    COUNT(DISTINCT film_title) as unique_films
  FROM unique_films
  GROUP BY director
  HAVING COUNT(DISTINCT film_title) > 1  -- Only directors with more than 1 unique film
  ORDER BY COUNT(DISTINCT film_title) DESC, AVG(rating) DESC;
END;
$$ LANGUAGE plpgsql;

-- 5. BEHAVIORAL PATTERNS
-- =====================================================

-- Day of week patterns
CREATE OR REPLACE FUNCTION get_day_of_week_patterns()
RETURNS TABLE(
  day_of_week TEXT,
  day_number INTEGER,
  film_count BIGINT,
  percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH dow_stats AS (
    SELECT 
      TO_CHAR(watched_date, 'Day') as dow_name,
      EXTRACT(DOW FROM watched_date)::INTEGER as dow_num,
      COUNT(*) as count_val
    FROM diary
    GROUP BY TO_CHAR(watched_date, 'Day'), EXTRACT(DOW FROM watched_date)
  ),
  total_count AS (
    SELECT COUNT(*) as total FROM diary
  )
  SELECT 
    TRIM(ds.dow_name),
    ds.dow_num,
    ds.count_val,
    ((ds.count_val::DECIMAL / tc.total * 100))::DECIMAL(5,2) as percentage
  FROM dow_stats ds
  CROSS JOIN total_count tc
  ORDER BY ds.dow_num;
END;
$$ LANGUAGE plpgsql;

-- Seasonal patterns
CREATE OR REPLACE FUNCTION get_seasonal_patterns()
RETURNS TABLE(
  season_name TEXT,
  film_count BIGINT,
  percentage DECIMAL(5,2),
  avg_rating DECIMAL(3,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH seasonal_stats AS (
    SELECT 
      CASE 
        WHEN EXTRACT(MONTH FROM watched_date) IN (12, 1, 2) THEN 'Winter'
        WHEN EXTRACT(MONTH FROM watched_date) IN (3, 4, 5) THEN 'Spring'
        WHEN EXTRACT(MONTH FROM watched_date) IN (6, 7, 8) THEN 'Summer'
        WHEN EXTRACT(MONTH FROM watched_date) IN (9, 10, 11) THEN 'Fall'
      END as season,
      COUNT(*) as count_val,
      AVG(rating) as avg_rat
    FROM diary
    GROUP BY 
      CASE 
        WHEN EXTRACT(MONTH FROM watched_date) IN (12, 1, 2) THEN 'Winter'
        WHEN EXTRACT(MONTH FROM watched_date) IN (3, 4, 5) THEN 'Spring'
        WHEN EXTRACT(MONTH FROM watched_date) IN (6, 7, 8) THEN 'Summer'
        WHEN EXTRACT(MONTH FROM watched_date) IN (9, 10, 11) THEN 'Fall'
      END
  ),
  total_count AS (
    SELECT COUNT(*) as total FROM diary
  )
  SELECT 
    ss.season,
    ss.count_val,
    ((ss.count_val::DECIMAL / tc.total * 100))::DECIMAL(5,2) as percentage,
    (ss.avg_rat)::DECIMAL(3,2) as avg_rating
  FROM seasonal_stats ss
  CROSS JOIN total_count tc
  ORDER BY 
    CASE ss.season
      WHEN 'Spring' THEN 1
      WHEN 'Summer' THEN 2
      WHEN 'Fall' THEN 3
      WHEN 'Winter' THEN 4
    END;
END;
$$ LANGUAGE plpgsql;

-- Films by decade (UNIQUE FILMS ONLY)
CREATE OR REPLACE FUNCTION get_films_by_decade()
RETURNS TABLE(
  decade INTEGER,
  film_count BIGINT,
  percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH unique_films AS (
    SELECT DISTINCT ON (LOWER(title))
      LOWER(title) as film_title,
      release_year,
      watched_date
    FROM diary 
    WHERE release_year IS NOT NULL AND release_year > 1800
    ORDER BY LOWER(title), watched_date DESC  -- Keep the most recent entry for each unique film
  ),
  decade_stats AS (
    SELECT 
      (FLOOR(release_year::NUMERIC / 10) * 10)::INTEGER as decade_val,
      COUNT(DISTINCT film_title) as count_val
    FROM unique_films
    GROUP BY (FLOOR(release_year::NUMERIC / 10) * 10)::INTEGER
  ),
  total_with_years AS (
    SELECT COUNT(DISTINCT film_title) as total 
    FROM unique_films
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

-- 6. DASHBOARD STATS
-- =====================================================

-- Master function that returns all key statistics for dashboard
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS TABLE(
  total_films INTEGER,
  unique_films INTEGER,
  avg_rating DECIMAL(5,2),
  total_ratings BIGINT,
  films_this_year INTEGER,
  top_genre TEXT,
  top_director TEXT,
  favorite_day TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH basic_stats AS (
    SELECT 
      COUNT(*)::INTEGER as total_count,
      COUNT(DISTINCT LOWER(title))::INTEGER as unique_count,
      (AVG(rating))::DECIMAL(5,2) as avg_rat,
      COUNT(*) FILTER (WHERE rating IS NOT NULL) as total_rat,
      COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM watched_date) = EXTRACT(YEAR FROM CURRENT_DATE))::INTEGER as this_year
    FROM diary
  ),
  top_items AS (
    SELECT 
      (SELECT genre FROM (
        WITH genre_expanded AS (
          SELECT TRIM(unnest(string_to_array(genres::TEXT, ','))) as genre
          FROM diary
          WHERE genres IS NOT NULL 
        )
        SELECT genre, COUNT(*) as cnt
        FROM genre_expanded
        WHERE genre != '' AND genre IS NOT NULL
        GROUP BY genre
        ORDER BY cnt DESC
        LIMIT 1
      ) tg) as top_genre_name,
      
      (SELECT director FROM (
        SELECT director, COUNT(*) as cnt
        FROM diary
        WHERE director IS NOT NULL AND director != ''
        GROUP BY director
        ORDER BY cnt DESC
        LIMIT 1
      ) td) as top_director_name,
      
      (SELECT day_name FROM (
        SELECT TO_CHAR(watched_date, 'Day') as day_name, COUNT(*) as cnt
        FROM diary
        GROUP BY TO_CHAR(watched_date, 'Day')
        ORDER BY cnt DESC
        LIMIT 1
      ) td) as fav_day_name
  )
  SELECT 
    bs.total_count,
    bs.unique_count,
    bs.avg_rat,
    bs.total_rat,
    bs.this_year,
    TRIM(ti.top_genre_name),
    ti.top_director_name,
    TRIM(ti.fav_day_name)
  FROM basic_stats bs
  CROSS JOIN top_items ti;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Create indexes to optimize statistics queries
CREATE INDEX IF NOT EXISTS idx_diary_watched_date ON diary(watched_date);
CREATE INDEX IF NOT EXISTS idx_diary_rating ON diary(rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_title_lower ON diary(LOWER(title));
CREATE INDEX IF NOT EXISTS idx_diary_director ON diary(director) WHERE director IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_release_year ON diary(release_year) WHERE release_year IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_runtime ON diary(runtime) WHERE runtime IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_rewatch ON diary(rewatch);

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

-- Example queries to test the functions:
-- SELECT * FROM get_dashboard_stats();
-- SELECT * FROM get_rating_distribution();
-- SELECT * FROM get_films_per_year();
-- SELECT * FROM get_genre_stats();
-- SELECT * FROM get_director_stats();
-- SELECT * FROM get_day_of_week_patterns();
-- SELECT * FROM get_seasonal_patterns();
-- SELECT * FROM get_rewatch_stats();
-- SELECT * FROM get_runtime_stats();
-- SELECT * FROM get_films_by_decade();
-- SELECT * FROM get_watching_gaps_analysis();
-- SELECT * FROM get_daily_watch_counts() WHERE is_binge_day = true;
-- SELECT * FROM get_viewing_velocity(30); -- 30-day periods 