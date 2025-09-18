#!/usr/bin/env Rscript

# Test script to verify R environment and ffanalytics package
# This script is used by RScriptExecutor to validate the environment

# Print R version
cat("R version:", R.version.string, "\n")

# Test if ffanalytics package is available
tryCatch({
  library(ffanalytics)
  cat("ffanalytics package loaded successfully\n")
  
  # Test basic ffanalytics functionality
  sources <- c("CBS", "ESPN", "FantasyPros")
  cat("Available sources for testing:", paste(sources, collapse=", "), "\n")
  
  # Test if we can access basic functions
  if (exists("scrape_data")) {
    cat("scrape_data function available\n")
  }
  
  if (exists("projections_table")) {
    cat("projections_table function available\n")
  }
  
  cat("Environment test completed successfully\n")
  
}, error = function(e) {
  cat("ERROR: ffanalytics package not available:", e$message, "\n")
  quit(status = 1)
})

# Test required dependencies
required_packages <- c("dplyr", "tidyr", "purrr", "httr2", "rvest", "data.table")
missing_packages <- c()

for (pkg in required_packages) {
  if (!require(pkg, character.only = TRUE, quietly = TRUE)) {
    missing_packages <- c(missing_packages, pkg)
  }
}

if (length(missing_packages) > 0) {
  cat("WARNING: Missing required packages:", paste(missing_packages, collapse=", "), "\n")
} else {
  cat("All required dependencies are available\n")
}

cat("R environment test completed\n")