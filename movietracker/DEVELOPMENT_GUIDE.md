# Development Guide

## 🚀 Quick Start

### First Time Setup
```bash
# 1. Install dependencies
npm run setup:all

# 2. Set up environment files
npm run setup:env

# 3. Edit your .env files with real credentials
# Edit .env (frontend)
# Edit backend/.env (backend)

# 4. Start development servers
npm run dev:full
```

## 🛠️ Daily Development Workflow

### Starting Development
```bash
npm run dev:full    # Starts both frontend and backend
```

This opens:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

### Running Only One Service
```bash
npm run dev         # Frontend only
npm run dev:backend # Backend only
```

### Testing
```bash
npm run test:health # Check if services are running
npm run test:api    # Quick backend health check
```

## 🔧 Environment Configuration

### Frontend (.env)
```env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Backend (backend/.env)
```env
NODE_ENV=development
PORT=3001
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
TMDB_API_KEY=your_tmdb_api_key
FRONTEND_URL=http://localhost:3000
```

## 🏗️ Building for Production

### Frontend Only
```bash
npm run build
```

### Full Stack
```bash
npm run build:full
```

## 🚀 Deployment

### Railway (Recommended)
```bash
# Deploy everything
npm run deploy:railway

# Deploy backend only
npm run deploy:railway:backend

# Deploy frontend only  
npm run deploy:railway:frontend
```

### cPanel (Legacy)
```bash
npm run deploy:cpanel
```

## 🔍 Troubleshooting

### Common Issues

1. **Port already in use**
   - Kill the process: `lsof -ti:3000 | xargs kill -9`
   - Or change ports in package.json

2. **API not connecting**
   - Check if backend is running: `npm run test:api`
   - Verify `VITE_API_BASE_URL` in frontend .env

3. **Missing environment variables**
   - Run: `npm run setup:env`
   - Edit the .env files with real values

4. **Database connection issues**
   - Check Supabase credentials
   - Verify network connection

### Development Tools

```bash
# Health check all services
npm run test:health

# View backend logs
cd backend && npm run dev

# Check environment variables
cat .env
cat backend/.env
```

## 📁 Project Structure

```
movietracker/
├── src/                 # React frontend source
├── backend/            # Node.js API server
│   ├── routes/         # API routes
│   ├── controllers/    # Business logic
│   ├── services/       # External service integrations
│   └── config/         # Configuration files
├── public/             # Static assets
├── scripts/            # Utility scripts
└── railway/           # Railway deployment configs
```

## 🔄 Git Workflow

### Development
```bash
git checkout -b feature/your-feature
# Make changes
npm run dev:full        # Test locally
git add .
git commit -m "feat: your feature"
git push origin feature/your-feature
```

### Production Deployment
```bash
git checkout main
git pull origin main
npm run deploy:railway  # Deploy to production
```

## 🧪 Testing Changes

### Local Testing
1. Make your changes
2. Test with `npm run dev:full`
3. Check health: `npm run test:health`
4. Test in browser

### Production Testing
1. Deploy to Railway development environment
2. Test with production data
3. Merge to main for production deployment

---

**Need Help?** Check the main [README.md](README.md) or [Railway Guide](railway/README.md) 