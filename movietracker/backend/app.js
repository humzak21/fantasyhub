import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import movieRoutes from './routes/movieRoutes.js'
import statsRoutes from './routes/statsRoutes.js'

// Build an exportable Express sub-app without starting a server
export function createMovieTrackerApp() {
  const app = express()

  // Security middleware (keep conservative defaults compatible with hub)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://image.tmdb.org'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          connectSrc: [
            "'self'",
            'https://*.supabase.co',
            'https://api.themoviedb.org',
            'https://api.github.com',
          ],
        },
      },
    }),
  )

  // CORS: rely on parent server's configuration; keep permissive if directly used
  app.use(
    cors({
      origin: true,
      credentials: true,
      optionsSuccessStatus: 200,
    }),
  )

  // Logging
  app.use(morgan('combined'))

  // Body parsing
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // Routes
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'MovieTracker', timestamp: new Date().toISOString() })
  })
  app.use('/', movieRoutes)
  app.use('/stats', statsRoutes)

  // Error handling middleware (scoped to sub-app)
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    })
  })

  // 404 handler for sub-app
  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'MovieTracker route not found', path: req.path })
  })

  return app
}

export default createMovieTrackerApp