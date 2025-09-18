#!/usr/bin/env node

import { spawn } from 'child_process';

// Simple test with 2025 season, week 0 (seasonal data)
async function testSeasonalData() {
    console.log('Testing R script with 2025 season, week 0 (seasonal data)...\n');

    const rCode = `
    library(ffanalytics)
    library(jsonlite)
    
    cat("Scraping 2025 seasonal data for QB position...\n")
    
    result <- tryCatch({
      # Scrape seasonal data (week = 0)
      scraped_data <- scrape_data(src = c("CBS"), pos = c("QB"), season = 2025, week = 0)
      
      if(!is.null(scraped_data) && nrow(scraped_data) > 0) {
        cat("Successfully scraped", nrow(scraped_data), "records\n")
        
        # Calculate projections
        projections <- projections_table(scraped_data)
        cat("Generated", nrow(projections), "projections\n")
        
        # Show first few results
        cat("Sample data:\n")
        print(head(projections[, c("player", "pos", "team", "points")], 3))
        
        list(success = TRUE, count = nrow(projections))
      } else {
        cat("No data scraped\n")
        list(success = FALSE, error = "No data scraped")
      }
      
    }, error = function(e) {
      cat("Error:", e$message, "\n")
      list(success = FALSE, error = e$message)
    })
    
    cat("Final result:", toJSON(result, auto_unbox = TRUE), "\n")
  `;

    try {
        const result = await executeRCode(rCode);
        console.log('✅ R script execution completed!');
        console.log('\nOutput:');
        console.log(result.stdout);

        if (result.stderr) {
            console.log('\nStderr (warnings/info):');
            console.log(result.stderr);
        }

    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

// Helper function to execute R code directly
function executeRCode(code) {
    return new Promise((resolve, reject) => {
        const rProcess = spawn('R', ['--slave', '--no-restore'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 60000 // 60 second timeout
        });

        let stdout = '';
        let stderr = '';

        rProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        rProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        rProcess.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr, code });
            } else {
                reject(new Error(`R process exited with code ${code}. stderr: ${stderr}`));
            }
        });

        rProcess.on('error', (error) => {
            reject(error);
        });

        // Send the R code to the process
        rProcess.stdin.write(code);
        rProcess.stdin.end();
    });
}

// Run the test
testSeasonalData().catch(console.error);