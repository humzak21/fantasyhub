# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Environment

This is a React-based fantasy football power rankings application built with Vite, Tailwind CSS, and Supabase. The app uses modern tooling including ESLint, TypeScript checking, and Railway deployment.

## Available Commands

### Development
- `npm run dev` - Start development server (opens on localhost:3000)
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm start` - Start production server (for Railway deployment)

### Code Quality
- `npm run lint` - Run ESLint to check for code issues
- `npm run lint:fix` - Automatically fix ESLint errors
- `npm run type-check` - Run TypeScript checking without emitting files

### Database
- `npm run db:setup` - Instructions for running SQL files in Supabase
- `npm run db:reset` - Instructions for resetting database schema

### Utilities
- `npm run clean` - Clean build artifacts and cache

## Architecture Overview

### Core Structure
- **Main App**: `FantasyFootballApp.jsx` - Primary application component with tab-based navigation
- **Data Layer**: 
  - `services/supabaseDataManager.js` - Handles all CRUD operations and Supabase persistence
  - `services/powerRankingCalculator.js` - Advanced ranking algorithms with configurable weights
  - `services/espnScheduleFetcher.js` - ESPN integration for schedule data
  - `services/espnRosterUpdater.js` - ESPN integration for roster updates
- **State Management**: `hooks/useSupabaseFantasyData.js` - Central hook managing all application state
- **Components**: Modular React components in `/components` directory

### Key Data Flow
1. `useSupabaseFantasyData` hook manages singleton `SupabaseDataManager` instance
2. `SupabaseDataManager` handles persistence via Supabase database
3. `PowerRankingCalculator` processes team/game data using weighted algorithms
4. Components receive state/actions through the central hook

### Critical Files
- `types/index.js` - Contains all data models, validation functions, and configuration constants including `POWER_RANKING_WEIGHTS` and `THRESHOLDS`
- `FantasyFootballApp.jsx` - Main component with auth integration and navigation
- `services/supabaseDataManager.js` - Core business logic for seasons, teams, games, schedules
- `hooks/useSupabaseFantasyData.js` - Reactive state management layer
- `services/supabaseClient.js` - Supabase configuration and helpers

## Data Models

### Key Entities
- **Season**: Contains teams, schedule, weeks with league configuration
- **Team**: Team data with calculated statistics (wins, losses, points, etc.) and ESPN roster integration
- **Game**: Individual matchups with scores and completion status
- **Week**: Container for games within a specific week
- **Player**: Detailed player data with projected/actual points, injury status, ownership

### Configuration
Ranking algorithm weights and thresholds are defined in `types/index.js`:
- Power ranking weights (win percentage, point differential, strength of schedule, roster strength, etc.)
- Game thresholds (blowout margins, quality win/loss criteria)

## Integration Context

This fantasy football module integrates with:
- **Supabase**: Database persistence with RLS (Row Level Security)
- **ESPN API**: Schedule and roster data fetching
- **Authentication**: Uses `useAuth` context for user management
- **React Router**: Navigation
- **UI components**: From `../components/ui/` (button, card, tabs, badge) using shadcn/ui
- **Tailwind CSS**: Styling with custom design system

## Development Notes

- Built with Vite for fast development and optimized builds
- Uses TypeScript checking without compilation (JSDoc + .ts config)
- Supabase provides real-time data synchronization
- ESPN integration allows automatic data import
- Responsive design with mobile-first approach
- This project has 1 authenticated user. All other users are visualizing the public data. RLS policies should reflect this. Only authenticated users can change this data, but the general public (anyone visiting the page) can view the data.
- Owner names eg: "Humza Khalil" are stored in the database and should be the first thing to check against when looking for data for a team. Team names often change but owner names are consistent.