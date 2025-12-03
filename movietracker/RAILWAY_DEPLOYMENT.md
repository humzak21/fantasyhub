# Railway Deployment Guide

This guide will help you deploy your Movie Tracker application to Railway in minutes.

## 🚂 Why Railway?

Railway provides a simple, modern deployment platform that eliminates the complexity of your current cPanel setup:

- **No FTP uploads** - Deploy directly from GitHub
- **No server management** - Railway handles infrastructure
- **Automatic builds** - Push to GitHub, Railway deploys
- **Environment variables** - Secure configuration management
- **Custom domains** - Easy domain setup
- **Automatic HTTPS** - SSL certificates included

## 🚀 Quick Deploy

### Step 1: Prepare Your Repository

Your project is now ready for Railway! The cleanup has removed:
- ❌ GitHub Actions workflow
- ❌ cPanel deployment files  
- ❌ Deprecated PHP API
- ❌ Old documentation files
- ❌ CSV data files

### Step 2: Deploy to Railway

1. **Sign up for Railway**
   - Go to [railway.app](https://railway.app)
   - Sign up with your GitHub account

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your movie tracker repository
   - Railway will automatically detect it's a Node.js app

3. **Configure Environment Variables**
   
   In Railway dashboard → Your Project → Variables tab, add:

   ```
   NODE_ENV=production
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key  
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   TMDB_API_KEY=your_tmdb_api_key
   FRONTEND_URL=https://your-app-name.railway.app
   ```

4. **Deploy**
   - Railway automatically runs `npm run start:production`
   - This builds your React frontend and starts the Node.js backend
   - Your app will be live at `https://your-app-name.railway.app`

### Step 3: Update Frontend URL

After deployment, update the `FRONTEND_URL` variable with your actual Railway URL for proper CORS configuration.

## 🔧 How It Works

### Build Process
1. `npm install` - Install all dependencies
2. `vite build` - Build React frontend to `dist/`
3. `cd backend && npm ci --only=production` - Install backend dependencies
4. `node backend/server.js` - Start the server

### Server Configuration
- **Frontend**: Served as static files from `dist/` folder
- **Backend API**: Available at `/api/*` routes
- **React Router**: All non-API routes serve `index.html`
- **Port**: Railway automatically assigns (uses `process.env.PORT`)

## 🛠️ Development Workflow

### Local Development
```bash
npm run dev
```
Starts both frontend (localhost:5173) and backend (localhost:3001)

### Testing Production Build
```bash
npm run start:production
```
Builds and runs exactly like Railway

### Making Changes
1. Make your changes locally
2. Test with `npm run dev`
3. Push to GitHub
4. Railway automatically redeploys

## 🔍 Monitoring & Debugging

### Railway Dashboard
- **Deployments**: View build logs and deployment history
- **Metrics**: Monitor CPU, memory, and request metrics
- **Logs**: Real-time application logs
- **Variables**: Manage environment variables

### Health Check
Your app includes a health endpoint: `https://your-app.railway.app/health`

### Common Issues

1. **Build Fails**
   - Check environment variables are set
   - View build logs in Railway dashboard

2. **API Errors**
   - Verify Supabase credentials
   - Check CORS settings (FRONTEND_URL)

3. **Frontend Not Loading**
   - Ensure build completed successfully
   - Check static file serving in server.js

## 🎯 Benefits Over cPanel

| Feature | cPanel (Old) | Railway (New) |
|---------|--------------|---------------|
| Deployment | Manual FTP upload | Git push |
| Build Process | GitHub Actions + manual | Automatic |
| Environment Setup | Complex .env management | Simple dashboard |
| SSL/HTTPS | Manual setup | Automatic |
| Scaling | Manual server management | Automatic |
| Monitoring | Limited | Built-in metrics |
| Cost | Hosting + domain + SSL | Simple pricing |

## 🚨 Migration Checklist

- ✅ Removed GitHub Actions workflow
- ✅ Removed cPanel deployment files
- ✅ Removed deprecated PHP API
- ✅ Updated package.json for unified deployment
- ✅ Configured server to serve frontend
- ✅ Created Railway configuration files
- ✅ Updated .gitignore
- ✅ Created comprehensive documentation

Your project is now streamlined and ready for Railway deployment!

## 🎉 Next Steps

1. Deploy to Railway using the steps above
2. Test your application thoroughly
3. Set up a custom domain (optional)
4. Configure monitoring and alerts
5. Enjoy your simplified deployment process!

---

**Need help?** Check the main README.md for detailed development instructions.