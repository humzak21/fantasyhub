# Movie Tracker - Private Development Guide

This is your private development and deployment guide. Keep this file local and never commit it to version control.

## 🚀 Development Setup

### Initial Setup

1. **Clone and Install**
   ```bash
   git clone <your-repo-url>
   cd movietracker
   npm install
   npm run install:backend
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   cp .env.example backend/.env
   ```
   
   Fill in your actual values in both `.env` files:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_ANON_KEY` - Your Supabase anonymous key
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
   - `TMDB_API_KEY` - Your TMDB API key

3. **Start Development**
   ```bash
   npm run dev
   ```
   
   Frontend: http://localhost:5173
   Backend: http://localhost:3001

## 🚂 Railway Deployment Guide

### Why Railway?
- Automatic deployments from GitHub
- Built-in environment variable management
- Separate staging and production environments
- Automatic HTTPS and custom domains
- Real-time logs and monitoring
- Zero-downtime deployments

### Setup Process

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Create Project**
   ```bash
   railway init movietracker
   railway link
   ```

3. **Environment Variables for Railway**
   ```env
   NODE_ENV=production
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   TMDB_API_KEY=your_tmdb_api_key
   FRONTEND_URL=https://your-app-name.railway.app
   ```

4. **Deploy**
   ```bash
   railway up
   ```

### One-Click Deploy
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template-id)

## 🗄️ Database Setup (Supabase)

### Required Tables
- **movies**: Core movie data from TMDB
- **directors**: Director information
- **genres**: Movie genres
- **user_ratings**: Personal movie ratings (1-5 and 0-100 scale)
- **movie_directors**: Many-to-many relationship
- **movie_genres**: Many-to-many relationship

### Migration
```bash
cd backend
npm run migrate
npm run seed  # Optional: seed with CSV data
```

## 🔧 Backend API Reference

### Environment Variables
```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# TMDB API Configuration
TMDB_API_KEY=your_tmdb_api_key
TMDB_BASE_URL=https://api.themoviedb.org/3

# CORS Configuration
FRONTEND_URL=http://localhost:5173
```

### Key API Endpoints

#### Movies
- `GET /api/movies` - Get all movies with ratings, directors, genres
- `GET /api/movies/:id` - Get single movie
- `POST /api/movies/add` - Add movie from TMDB
- `POST /api/movies/batch-add` - Add multiple movies
- `POST /api/movies/:id/rating` - Add/update rating
- `GET /api/movies/search?q=query` - Search your movies
- `GET /api/movies/stats` - Get statistics

#### TMDB Integration
- `GET /api/tmdb/search?q=query&year=2010` - Search TMDB
- `GET /api/tmdb/trending?timeWindow=week` - Get trending
- `GET /api/tmdb/genres` - Get all genres

#### System
- `GET /health` - Health check

### Rate Limiting
- General API: 100 requests per 15 minutes
- TMDB endpoints: 40 requests per 10 seconds
- Batch operations: 5 operations per hour

## 📊 Usage Examples

### Adding a Movie
```javascript
const response = await fetch('http://localhost:3001/api/movies/add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Dune',
    year: 2021,
    userRating: 4.5,
    detailedRating: 87,
    watchDate: '2024-01-15',
    isRewatch: false
  })
});
```

### Batch Adding Movies
```javascript
const response = await fetch('http://localhost:3001/api/movies/batch-add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    movies: [
      {
        title: 'Inception',
        userRating: 4.5,
        detailedRating: 88,
        watchDate: '2024-01-20'
      },
      {
        title: 'Interstellar', 
        userRating: 5,
        detailedRating: 92,
        watchDate: '2024-01-21'
      }
    ]
  })
});
```

## 🛠️ Available Scripts

### Root Level
- `npm run dev` - Start both frontend and backend in development
- `npm run build` - Build frontend for production
- `npm run start` - Start production server
- `npm run start:production` - Build and start production (Railway)

### Frontend Only
- `npm run dev:frontend` - Start frontend development server
- `npm run preview` - Preview built frontend

### Backend Only
- `npm run dev:backend` - Start backend development server

## 🚨 Troubleshooting

### Common Development Issues

1. **Frontend can't connect to backend**
   - Ensure backend is running on port 3001
   - Check CORS configuration in backend/server.js

2. **Environment variables not loading**
   - Verify .env files exist in both root and backend directories
   - Restart development servers after changing .env

3. **Database connection issues**
   - Verify Supabase credentials
   - Check Supabase project status

### Railway Deployment Issues

1. **Build fails on Railway**
   - Check that all environment variables are set
   - Ensure Node.js version is 18+ (specified in package.json engines)

2. **API calls fail**
   - Verify CORS settings in backend/server.js
   - Check that FRONTEND_URL matches your Railway domain

3. **TMDB API Key Invalid**
   - Verify your API key in TMDB settings
   - Check environment variables

4. **Rate Limiting Errors**
   - Reduce batch sizes
   - Add delays between requests

### Health Checks
```bash
# Check service health
curl https://your-backend-service.railway.app/health

# Local health check
curl http://localhost:3001/health
```

## 🔄 Environment Management

### Development Environment
```bash
railway environment create development
railway environment use development
railway up
```

### Production Environment
```bash
railway environment use production
railway up
```

## 🌐 Custom Domains on Railway

1. Go to Railway dashboard > Your service > Settings
2. Add custom domain
3. Configure DNS (CNAME or A record)
4. SSL is automatically handled

Example DNS:
```
Type: CNAME
Name: api (for api.yourdomain.com)
Value: your-backend-service.railway.app
```

## 📊 Migration from cPanel

### Step 1: Deploy Backend to Railway
1. Deploy backend to Railway
2. Get the Railway backend URL
3. Update frontend environment variables

### Step 2: Test Integration
```bash
VITE_API_BASE_URL=https://your-backend-service.railway.app/api
npm run dev
```

### Step 3: Update cPanel Frontend (if keeping on cPanel)
```bash
VITE_API_BASE_URL=https://your-backend-service.railway.app/api npm run build
# Upload dist/ contents to cPanel
```

## 💰 Cost Optimization

### Railway Pricing
- Hobby Plan: $5/month per environment
- Pro Plan: $20/month with better limits
- Monitor usage in dashboard

### Optimization Tips
1. Use development environments for testing
2. Scale down services when not needed
3. Monitor resource usage regularly
4. Consider hybrid approach (backend on Railway, frontend on cPanel)

## 🎯 Best Practices

### Environment Management
- Use separate environments for development/staging/production
- Keep sensitive data in Railway environment variables
- Use .env.example files for documentation

### Deployment Strategy
- Use automatic deployments from GitHub
- Test in development environment first
- Monitor deployments with Railway logs

### Security
- Never commit environment variables
- Use Railway's built-in HTTPS
- Keep dependencies updated

## 📚 Resources

- [Railway Documentation](https://docs.railway.app)
- [Railway CLI Reference](https://docs.railway.app/develop/cli)
- [Supabase Documentation](https://supabase.com/docs)
- [TMDB API Documentation](https://developers.themoviedb.org/3)

## 🔍 Monitoring

### View Logs
```bash
railway logs
railway logs --service backend
```

### Monitor in Dashboard
- Metrics: CPU, Memory, Network usage
- Logs: Real-time application logs
- Deployments: History and status
- Environment Variables: Secure management

## CSV Migration

Expected CSV format:
```csv
title,month,day,year,rating
"The Dark Knight",7,18,2008,5
"Inception",7,16,2010,4.5
```

Place CSV files in root directory and run:
```bash
npm run seed
``` 