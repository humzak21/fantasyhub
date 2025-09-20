#!/usr/bin/env Rscript

# R Dependencies Installation Script for FFAnalytics Integration
# This script installs all required R packages for the ffanalytics integration

cat("=== FFAnalytics R Dependencies Installation ===\n")
cat("Starting installation of required R packages...\n\n")

# Function to install packages with error handling
install_package_safe <- function(package_name, description = "") {
  cat(sprintf("Installing %s", package_name))
  if (description != "") {
    cat(sprintf(" (%s)", description))
  }
  cat("...\n")
  
  tryCatch({
    if (!require(package_name, character.only = TRUE, quietly = TRUE)) {
      install.packages(package_name, dependencies = TRUE, repos = "https://cran.rstudio.com/")
      library(package_name, character.only = TRUE)
      cat(sprintf("✓ %s installed successfully\n", package_name))
    } else {
      cat(sprintf("✓ %s already installed\n", package_name))
    }
  }, error = function(e) {
    cat(sprintf("✗ Failed to install %s: %s\n", package_name, e$message))
    return(FALSE)
  })
  return(TRUE)
}

# Core packages required for ffanalytics
required_packages <- list(
  list(name = "ffanalytics", desc = "Fantasy Football Analytics"),
  list(name = "dplyr", desc = "Data manipulation"),
  list(name = "tidyr", desc = "Data tidying"),
  list(name = "purrr", desc = "Functional programming"),
  list(name = "data.table", desc = "Fast data manipulation"),
  list(name = "httr2", desc = "HTTP client"),
  list(name = "rvest", desc = "Web scraping"),
  list(name = "jsonlite", desc = "JSON parsing"),
  list(name = "readxl", desc = "Excel file reading"),
  list(name = "readr", desc = "Fast file reading"),
  list(name = "writexl", desc = "Excel file writing"),
  list(name = "stringr", desc = "String manipulation"),
  list(name = "lubridate", desc = "Date/time handling"),
  list(name = "futile.logger", desc = "Logging framework")
)

# Install packages
failed_packages <- c()
for (pkg in required_packages) {
  success <- install_package_safe(pkg$name, pkg$desc)
  if (!success) {
    failed_packages <- c(failed_packages, pkg$name)
  }
}

cat("\n=== Installation Summary ===\n")
if (length(failed_packages) == 0) {
  cat("✓ All packages installed successfully!\n")
} else {
  cat(sprintf("✗ Failed to install %d packages: %s\n", 
              length(failed_packages), 
              paste(failed_packages, collapse = ", ")))
}

# Verify ffanalytics installation
cat("\n=== Verifying FFAnalytics Installation ===\n")
tryCatch({
  library(ffanalytics)
  cat("✓ ffanalytics package loaded successfully\n")
  cat(sprintf("✓ ffanalytics version: %s\n", packageVersion("ffanalytics")))
  
  # Test basic functionality
  cat("Testing basic ffanalytics functionality...\n")
  sources <- c("CBS", "ESPN", "FantasyPros")
  cat(sprintf("✓ Available sources: %s\n", paste(sources, collapse = ", ")))
  
}, error = function(e) {
  cat(sprintf("✗ ffanalytics verification failed: %s\n", e$message))
})

cat("\n=== Installation Complete ===\n")
cat("You can now run the ffanalytics integration scripts.\n")
cat("Next steps:\n")
cat("1. Run: npm run analytics:health-check\n")
cat("2. Test with: Rscript scripts/ffanalytics/test_environment.R\n")