# Movie Tracker Statistics System

This guide explains how to set up and use the comprehensive statistics system for your movie tracker application.

## 🎯 Overview

The statistics system provides detailed analytics for all the metrics listed in `stats_ideas.txt`, including:

- **Basic Metrics**: Total films, ratings, watch counts
- **Temporal Analysis**: Watch patterns over time, streaks, gaps
- **Content Analysis**: Genre preferences, director statistics, runtime analysis
- **Behavioral Patterns**: Day-of-week trends, seasonal patterns
- **Advanced Analytics**: Rewatch behavior, binge sessions, viewing velocity

## 🚀 Quick Setup

### 1. Install Database Functions

Run this command to set up all database functions:

```bash
cd backend
npm run setup-stats
```

This will:
- Create all PostgreSQL functions in your Supabase database
- Add performance indexes
- Test key functions to ensure they work
- Display available endpoints

### 2. Start the Backend Server

```bash
npm run dev
```

The statistics API will be available at `/api/stats/*`

### 3. Test the API

Try these endpoints in your browser or API client:

```
GET /api/stats/dashboard          # Key overview metrics
GET /api/stats/basic             # Basic watch statistics  
GET /api/stats/rating-distribution # Rating histogram
GET /api/stats/genres            # Genre analysis
GET /api/stats/directors         # Director statistics
```

## 📊 Available API Endpoints

### Dashboard & Overview
- `GET /api/stats/dashboard` - Key metrics for main dashboard
- `GET /api/stats/comprehensive` - All statistics (use for analytics page)

### Basic Metrics
- `GET /api/stats/basic` - All basic watch metrics
- `GET /api/stats/counts` - Total sessions and unique films
- `GET /api/stats/ratings` - Rating statistics (avg, median, mode)
- `GET /api/stats/rating-distribution` - Rating histogram
- `GET /api/stats/watch-span` - First to last watch date info

### Temporal Analysis
- `GET /api/stats/temporal` - All time-based statistics
- `GET /api/stats/films-per-year` - Annual watch counts
- `GET /api/stats/films-per-month` - Monthly heat map data
- `GET /api/stats/daily-counts` - Daily watch counts with binge detection
- `GET /api/stats/gaps-and-streaks` - Watching patterns analysis
- `GET /api/stats/day-of-week` - Weekly patterns
- `GET /api/stats/seasonal` - Seasonal viewing habits

### Content Analysis
- `GET /api/stats/content` - All content-related statistics
- `GET /api/stats/genres` - Genre breakdown and preferences
- `GET /api/stats/directors` - Director watch counts and ratings
- `GET /api/stats/runtime` - Runtime statistics and distribution
- `GET /api/stats/decades` - Films by decade
- `GET /api/stats/release-years` - Release year analysis

### Behavioral Analysis
- `GET /api/stats/rewatches` - Rewatch behavior and top rewatched films
- `GET /api/stats/binge-sessions` - Days with 3+ films watched
- `GET /api/stats/viewing-velocity?period=30` - Films per time period
- `GET /api/stats/review-length` - Review writing statistics

### Custom Analysis
- `GET /api/stats/custom-period?start=2024-01-01&end=2024-12-31` - Custom date range
- `GET /api/stats/films-logged?type=year&year=2024` - Films logged in period

## 🗃️ Database Functions

The system creates these PostgreSQL functions in your Supabase database:

### Core Functions
- `get_dashboard_stats()` - Overview metrics
- `get_rating_stats()` - Rating analysis
- `get_rating_distribution()` - Rating histogram
- `get_watch_span()` - Viewing timespan

### Temporal Functions
- `get_films_per_year()` - Annual breakdown
- `get_films_per_month()` - Monthly heat map data
- `get_daily_watch_counts()` - Daily patterns with binge detection
- `get_watching_gaps_analysis()` - Gaps and streaks
- `get_day_of_week_patterns()` - Weekly habits
- `get_seasonal_patterns()` - Seasonal trends

### Content Functions
- `get_genre_stats()` - Genre analysis
- `get_director_stats()` - Director statistics
- `get_runtime_stats()` - Runtime analysis
- `get_films_by_decade()` - Decade breakdown
- `get_release_year_analysis()` - Release year insights

### Utility Functions
- `get_rewatch_stats()` - Rewatch behavior
- `get_review_length_stats()` - Review analysis
- `get_viewing_velocity(days)` - Viewing pace

## 💡 Usage Examples

### Frontend Integration

```javascript
// Fetch dashboard stats for overview
const response = await fetch('/api/stats/dashboard');
const { data } = await response.json();

console.log(`Total films: ${data.total_films}`);
console.log(`Average rating: ${data.avg_rating}`);
console.log(`Top genre: ${data.top_genre}`);
```

### Chart Data

```javascript
// Get data for rating distribution chart
const ratingResponse = await fetch('/api/stats/rating-distribution');
const { data: ratings } = await ratingResponse.json();

// Format for Chart.js
const chartData = {
  labels: ratings.map(r => `${r.rating_value} ⭐`),
  datasets: [{
    data: ratings.map(r => r.count_films),
    backgroundColor: ['#ff6384', '#36a2eb', '#cc65fe', '#ffce56', '#ff9f40']
  }]
};
```

### Custom Period Analysis

```javascript
// Analyze a specific time period
const startDate = '2024-01-01';
const endDate = '2024-06-30';
const periodResponse = await fetch(
  `/api/stats/custom-period?start=${startDate}&end=${endDate}`
);
const { data } = await periodResponse.json();

console.log(`Films in H1 2024: ${data.totalFilms}`);
console.log(`Average rating: ${data.averageRating}`);
```

## 🎨 Visualization Ideas

### Dashboard Cards
```jsx
// Example React component
function StatCard({ title, value, subtitle, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <h3>{value}</h3>
        <p>{title}</p>
        {subtitle && <small>{subtitle}</small>}
      </div>
    </div>
  );
}

// Usage with dashboard stats
<StatCard 
  title="Films Watched" 
  value={stats.total_films} 
  subtitle="Including rewatches"
  icon="🎬" 
/>
```

### Charts

**Rating Distribution (Pie Chart)**
```javascript
const ratingData = await fetch('/api/stats/rating-distribution');
// Create pie chart showing 5⭐, 4⭐, 3⭐, etc.
```

**Films Per Year (Line Chart)**
```javascript
const yearData = await fetch('/api/stats/films-per-year');
// Create line chart showing watching trends over time
```

**Genre Bubble Chart**
```javascript
const genreData = await fetch('/api/stats/genres');
// Create bubble chart where size = film count, color = avg rating
```

**Monthly Heat Map**
```javascript
const monthData = await fetch('/api/stats/films-per-month');
// Create calendar heat map showing viewing intensity
```

## 🔧 Database Schema Requirements

The statistics system works with your existing `diary` table structure and expects these columns:

### Required Columns
- `watched_date` (DATE) - When the film was watched
- `title` (TEXT) - Film title
- `rating` (INTEGER) - User rating (1-5)

### Optional Columns (for enhanced features)
- `ratings100` (INTEGER) - Detailed rating (1-100)
- `rewatch` (TEXT) - 'Yes'/'No' for rewatch indicator
- `director` (TEXT) - Director name(s)
- `genres` (JSONB/TEXT) - Genre array or comma-separated
- `runtime` (INTEGER) - Runtime in minutes
- `release_year` (INTEGER) - Film release year
- `release_date` (DATE) - Full release date
- `reviews` (TEXT) - Written reviews/notes

## 🚨 Troubleshooting

### Common Issues

**Functions not created**
```bash
# Re-run setup with more verbose output
npm run setup-stats
```

**API endpoints return errors**
```bash
# Check if functions exist in Supabase SQL editor
SELECT * FROM get_dashboard_stats();
```

**No data returned**
```bash
# Verify your diary table has data
SELECT COUNT(*) FROM diary;
```

**Performance issues**
```sql
-- Check if indexes were created
SELECT indexname FROM pg_indexes WHERE tablename = 'diary';
```

### Manual Function Creation

If the automated setup fails, you can manually run the SQL in Supabase:

1. Open your Supabase project
2. Go to SQL Editor
3. Copy and paste the contents of `backend/scripts/stats_functions.sql`
4. Execute the SQL

## 📈 Performance Optimization

The system includes several optimizations:

### Database Indexes
- `idx_diary_watched_date` - For temporal queries
- `idx_diary_rating` - For rating analysis  
- `idx_diary_title_lower` - For duplicate detection
- `idx_diary_director` - For director queries
- `idx_diary_release_year` - For decade analysis

### Caching Recommendations

For production, consider caching frequently-accessed endpoints:

```javascript
// Example with Redis
const cacheKey = `stats:dashboard:${date}`;
let stats = await redis.get(cacheKey);

if (!stats) {
  stats = await fetch('/api/stats/dashboard');
  await redis.setex(cacheKey, 3600, JSON.stringify(stats)); // 1 hour cache
}
```

## 🎬 Integration with Frontend

### React Hook Example

```javascript
// hooks/useMovieStats.js
import { useState, useEffect } from 'react';

export function useMovieStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats/comprehensive');
        const { data } = await response.json();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchStats();
  }, []);
  
  return { stats, loading };
}
```

### Analytics Dashboard Component

```jsx
function AnalyticsDashboard() {
  const { stats, loading } = useMovieStats();
  
  if (loading) return <div>Loading analytics...</div>;
  
  return (
    <div className="analytics-dashboard">
      <div className="overview-cards">
        <StatCard title="Total Films" value={stats.dashboard.total_films} />
        <StatCard title="Average Rating" value={stats.dashboard.avg_rating} />
        <StatCard title="Longest Streak" value={`${stats.dashboard.longest_streak} days`} />
      </div>
      
      <div className="charts-grid">
        <RatingDistributionChart data={stats.basic.ratingDistribution} />
        <GenreBreakdownChart data={stats.content.genreStats} />
        <ViewingTrendsChart data={stats.temporal.filmsPerYear} />
        <SeasonalPatternsChart data={stats.temporal.seasonalPatterns} />
      </div>
    </div>
  );
}
```

## 🔮 Future Enhancements

The statistics system is designed to be extensible. Consider adding:

- **Social Features**: Compare stats with friends
- **Recommendations**: Suggest films based on patterns
- **Goals & Challenges**: Set viewing targets
- **Export Features**: Download stats as PDF/CSV
- **Real-time Updates**: WebSocket notifications for new records
- **Machine Learning**: Predict ratings, suggest optimal viewing times

## 📞 Support

If you encounter issues:

1. Check the console logs in your browser and backend
2. Verify your Supabase connection is working
3. Test individual database functions in Supabase SQL editor
4. Review the troubleshooting section above

The statistics system provides powerful insights into your movie watching habits. Enjoy exploring your cinematic journey! 🍿 