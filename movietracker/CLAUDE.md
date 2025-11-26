# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
```bash
npm run dev                # Start both frontend (localhost:3000) and backend (localhost:3001)
npm run dev:frontend       # Frontend only (Vite dev server)
npm run dev:backend        # Backend only (Express server)
```

### Building
```bash
npm run build              # Build frontend for production
npm run build:backend      # Install backend production dependencies
npm run start              # Start production server
```

### Backend Scripts
```bash
cd backend && npm run setup-stats                    # Initialize statistics tables
cd backend && npm run migrate                        # Run database migrations
cd backend && npm run enhance                        # Enhance movies with TMDB data
cd backend && npm run backfill:list-release-dates    # Backfill release dates
cd backend && npm run backfill:list-backdrops        # Backfill backdrop images
```

## Architecture Overview

### Full-Stack Structure
- **Frontend**: React 18 SPA with Vite build tool, located in `src/`
- **Backend**: Express.js API server in `backend/` directory
- **Database**: PostgreSQL via Supabase with real-time features
- **External API**: TMDB (The Movie Database) for movie metadata

### Frontend Architecture
- **Entry Point**: `src/main.jsx` → `src/App.jsx`
- **Routing**: React Router DOM with nested routes in Layout component
- **State Management**: React Context for auth, React hooks for component state
- **Styling**: CSS modules with responsive design
- **Components**: Located in `src/components/` with modular architecture
- **Pages**: Main views in `src/pages/` (Overview, Movies, Timeline, Statistics, TopRated)

### Backend Architecture
- **Entry Point**: `backend/server.js`
- **Routes**: 
  - `backend/routes/movieRoutes.js` - Movie CRUD operations, TMDB integration
  - `backend/routes/statsRoutes.js` - Analytics and statistics endpoints
- **Database**: Supabase PostgreSQL with normalized schema (movies, directors, genres, user_ratings tables)
- **Security**: Helmet for security headers, CORS, rate limiting, CSP policies

### Key Features
- **Dual Rating System**: 1-5 star ratings and 0-100 detailed scores
- **TMDB Integration**: Automatic movie data fetching with posters, cast, crew
- **Statistics**: Interactive charts with Chart.js and data visualizations
- **Search & Filtering**: Advanced movie search by title, director, genre
- **Dark Mode**: System-wide theme support with persistence

### Environment Setup
- **Frontend**: `.env` with VITE_API_BASE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- **Backend**: `backend/.env` with Supabase credentials, TMDB API key, CORS origins
- **Production**: Railway deployment with automatic environment variable injection

### Database Schema
- **movies**: Core movie data from TMDB (id, title, runtime, poster_path, etc.)
- **directors**: Director information with movie relationships
- **genres**: Movie genres and categorization
- **user_ratings**: Personal ratings (star_rating, detailed_rating, watch_date, notes)

### Development Notes
- Project uses ES modules (`"type": "module"`) throughout
- Frontend runs on port 3000, backend on port 3001 in development
- CSS is modularized - see CSS_MODULARIZATION_GUIDE.md for structure
- Railway deployment handles both frontend static files and backend API
- TMDB API integration requires rate limiting and error handling