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

## Architecture

### Folder Structure
```
src/fantasy-football/
├── components/          # React components
│   ├── PowerRankingsTable.jsx
│   ├── WeekScoreInput.jsx
│   ├── SeasonManager.jsx
│   ├── StatisticsPanel.jsx
│   ├── WeekNavigator.jsx
│   ├── ScheduleManager.jsx
│   └── TeamManager.jsx
├── services/           # Business logic and calculations
│   ├── powerRankingCalculator.js
│   └── dataManager.js
├── hooks/              # Custom React hooks
│   └── useFantasyData.js
├── types/              # Data models and types
│   └── index.js
├── utils/              # Utility functions
├── styles/             # CSS styles
│   └── fantasy-football.css
├── FantasyFootballApp.jsx  # Main application component
└── README.md
```

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

## Usage

### Getting Started

1. **Create a Season**
   - Navigate to the "Seasons" tab
   - Click "New Season" and fill in details
   - Set the active season

2. **Add Teams**
   - Go to the "Teams" tab
   - Add teams with names and optional owner information
   - Teams can be edited or removed as needed

3. **Generate Schedule**
   - Visit the "Schedule" tab
   - Click "Generate Schedule" for automatic round-robin creation
   - Or manually add individual games

4. **Enter Weekly Scores**
   - Use the "Enter Scores" tab
   - Input scores for all matchups in a week
   - Data automatically saves and updates rankings

5. **View Power Rankings**
   - Check the "Power Rankings" tab for current standings
   - Toggle advanced statistics for detailed metrics
   - Navigate between weeks to see historical rankings

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
- Visual progress indicators for season completion
- Quick jump to key weeks (first, last regular season, playoffs)
- Status icons showing completed/incomplete weeks
- Responsive design for mobile navigation

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

### Thresholds
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

### Styling
The system uses CSS custom properties for easy theming. Modify `styles/fantasy-football.css`:
```css
:root {
  --ff-primary-blue: #2563eb;
  --ff-accent-green: #16a34a;
  --ff-accent-red: #dc2626;
  /* ... other color variables */
}
```

## Browser Support

- Modern browsers with ES6+ support
- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+

## Performance

- Efficient re-calculations only when data changes
- Memoized power ranking calculations
- Responsive design for mobile performance
- Local storage for instant loading

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

## Contributing

This is a self-contained module that can be easily extended. Key areas for contribution:
- Additional statistical calculations
- Enhanced visualizations
- Mobile app development
- Integration with fantasy platforms
- Performance optimizations

## License

This project is part of the larger movie tracker application and follows the same license terms.