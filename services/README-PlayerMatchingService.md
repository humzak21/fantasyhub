# PlayerMatchingService

The PlayerMatchingService provides fuzzy matching capabilities to correlate players in the local Supabase database with corresponding ffanalytics player records. This service is a core component of the ffanalytics integration system.

## Features

- **Fuzzy String Matching**: Uses multiple algorithms (Levenshtein, Jaro-Winkler, Token-based) to handle name variations
- **Confidence Scoring**: Provides confidence scores for matches to enable automated approval and manual review workflows
- **Bulk Processing**: Efficiently processes large datasets of players
- **Position Filtering**: Ensures matches are only considered for players in the same position
- **Team Normalization**: Handles common team abbreviation variations (LV/LAS, WSH/WAS, etc.)
- **Name Normalization**: Handles punctuation, suffixes, and common name variations

## Usage

### Basic Usage

```javascript
import { PlayerMatchingService } from './services/playerMatchingService.js';

const matchingService = new PlayerMatchingService();

// Match a single player
const localPlayer = {
  id: '1',
  name: 'Josh Allen',
  position: 'QB',
  teamAbbreviation: 'BUF'
};

const ffanalyticsPlayers = [
  {
    player_name: 'Josh Allen',
    position: 'QB',
    team: 'BUF',
    player_id: 'ff_josh_allen_1'
  }
];

const match = await matchingService.matchPlayer(localPlayer, ffanalyticsPlayers);
if (match) {
  console.log(`Matched with confidence: ${match.confidence}`);
  console.log(`FFAnalytics Player: ${match.player.player_name}`);
}
```

### Bulk Matching

```javascript
// Process multiple players at once
const results = await matchingService.bulkMatchPlayers(
  localPlayers,
  ffanalyticsPlayers,
  {
    autoApprove: true,
    confidenceThreshold: 0.8,
    dryRun: false // Set to true to test without database updates
  }
);

console.log(`Processed: ${results.totalProcessed}`);
console.log(`Matched: ${results.matched}`);
console.log(`Auto-approved: ${results.autoApproved}`);
console.log(`Need review: ${results.needsReview}`);
```

### Database Operations

```javascript
// Update player with ffanalytics ID
await matchingService.updatePlayerFFAnalyticsId(
  'player-id',
  'ff-analytics-id',
  0.95 // confidence score
);

// Get unmatched players
const unmatchedPlayers = await matchingService.getUnmatchedPlayers(100);

// Get matching statistics
const stats = await matchingService.getMatchingStats();
console.log(`Match rate: ${stats.matchPercentage}%`);

// Validate existing matches
const validationResults = await matchingService.validateMatches(50);
const needsReview = validationResults.filter(r => r.needsReview);
```

## Configuration

The service can be configured with custom thresholds and weights:

```javascript
const matchingService = new PlayerMatchingService();

// Modify configuration
matchingService.config.confidenceThreshold = 0.85;
matchingService.config.autoApproveThreshold = 0.95;
matchingService.config.nameWeight = 0.6;
matchingService.config.positionWeight = 0.3;
matchingService.config.teamWeight = 0.1;
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `confidenceThreshold` | 0.8 | Minimum confidence for considering a match valid |
| `fuzzyMatchThreshold` | 0.7 | Minimum similarity score for fuzzy matching |
| `autoApproveThreshold` | 0.95 | Minimum confidence for automatic approval |
| `nameWeight` | 0.5 | Weight given to name similarity in overall confidence |
| `positionWeight` | 0.3 | Weight given to position matching in overall confidence |
| `teamWeight` | 0.2 | Weight given to team matching in overall confidence |

## Matching Algorithms

### Name Similarity

The service uses multiple algorithms to calculate name similarity:

1. **Exact Match**: Returns 1.0 for identical names
2. **Containment**: Returns 0.9 if one name contains the other (handles nicknames)
3. **Levenshtein Distance**: Calculates edit distance between names
4. **Jaro-Winkler**: Better for handling transpositions and prefix matching
5. **Token Similarity**: Handles different word orders (e.g., "Josh Allen" vs "Allen, Josh")

### Name Normalization

Names are normalized before comparison:
- Convert to lowercase
- Remove punctuation and special characters
- Remove common suffixes (Jr., Sr., II, III, IV)
- Normalize whitespace

### Position Matching

Positions must match exactly, with support for common variations:
- `DEF` → `D/ST`
- `DST` → `D/ST`
- `PK` → `K`
- `KICKER` → `K`

### Team Matching

Team abbreviations are normalized to handle common variations:
- `LV` ↔ `LAS` (Las Vegas Raiders)
- `WSH` ↔ `WAS` (Washington Commanders)
- `LAR` ↔ `LA` (Los Angeles Rams)

## Error Handling

The service includes comprehensive error handling:

```javascript
try {
  const results = await matchingService.bulkMatchPlayers(players, ffPlayers);
  
  // Check for errors
  if (results.errors.length > 0) {
    console.log('Errors occurred:');
    results.errors.forEach(error => {
      console.log(`Player ${error.playerName}: ${error.error}`);
    });
  }
} catch (error) {
  console.error('Bulk matching failed:', error.message);
}
```

## Performance Considerations

- **Bulk Processing**: Use `bulkMatchPlayers()` for processing multiple players efficiently
- **Position Filtering**: Players are filtered by position before name matching to reduce comparisons
- **Caching**: Consider caching ffanalytics data to avoid repeated API calls
- **Batch Size**: For very large datasets, process in batches to avoid memory issues

## Testing

The service includes comprehensive tests:

```bash
# Run all PlayerMatchingService tests
npm test -- --run services/__tests__/playerMatchingService

# Run specific test files
npm test -- --run services/__tests__/playerMatchingService.simple.test.js
npm test -- --run services/__tests__/playerMatchingService.integration.test.js
```

## Example Output

```
Starting bulk matching for 100 local players against 500 ffanalytics players
Bulk matching completed: 95 matches found, 87 auto-approved, 8 need review, 5 failed

Match Statistics:
- Total Players: 100
- Matched: 95 (95.0%)
- Auto-approved: 87 (87.0%)
- Need Review: 8 (8.0%)
- Failed: 5 (5.0%)
```

## Integration with FFAnalyticsService

The PlayerMatchingService is designed to work with the FFAnalyticsService:

```javascript
import { FFAnalyticsService } from './ffAnalyticsService.js';
import { PlayerMatchingService } from './playerMatchingService.js';

const ffService = new FFAnalyticsService();
const matchingService = new PlayerMatchingService();

// Get ffanalytics data
const ffData = await ffService.syncWeeklyProjections();

// Get local players
const localPlayers = await dataManager.getAllPlayers();

// Match players
const results = await matchingService.bulkMatchPlayers(localPlayers, ffData);
```

## Troubleshooting

### Common Issues

1. **Low Match Rates**: 
   - Check that position data is consistent between systems
   - Verify team abbreviations are normalized
   - Consider lowering confidence thresholds for initial matching

2. **False Positives**:
   - Increase confidence thresholds
   - Review matches with low confidence scores manually
   - Check for duplicate players in ffanalytics data

3. **Performance Issues**:
   - Use bulk processing instead of individual matches
   - Filter ffanalytics data by position before matching
   - Process in smaller batches for very large datasets

### Debug Mode

Enable detailed logging by setting environment variable:

```bash
DEBUG=player-matching node your-script.js
```

## Dependencies

- `@supabase/supabase-js`: Database operations
- Node.js built-in modules only for string algorithms

## Related Files

- `services/ffAnalyticsService.js`: Main orchestration service
- `services/supabaseDataManager.js`: Database operations
- `database/ffanalytics_schema_migration.sql`: Database schema
- `examples/playerMatchingService-example.js`: Usage examples