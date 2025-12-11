# Movie Tracker

A modern, full-stack movie tracking application that helps you catalog, rate, and analyze your movie watching habits with rich data from The Movie Database (TMDB).

## ✨ Features

- **Movie Management**: Add, edit, delete, and organize your movie collection
- **TMDB Integration**: Automatic movie data fetching with posters, cast, crew, and metadata
- **Dual Rating System**: Rate movies on both 1-5 star and 0-100 detailed scales
- **Advanced Search**: Search your collection by title, director, genre, or description
- **Interactive Statistics**: Visualize your movie watching patterns with dynamic charts
- **Batch Operations**: Add multiple movies efficiently
- **Rewatch Tracking**: Mark and track movies you've watched multiple times
- **Responsive Design**: Seamless experience across desktop and mobile devices

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern UI library with hooks
- **Vite** - Fast build tool and development server
- **Chart.js** - Interactive data visualizations
- **CSS Modules** - Scoped styling architecture
- **Responsive Design** - Mobile-first approach

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **Supabase** - PostgreSQL database with real-time features
- **TMDB API** - Movie data integration
- **Rate Limiting** - API protection and quota management

### Database Schema
- **Movies**: Core movie data from TMDB
- **Directors**: Director information and relationships
- **Genres**: Movie genres and categorization
- **User Ratings**: Personal ratings and watch history
- **Relational Design**: Normalized data structure

### Deployment
- **Railway** - Cloud platform for full-stack deployment
- **Environment Management** - Separate staging and production environments
- **Automatic Deployments** - CI/CD from GitHub
- **Custom Domains** - HTTPS-enabled custom domain support

## 🎬 Core Functionality

### Movie Collection Management
- Add movies by searching TMDB database
- Automatic metadata population (runtime, release date, cast, crew)
- High-quality poster and backdrop images
- Comprehensive movie details and descriptions

### Rating & Review System
- **Star Rating**: Quick 1-5 star ratings
- **Detailed Rating**: Precise 0-100 scale scoring
- **Watch Date Tracking**: Record when you watched each movie
- **Rewatch Support**: Track multiple viewings of the same movie
- **Personal Notes**: Add custom notes and thoughts

### Analytics & Statistics
- **Rating Distribution**: Visualize your rating patterns
- **Genre Analysis**: See your favorite movie genres
- **Watching Trends**: Track your movie consumption over time
- **Director Insights**: Discover your preferred directors
- **Comprehensive Stats**: Total movies, average ratings, and more

### Search & Discovery
- **Smart Search**: Find movies by title, director, or genre
- **Filter Options**: Sort by rating, date, genre, or director
- **TMDB Integration**: Discover new movies from trending lists
- **Batch Import**: Add multiple movies from CSV or manual entry

## 🏗️ Architecture

The application follows a modern full-stack architecture:

- **Frontend**: React SPA with component-based architecture
- **Backend**: RESTful API with Express.js
- **Database**: PostgreSQL via Supabase with real-time capabilities
- **External APIs**: TMDB for movie data enrichment
- **Deployment**: Containerized deployment on Railway platform

## 📊 Data Sources

- **The Movie Database (TMDB)**: Movie metadata, posters, cast, crew
- **User Input**: Personal ratings, watch dates, notes
- **Calculated Metrics**: Statistics and analytics derived from user data

## 🔒 Security & Performance

- **Rate Limiting**: Protects against API abuse
- **Environment Variables**: Secure credential management
- **CORS Configuration**: Proper cross-origin resource sharing
- **Database Security**: Row-level security with Supabase
- **Optimized Queries**: Efficient database operations

## 📱 User Experience

- **Intuitive Interface**: Clean, modern design focused on usability
- **Fast Performance**: Optimized loading and smooth interactions
- **Mobile Responsive**: Full functionality on all device sizes
- **Real-time Updates**: Live data synchronization
- **Accessibility**: Keyboard navigation and screen reader support

---

*Built with ❤️ for movie enthusiasts who want to track and analyze their cinematic journey.*