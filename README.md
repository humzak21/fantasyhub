# Fantasy Football Power Rankings System

A comprehensive, modular fantasy football power rankings application built with React. This system provides advanced analytics, week-by-week tracking, and detailed statistics for fantasy football leagues.

## Features

### Core Functionality
- **Advanced Power Rankings**: Sophisticated algorithm considering win percentage, point differential, strength of schedule, recent form, and quality wins/losses
- **Week-by-Week Score Input**: Easy interface for entering weekly matchup results
- **Season Management**: Create and manage multiple seasons with full historical data
- **Schedule Generation**: Automatic round-robin schedule creation
- **Team Management**: Add/edit teams with owner information and detailed statistics

### Analytics & Statistics
- **Comprehensive Team Stats**: Win/loss records, point differentials, averages, streaks
- **Strength of Schedule**: Opponent quality analysis and adjustments
- **Quality Metrics**: Track quality wins, bad losses, blowout wins, close games
- **League Analytics**: Overall league statistics and trends
- **Historical Data**: Week-by-week rankings and performance tracking

### User Experience
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Intuitive Navigation**: Easy-to-use tab-based interface
- **Week Navigator**: Quick navigation between weeks with visual progress indicators
- **Data Export/Import**: Save and share season data
- **Local Storage**: Automatic data persistence

### Key Components

#### PowerRankingCalculator
- Calculates advanced team statistics and power ratings
- Considers multiple factors: wins, point differential, strength of schedule, recent form
- Adjustable weights for different ranking factors
- Handles quality wins/losses and opponent strength

#### DataManager
- Manages all data persistence and CRUD operations
- Handles seasons, teams, games, and schedule data
- Local storage integration with import/export capabilities
- Automatic data validation and integrity checks

#### useFantasyData Hook
- Central data management hook
- Provides reactive state management for all components
- Handles async operations and error states
- Calculates real-time power rankings

### Data Models

#### Team Structure
```javascript
{
  id: string,
  name: string,
  owner: string,
  wins: number,
  losses: number,
  ties: number,
  pointsFor: number,
  pointsAgainst: number,
  // ... additional calculated stats
}
```

#### Game Structure
```javascript
{
  id: string,
  week: number,
  team1Id: string,
  team2Id: string,
  team1Score: number,
  team2Score: number,
  isCompleted: boolean,
  winnerTeamId: string,
  // ... additional game metadata
}
```

#### Season Structure
```javascript
{
  id: string,
  year: number,
  name: string,
  leagueSize: number,
  regularSeasonWeeks: number,
  playoffWeeks: number,
  teams: Team[],
  schedule: Game[],
  weeks: Week[]
}
```

### Key Features Explained

#### Power Ranking Algorithm
The system uses a weighted algorithm considering:
- **Win Percentage** (25%): Basic win-loss record
- **Point Differential** (20%): Scoring margin strength
- **Strength of Schedule** (15%): Quality of opponents faced
- **Recent Form** (15%): Performance in last 4 weeks
- **Quality Wins** (10%): Victories against strong teams
- **Average Points For** (10%): Offensive consistency
- **Bad Losses** (-5%): Penalty for losses to weak teams

#### Week Navigation
- Compact floating control accessible from all tabs
- Expandable modal overlay with scrollable week selection
- Clean, streamlined interface without progress bars
- Responsive design optimized for mobile and desktop

#### Statistics Panel
Comprehensive analytics including:
- League overview and averages
- Offensive and defensive leaders
- Performance analysis (blowouts, streaks, etc.)
- Strength of schedule breakdown
- Top performers and current standings

### Data Management

#### Export/Import
- Export complete season data as JSON
- Import previously exported seasons
- Data validation on import
- Backup and sharing capabilities

#### Local Storage
- Automatic data persistence
- No server required - fully client-side
- Data survives browser refreshes
- Clear data option for fresh starts

## Customization

### Ranking Weights
Modify `POWER_RANKING_WEIGHTS` in `types/index.js`:
```javascript
export const POWER_RANKING_WEIGHTS = {
  winPercentage: 0.25,
  pointDifferential: 0.20,
  strengthOfSchedule: 0.15,
  recentForm: 0.15,
  qualityWins: 0.10,
  averagePointsFor: 0.10,
  badLosses: -0.05
};
```

### Threshold
Adjust calculation thresholds in `types/index.js`:
```javascript
export const THRESHOLDS = {
  blowout: 30,              // Point difference for blowout
  close: 5,                 // Point difference for close game
  qualityWinRankThreshold: 6,   // Rank threshold for quality wins
  badLossRankThreshold: 10,     // Rank threshold for bad losses
  recentFormWeeks: 4,           // Weeks for recent form calculation
  upsetRankDifference: 3        // Rank difference for upset detection
};
```

SELECT refresh_league_history_views();

## Future Enhancements

Potential additions could include:
- Playoff bracket visualization
- Trade tracking and analysis
- Player-level statistics integration
- League comparison tools
- Advanced charting and visualizations
- Mobile app version
- Multi-league management
- Commissioner tools
- Automated data import from fantasy platforms
