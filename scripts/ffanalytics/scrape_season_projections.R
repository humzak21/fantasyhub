#!/usr/bin/env Rscript

# Scrapes season-long projections using ffanalytics
# Enhanced with comprehensive error handling and logging

# Load required libraries with error handling
tryCatch({
  library(ffanalytics)
  library(jsonlite)
  library(dplyr)
  library(purrr)
  
  # Ensure dplyr functions are properly available
  filter <- dplyr::filter
  select <- dplyr::select
  mutate <- dplyr::mutate
}, error = function(e) {
  cat("ERROR: Failed to load required libraries:", e$message, "\n")
  quit(status = 1)
})

# Logging function
log_message <- function(level, message) {
  timestamp <- format(Sys.time(), "%Y-%m-%d %H:%M:%S")
  cat(sprintf("[%s] %s: %s\n", timestamp, level, message))
}

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

# Function to scrape season data with enhanced error handling
scrape_season_data <- function(season = NULL, sources = NULL, positions = NULL) {
  log_message("INFO", "Starting season data scraping")
  
  if(is.null(season)) season <- get_current_season()
  if(is.null(sources)) sources <- c("CBS", "ESPN", "FantasyPros", "FantasySharks", "FFToday", "NumberFire", "NFL")
  if(is.null(positions)) positions <- c("QB", "RB", "WR", "TE", "K", "DST")
  
  log_message("INFO", sprintf("Scraping season data for season %d", season))
  log_message("INFO", sprintf("Sources: %s", paste(sources, collapse = ", ")))
  log_message("INFO", sprintf("Positions: %s", paste(positions, collapse = ", ")))
  
  # Validate inputs
  if(season < 2000 || season > as.numeric(format(Sys.Date(), "%Y")) + 1) {
    error_msg <- sprintf("Invalid season: %d", season)
    log_message("ERROR", error_msg)
    return(list(success = FALSE, error = error_msg, data = NULL))
  }
  
  tryCatch({
    log_message("INFO", "Initiating season data scraping from sources")
    
    # Scrape season data (week = 0) with timeout handling
    scraped_data_raw <- tryCatch({
      scrape_data(src = sources, pos = positions, season = season, week = 0)
    }, error = function(e) {
      log_message("ERROR", sprintf("Failed to scrape season data: %s", e$message))
      return(NULL)
    })
    
    if(is.null(scraped_data_raw) || length(scraped_data_raw) == 0) {
      error_msg <- "No season data scraped from any sources"
      log_message("ERROR", error_msg)
      return(list(success = FALSE, error = error_msg, data = NULL))
    }
    
    # Convert list of position data frames to single data frame
    scraped_data <- do.call(rbind, scraped_data_raw)
    
    if(is.null(scraped_data) || nrow(scraped_data) == 0) {
      error_msg <- "No season data scraped from any sources after combining"
      log_message("ERROR", error_msg)
      return(list(success = FALSE, error = error_msg, data = NULL))
    }
    
    log_message("INFO", sprintf("Successfully scraped %d raw season records", nrow(scraped_data)))
    
    # Create season projections manually (bypassing projections_table issues)
    log_message("INFO", "Creating season projections from scraped data")
    projections <- tryCatch({
      scraped_data %>%
        dplyr::select(
          player = player,
          pos = pos,
          team = team,
          points = site_pts,
          # Include additional available columns
          games = games,
          pass_att = pass_att,
          pass_comp = pass_comp,
          pass_yds = pass_yds,
          pass_tds = pass_tds,
          pass_int = pass_int,
          rush_att = rush_att,
          rush_yds = rush_yds,
          rush_tds = rush_tds,
          fumbles_lost = fumbles_lost,
          data_src = data_src,
          src_id = src_id
        ) %>%
        dplyr::mutate(
          points = as.numeric(points),
          games = as.numeric(games),
          pass_att = as.numeric(pass_att),
          pass_comp = as.numeric(pass_comp),
          pass_yds = as.numeric(pass_yds),
          pass_tds = as.numeric(pass_tds),
          pass_int = as.numeric(pass_int),
          rush_att = as.numeric(rush_att),
          rush_yds = as.numeric(rush_yds),
          rush_tds = as.numeric(rush_tds),
          fumbles_lost = as.numeric(fumbles_lost)
        ) %>%
        dplyr::arrange(desc(points))
    }, error = function(e) {
      log_message("ERROR", sprintf("Failed to create season projections: %s", e$message))
      return(NULL)
    })
    
    if(is.null(projections) || nrow(projections) == 0) {
      error_msg <- "Failed to generate season projections from scraped data"
      log_message("ERROR", error_msg)
      return(list(success = FALSE, error = error_msg, data = NULL))
    }
    
    # Add basic analytics data for season projections
    log_message("INFO", "Adding comprehensive season analytics data")
    
    projections <- tryCatch({
      projections %>%
        dplyr::mutate(
          # Add basic ranking based on points
          season_rank = row_number(desc(points)),
          position_rank = ave(points, pos, FUN = function(x) rank(-x, ties.method = "min")),
          # Add basic trend score based on points (simplified)
          trend_score = pmax(0, pmin(100, (points / max(points, na.rm = TRUE)) * 100)),
          # Add basic consistency rating (placeholder for season)
          consistency_rating = 0.80,
          # Use points as ceiling/floor estimates (wider range for season)
          ceiling_score = points * 1.3,
          floor_score = points * 0.7,
          # Add metadata
          season = season,
          scraped_at = Sys.time()
        )
    }, error = function(e) {
      log_message("WARN", sprintf("Failed to add season analytics data: %s", e$message))
      projections
    })
    
    log_message("INFO", sprintf("Successfully processed %d season player projections", nrow(projections)))
    
    # Validate final data
    if(is.null(projections) || nrow(projections) == 0) {
      error_msg <- "No valid season projections generated"
      log_message("ERROR", error_msg)
      return(list(success = FALSE, error = error_msg, data = NULL))
    }
    
    # Check for essential columns
    required_cols <- c("player", "pos", "team", "points")
    available_cols <- names(projections)
    missing_cols <- setdiff(required_cols, available_cols)
    if(length(missing_cols) > 0) {
      error_msg <- sprintf("Missing required columns: %s. Available: %s", 
                          paste(missing_cols, collapse = ", "),
                          paste(available_cols, collapse = ", "))
      log_message("ERROR", error_msg)
      return(list(success = FALSE, error = error_msg, data = NULL))
    }
    
    log_message("INFO", "Season data scraping completed successfully")
    
    return(list(
      success = TRUE,
      data = projections,
      season = season,
      sources = sources,
      positions = positions,
      scraped_count = nrow(scraped_data),
      processed_count = nrow(projections),
      timestamp = Sys.time()
    ))
    
  }, error = function(e) {
    error_msg <- sprintf("Unexpected error during season scraping: %s", e$message)
    log_message("ERROR", error_msg)
    return(list(success = FALSE, error = error_msg, data = NULL))
  })
}

# Main execution when script is called directly
if (!interactive()) {
  # Parse command line arguments
  args <- commandArgs(trailingOnly = TRUE)
  
  season <- NULL
  sources <- NULL
  positions <- NULL
  
  # Parse arguments
  for (i in seq_along(args)) {
    if (args[i] == "--season" && i < length(args)) {
      season <- as.numeric(args[i + 1])
    } else if (args[i] == "--sources" && i < length(args)) {
      sources <- strsplit(args[i + 1], ",")[[1]]
    } else if (args[i] == "--positions" && i < length(args)) {
      positions <- strsplit(args[i + 1], ",")[[1]]
    }
  }
  
  # Execute scraping
  result <- scrape_season_data(season, sources, positions)
  
  # Output JSON result
  cat(toJSON(result, auto_unbox = TRUE, pretty = TRUE))
}