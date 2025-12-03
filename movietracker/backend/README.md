# Movie Tracker Backend

A robust Node.js/Express backend API that integrates The Movie Database (TMDB) with Supabase to provide comprehensive movie tracking services.

## 🎯 Purpose

This backend serves as the data layer and API gateway for the Movie Tracker application, handling movie data management, TMDB integration, user ratings, and analytics generation.

## ⚡ Key Features

- **TMDB Integration**: Seamless movie data fetching from The Movie Database
- **Database Management**: Comprehensive movie, rating, and metadata storage
- **Advanced Search**: Multi-field search across movies, directors, and genres
- **Statistics Engine**: Real-time analytics and data visualization support
- **Batch Processing**: Efficient handling of multiple movie operations
- **Rate Limiting**: Built-in API protection and TMDB quota compliance
- **RESTful Design**: Clean, well-structured API endpoints

## 🛠️ Technology Stack

### Core Technologies
- **Node.js 18+** - JavaScript runtime environment
- **Express.js** - Web application framework
- **Supabase** - PostgreSQL database with real-time capabilities
- **TMDB API** - Movie data source integration

### Key Libraries
- **@supabase/supabase-js** - Database client
- **express-rate-limit** - API rate limiting
- **cors** - Cross-origin resource sharing
- **dotenv** - Environment variable management

## 🗄️ Database Architecture

### Core Tables
- **movies**: TMDB movie data with metadata
- **directors**: Director information and filmography
- **genres**: Movie genre classifications
- **user_ratings**: Personal ratings and watch history
- **movie_directors**: Many-to-many movie-director relationships
- **movie_genres**: Many-to-many movie-genre relationships

### Data Relationships
- Normalized relational design
- Foreign key constraints
- Optimized indexing for search performance
- Row-level security implementation

## 🔌 API Architecture

### Movie Management
- Full CRUD operations for movie collection
- Automatic TMDB data enrichment
- Batch movie addition capabilities
- Advanced search and filtering

### Rating System
- Dual-scale rating support (1-5 stars, 0-100 detailed)
- Watch date tracking
- Rewatch functionality
- Personal notes and comments

### Analytics Engine
- Real-time statistics calculation
- Rating distribution analysis
- Genre preference insights
- Director and trend analytics

### TMDB Integration
- Movie search and discovery
- Trending movie feeds
- Genre and metadata fetching
- Rate-limited API calls

## 🚀 Performance Features

### Optimization
- **Database Indexing**: Optimized queries for fast search
- **Connection Pooling**: Efficient database connections
- **Caching Strategy**: Reduced API calls and improved response times
- **Batch Operations**: Efficient multi-record processing

### Rate Limiting
- **General API**: 100 requests per 15 minutes
- **TMDB Endpoints**: 40 requests per 10 seconds
- **Batch Operations**: 5 operations per hour
- **Graceful Degradation**: Proper error handling

## 🔒 Security Implementation

### API Protection
- CORS configuration for cross-origin requests
- Environment variable security
- Input validation and sanitization
- SQL injection prevention

### Database Security
- Row-level security policies
- Service role key protection
- Secure connection handling
- Data validation layers

## 📊 Data Flow

### Movie Addition Process
1. User searches for movie title
2. Backend queries TMDB API
3. Movie data enrichment and validation
4. Database storage with relationships
5. Response with complete movie object

### Statistics Generation
1. Real-time database queries
2. Aggregation and calculation
3. Data formatting for frontend consumption
4. Caching for performance optimization

## 🎬 Core Endpoints

### Movie Operations
- Movie CRUD operations
- Search and filtering
- Batch processing
- Rating management

### TMDB Integration
- Movie search and discovery
- Trending content
- Metadata enrichment
- Genre management

### Analytics
- Statistics generation
- Rating analysis
- Trend calculation
- Performance metrics

## 🔧 Service Architecture

### Modular Design
- **Controllers**: Request handling and response formatting
- **Services**: Business logic and data processing
- **Routes**: API endpoint definitions
- **Middleware**: Cross-cutting concerns (auth, logging, rate limiting)
- **Config**: Database and external service configuration

### Error Handling
- Comprehensive error catching
- Graceful failure modes
- Detailed logging
- User-friendly error messages

## 📈 Scalability Features

### Performance Optimization
- Efficient database queries
- Connection pooling
- Caching strategies
- Batch processing capabilities

### Monitoring & Logging
- Request/response logging
- Error tracking
- Performance metrics
- Health check endpoints

---

*A powerful backend designed to handle comprehensive movie tracking with performance, security, and scalability in mind.* 