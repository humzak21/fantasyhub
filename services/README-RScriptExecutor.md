# RScriptExecutor Service

The RScriptExecutor service provides robust R script execution capabilities for the ffanalytics integration. It handles timeout management, error recovery, logging, monitoring, and data parsing from R script output.

## Features

- **Robust Execution**: Execute R scripts with comprehensive error handling
- **Timeout Management**: Configurable timeouts with automatic process termination
- **Retry Logic**: Automatic retry for transient failures with exponential backoff
- **Data Parsing**: Intelligent parsing of JSON and R data output formats
- **Performance Monitoring**: Track execution statistics and performance metrics
- **Logging**: Detailed logging for debugging and monitoring
- **FFAnalytics Integration**: Specialized methods for ffanalytics operations

## Usage

### Basic Usage

```javascript
import { RScriptExecutor } from './services/rScriptExecutor.js';

const executor = new RScriptExecutor({
  timeout: 300000,     // 5 minutes
  maxRetries: 3,       // Retry failed executions
  enableLogging: true  // Enable detailed logging
});

// Execute an R script
const result = await executor.executeScript('my_script', ['arg1', 'arg2']);
console.log(result.data); // Parsed output data
```

### FFAnalytics Operations

```javascript
// Scrape weekly projections
const projections = await executor.scrapeProjections(
  ['ESPN', 'CBS', 'FantasyPros'], // sources
  ['QB', 'RB', 'WR'],             // positions
  2024,                           // season
  1                               // week
);

// Add Expert Consensus Rankings
const withECR = await executor.addECR(projections.data);

// Add Average Draft Position
const withADP = await executor.addADP(projections.data, ['ESPN', 'Yahoo']);
```

### Environment Testing

```javascript
// Test R environment and ffanalytics availability
const envTest = await executor.testEnvironment();

if (envTest.success) {
  console.log(`R Version: ${envTest.rVersion}`);
  console.log(`FFAnalytics available: ${envTest.ffanalyticsAvailable}`);
} else {
  console.error(`Environment error: ${envTest.error}`);
}
```

## Configuration

### Constructor Options

```javascript
const executor = new RScriptExecutor({
  // R executable path (default: 'Rscript')
  rExecutable: 'Rscript',
  
  // Path to R scripts directory
  scriptsPath: './scripts/ffanalytics',
  
  // Execution timeout in milliseconds (default: 300000 = 5 minutes)
  timeout: 300000,
  
  // Maximum retry attempts (default: 3)
  maxRetries: 3,
  
  // Delay between retries in milliseconds (default: 5000)
  retryDelay: 5000,
  
  // Enable/disable logging (default: true)
  enableLogging: true
});
```

### Environment Variables

```bash
# R executable path
R_EXECUTABLE_PATH=Rscript

# FFAnalytics scripts directory
FFANALYTICS_SCRIPTS_PATH=./scripts/ffanalytics/
```

### Runtime Configuration Updates

```javascript
// Update configuration at runtime
executor.updateConfig({
  timeout: 600000,  // 10 minutes
  maxRetries: 5
});

// Get current configuration
const config = executor.getConfig();
```

## Error Handling

The service provides comprehensive error handling with specific error types:

```javascript
import { RScriptError, R_ERROR_TYPES } from './services/rScriptExecutor.js';

try {
  const result = await executor.executeScript('my_script');
} catch (error) {
  if (error instanceof RScriptError) {
    switch (error.type) {
      case R_ERROR_TYPES.TIMEOUT:
        console.log('Script execution timed out');
        break;
      case R_ERROR_TYPES.SCRIPT_NOT_FOUND:
        console.log('R script file not found');
        break;
      case R_ERROR_TYPES.EXECUTION_FAILED:
        console.log('R script execution failed');
        break;
      case R_ERROR_TYPES.PARSING_FAILED:
        console.log('Failed to parse script output');
        break;
      case R_ERROR_TYPES.ENVIRONMENT_ERROR:
        console.log('R environment not properly configured');
        break;
    }
    
    // Check if error is retryable
    if (error.retryable) {
      console.log('This error can be retried');
    }
  }
}
```

## Monitoring and Statistics

Track execution performance and success rates:

```javascript
// Get execution statistics
const stats = executor.getExecutionStats();
console.log(`Total executions: ${stats.totalExecutions}`);
console.log(`Success rate: ${stats.successRate}%`);
console.log(`Average execution time: ${stats.averageExecutionTime}ms`);

// Reset statistics
executor.resetStats();
```

## Data Parsing

The service automatically parses R script output:

### JSON Output
If your R script outputs JSON, it will be automatically parsed:

```r
# R script
library(jsonlite)
result <- list(players = data.frame(name = c("Player1", "Player2"), points = c(15.5, 12.3)))
cat(toJSON(result, auto_unbox = TRUE))
```

```javascript
const result = await executor.executeScript('json_script');
console.log(result.data.players); // Parsed JSON data
```

### Raw Output
Non-JSON output is returned as structured raw data:

```javascript
const result = await executor.executeScript('text_script');
console.log(result.data.type);  // 'raw'
console.log(result.data.lines); // Array of output lines
console.log(result.data.raw);   // Complete raw output
```

## FFAnalytics Methods

### scrapeProjections(sources, positions, season, week)
Scrape player projections from multiple sources.

**Parameters:**
- `sources`: Array of data sources (e.g., ['ESPN', 'CBS', 'FantasyPros'])
- `positions`: Array of player positions (e.g., ['QB', 'RB', 'WR'])
- `season`: Season year (e.g., 2024)
- `week`: Week number (0 for season-long projections)

### addECR(projectionsData)
Add Expert Consensus Rankings to projections data.

### addADP(projectionsData, sources)
Add Average Draft Position data from specified sources.

### addUncertainty(projectionsData)
Add uncertainty metrics to projections data.

### addPlayerInfo(projectionsData)
Add additional player information to projections data.

## Testing

Run the test suite:

```bash
# Unit tests
npm test -- services/__tests__/rScriptExecutor.test.js

# Integration tests (requires R installation)
npm test -- services/__tests__/rScriptExecutor.integration.test.js
```

## Example Scripts

See `examples/rScriptExecutor-example.js` for a complete usage demonstration.

## Requirements

- Node.js with ES modules support
- R installation with Rscript executable in PATH
- ffanalytics R package (for ffanalytics-specific methods)
- Required R dependencies: dplyr, tidyr, purrr, httr2, rvest, data.table

## Troubleshooting

### R Not Found
```
Error: R script process error: spawn Rscript ENOENT
```
**Solution:** Install R and ensure `Rscript` is in your PATH, or set `R_EXECUTABLE_PATH` environment variable.

### FFAnalytics Package Not Found
```
Error: ffanalytics package not available
```
**Solution:** Install the ffanalytics R package:
```r
install.packages("devtools")
devtools::install_github("FantasyFootballAnalytics/ffanalytics")
```

### Script Timeout
```
Error: R script execution timed out after 300000ms
```
**Solution:** Increase timeout in configuration or optimize your R scripts.

### Permission Denied
```
Error: spawn Rscript EACCES
```
**Solution:** Ensure R scripts have execute permissions:
```bash
chmod +x scripts/ffanalytics/*.R
```