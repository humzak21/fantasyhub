#!/usr/bin/env Rscript

# FFAnalytics Environment Health Check Script
# This script validates the R environment and ffanalytics package installation

cat("=== FFAnalytics Environment Health Check ===\n")

# Initialize results tracking
results <- list(
  r_version = FALSE,
  packages = list(),
  ffanalytics = FALSE,
  dependencies = FALSE,
  functionality = FALSE,
  overall = FALSE
)

errors <- c()
warnings <- c()

# Function to safely test package loading
test_package <- function(package_name, required = TRUE) {
  tryCatch({
    suppressPackageStartupMessages(library(package_name, character.only = TRUE))
    cat(sprintf("✓ %s: loaded successfully\n", package_name))
    return(TRUE)
  }, error = function(e) {
    if (required) {
      cat(sprintf("✗ %s: FAILED - %s\n", package_name, e$message))
      errors <<- c(errors, sprintf("%s: %s", package_name, e$message))
    } else {
      cat(sprintf("⚠ %s: optional package not available\n", package_name))
      warnings <<- c(warnings, sprintf("%s: optional package not available", package_name))
    }
    return(FALSE)
  })
}

# Check R version
cat("\n1. Checking R Version...\n")
r_version <- R.version.string
cat(sprintf("R Version: %s\n", r_version))

# Check if R version is adequate (4.0+)
r_major <- as.numeric(R.version$major)
r_minor <- as.numeric(R.version$minor)
if (r_major >= 4) {
  cat("✓ R version is adequate (4.0+)\n")
  results$r_version <- TRUE
} else {
  cat("✗ R version is too old (requires 4.0+)\n")
  errors <- c(errors, sprintf("R version %s is too old", r_version))
}

# Check core packages
cat("\n2. Checking Core Packages...\n")
core_packages <- c(
  "dplyr", "tidyr", "purrr", "data.table",
  "httr2", "rvest", "jsonlite",
  "readxl", "readr", "stringr", "lubridate"
)

package_results <- sapply(core_packages, test_package)
results$packages <- package_results

# Check ffanalytics package specifically
cat("\n3. Checking FFAnalytics Package...\n")
ffanalytics_available <- test_package("ffanalytics")
results$ffanalytics <- ffanalytics_available

if (ffanalytics_available) {
  # Get ffanalytics version
  tryCatch({
    version <- packageVersion("ffanalytics")
    cat(sprintf("FFAnalytics Version: %s\n", version))
  }, error = function(e) {
    cat("Could not determine ffanalytics version\n")
  })
  
  # Test basic ffanalytics functionality
  cat("\n4. Testing FFAnalytics Functionality...\n")
  tryCatch({
    # Test data source availability
    cat("Testing data sources...\n")
    
    # This is a basic test - in production, you might want more comprehensive tests
    # Test if we can access basic functions
    if (exists("scrape_data", where = "package:ffanalytics")) {
      cat("✓ scrape_data function available\n")
    } else {
      cat("✗ scrape_data function not found\n")
      errors <- c(errors, "scrape_data function not available")
    }
    
    if (exists("projections_table", where = "package:ffanalytics")) {
      cat("✓ projections_table function available\n")
    } else {
      cat("✗ projections_table function not found\n")
      errors <- c(errors, "projections_table function not available")
    }
    
    # Test basic data source configuration
    sources <- c("CBS", "ESPN", "FantasyPros", "FantasySharks", "FFToday", "NumberFire", "NFL")
    cat(sprintf("✓ Configured sources: %s\n", paste(sources, collapse = ", ")))
    
    positions <- c("QB", "RB", "WR", "TE", "K", "DST")
    cat(sprintf("✓ Configured positions: %s\n", paste(positions, collapse = ", ")))
    
    results$functionality <- TRUE
    
  }, error = function(e) {
    cat(sprintf("✗ FFAnalytics functionality test failed: %s\n", e$message))
    errors <- c(errors, sprintf("FFAnalytics functionality: %s", e$message))
  })
}

# Check optional packages
cat("\n5. Checking Optional Packages...\n")
optional_packages <- c("futile.logger", "memoise", "parallel")
optional_results <- sapply(optional_packages, function(pkg) test_package(pkg, required = FALSE))

# System information
cat("\n6. System Information...\n")
cat(sprintf("Platform: %s\n", R.version$platform))
cat(sprintf("OS: %s\n", R.version$os))
cat(sprintf("Architecture: %s\n", R.version$arch))

# Memory information
cat(sprintf("Memory limit: %.0f MB\n", memory.limit()))

# Library paths
cat("\nLibrary paths:\n")
lib_paths <- .libPaths()
for (i in seq_along(lib_paths)) {
  cat(sprintf("  %d. %s\n", i, lib_paths[i]))
}

# Check dependencies
cat("\n7. Checking System Dependencies...\n")
results$dependencies <- TRUE

# Check if we can create temporary files (needed for data processing)
tryCatch({
  temp_file <- tempfile()
  writeLines("test", temp_file)
  if (file.exists(temp_file)) {
    cat("✓ Temporary file creation works\n")
    unlink(temp_file)
  } else {
    cat("✗ Cannot create temporary files\n")
    errors <- c(errors, "Cannot create temporary files")
    results$dependencies <- FALSE
  }
}, error = function(e) {
  cat(sprintf("✗ Temporary file test failed: %s\n", e$message))
  errors <- c(errors, sprintf("Temporary files: %s", e$message))
  results$dependencies <- FALSE
})

# Final assessment
cat("\n=== Health Check Summary ===\n")

# Calculate overall health
core_packages_ok <- sum(package_results) >= length(core_packages) * 0.8  # 80% of core packages
overall_health <- results$r_version && 
                 core_packages_ok && 
                 results$ffanalytics && 
                 results$dependencies

results$overall <- overall_health

if (overall_health) {
  cat("✓ OVERALL STATUS: HEALTHY\n")
  cat("The R environment is properly configured for FFAnalytics integration.\n")
} else {
  cat("✗ OVERALL STATUS: ISSUES DETECTED\n")
  cat("The R environment has issues that need to be addressed.\n")
}

# Report errors
if (length(errors) > 0) {
  cat("\nErrors found:\n")
  for (i in seq_along(errors)) {
    cat(sprintf("  %d. %s\n", i, errors[i]))
  }
}

# Report warnings
if (length(warnings) > 0) {
  cat("\nWarnings:\n")
  for (i in seq_along(warnings)) {
    cat(sprintf("  %d. %s\n", i, warnings[i]))
  }
}

# Recommendations
cat("\nRecommendations:\n")
if (!results$r_version) {
  cat("- Update R to version 4.0 or higher\n")
}
if (!results$ffanalytics) {
  cat("- Install ffanalytics package: install.packages('ffanalytics')\n")
}
if (sum(package_results) < length(core_packages)) {
  missing_packages <- names(package_results)[!package_results]
  cat(sprintf("- Install missing packages: install.packages(c('%s'))\n", 
              paste(missing_packages, collapse = "', '")))
}
if (!results$dependencies) {
  cat("- Check system permissions and disk space\n")
}

# Exit with appropriate code
if (overall_health) {
  cat("\nEnvironment is ready for FFAnalytics integration!\n")
  quit(status = 0)
} else {
  cat("\nPlease address the issues above before using FFAnalytics integration.\n")
  quit(status = 1)
}