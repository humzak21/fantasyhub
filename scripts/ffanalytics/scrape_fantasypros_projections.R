#!/usr/bin/env Rscript

# Scrapes projections from FantasyPros only using ffanalytics
library(ffanalytics)
library(jsonlite)
library(dplyr)

# Helper function to get current NFL season
get_current_season <- function() {
  current_date <- Sys.Date()
  current_year <- as.numeric(format(current_date, "%Y"))
  current_month <- as.numeric(format(current_date, "%m"))
  
  # NFL season typically starts in September and runs through February of next year
  if(current_month >= 9) {
    return(current_year)
  } else if(current_month <= 2) {
    return(current_year - 1)
  } else {
    return(current_year)  # Off-season, use current year
  }
}

# Helper function to estimate current NFL week
get_current_week <- function() {
  current_date <- Sys.Date()
  current_year <- as.numeric(format(current_date, "%Y"))
  current_month <- as.numeric(format(current_date, "%m"))
  
  if(current_month >= 9 || current_month <= 2) {
    # During season, estimate week
    if(current_month >= 9) {
      # September onwards
      week_estimate <- ceiling((as.numeric(current_date) - as.numeric(as.Date(paste0(current_year, "-09-01")))) / 7)
    } else {
      # January/February
      week_estimate <- ceiling((as.numeric(current_date) - as.numeric(as.Date(paste0(current_year-1, "-09-01")))) / 7)
    }
    return(max(1, min(18, week_estimate)))  # Cap between 1-18
  } else {
    return(1)  # Off-season default
  }
}

# Function to scrape FantasyPros data
scrape_fantasypros_data <- function(week = NULL, season = NULL, positions = NULL) {
  # Default to current week/season if not specified
  if(is.null(week)) week <- get_current_week()
  if(is.null(season)) season <- get_current_season()
  if(is.null(positions)) positions <- c("QB", "RB", "WR", "TE", "K", "DST")
  
  cat("Scraping FantasyPros data for week", week, "season", season, "\n")
  cat("Positions:", paste(positions, collapse = ", "), "\n")
  
  tryCatch({
    # Scrape data from FantasyPros only
    scraped_data <- scrape_data(src = "FantasyPros", pos = positions, season = season, week = week)
    
    if(is.null(scraped_data) || nrow(scraped_data) == 0) {
      cat("No FantasyPros data scraped\n")
      return(list(success = FALSE, error = "No FantasyPros data scraped", data = NULL, source = "FantasyPros"))
    }
    
    # Calculate projections
    projections <- projections_table(scraped_data, avg_type = "average")
    
    # Add additional data
    projections <- projections %>%
      add_player_info()
    
    # Add source identifier
    projections$source <- "FantasyPros"
    
    cat("Successfully scraped", nrow(projections), "FantasyPros player projections\n")
    
    return(list(
      success = TRUE,
      data = projections,
      week = week,
      season = season,
      source = "FantasyPros",
      count = nrow(projections)
    ))
    
  }, error = function(e) {
    cat("Error scraping FantasyPros data:", e$message, "\n")
    return(list(success = FALSE, error = e$message, data = NULL, source = "FantasyPros"))
  })
}

# Main execution when script is called directly
if (!interactive()) {
  # Parse command line arguments
  args <- commandArgs(trailingOnly = TRUE)
  
  week <- NULL
  season <- NULL
  positions <- NULL
  
  # Parse arguments
  for (i in seq_along(args)) {
    if (args[i] == "--week" && i < length(args)) {
      week <- as.numeric(args[i + 1])
    } else if (args[i] == "--season" && i < length(args)) {
      season <- as.numeric(args[i + 1])
    } else if (args[i] == "--positions" && i < length(args)) {
      positions <- strsplit(args[i + 1], ",")[[1]]
    }
  }
  
  # Execute scraping
  result <- scrape_fantasypros_data(week, season, positions)
  
  # Output JSON result
  cat(toJSON(result, auto_unbox = TRUE, pretty = TRUE))
}