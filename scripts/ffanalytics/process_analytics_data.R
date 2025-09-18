#!/usr/bin/env Rscript

# Processes raw ffanalytics data into structured format
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
  group_by <- dplyr::group_by
  summarise <- dplyr::summarise
}, error = function(e) {
  cat("ERROR: Failed to load required libraries:", e$message, "\n")
  quit(status = 1)
})

# Logging function
log_message <- function(level, message) {
  timestamp <- format(Sys.time(), "%Y-%m-%d %H:%M:%S")
  cat(sprintf("[%s] %s: %s\n", timestamp, level, message))
}

# Function to calculate trend score based on ECR and uncertainty
calculate_trend_score <- function(ecr_avg, uncertainty) {
  tryCatch({
    # Lower ECR (better rank) and lower uncertainty = higher trend score
    # Normalize to 0-100 scale
    if(is.na(ecr_avg) || is.na(uncertainty)) return(0)
    
    # Handle edge cases
    if(is.infinite(ecr_avg) || is.infinite(uncertainty)) return(0)
    if(ecr_avg < 0 || uncertainty < 0) return(0)
    
    # Invert ECR so lower rank = higher score, cap at reasonable values
    ecr_score <- pmax(0, 100 - pmin(ecr_avg, 100))
    
    # Invert uncertainty so lower uncertainty = higher score
    uncertainty_score <- pmax(0, 100 - pmin(uncertainty, 100))
    
    # Weighted combination (70% ECR, 30% uncertainty)
    trend_score <- (ecr_score * 0.7) + (uncertainty_score * 0.3)
    
    return(round(trend_score, 2))
  }, error = function(e) {
    log_message("WARN", sprintf("Error calculating trend score for ECR: %s, Uncertainty: %s - %s", 
                               ecr_avg, uncertainty, e$message))
    return(0)
  })
}

# Function to safely convert and validate numeric values
safe_numeric <- function(x, default = 0) {
  tryCatch({
    result <- as.numeric(x)
    if(is.na(result) || is.infinite(result)) return(default)
    return(result)
  }, error = function(e) {
    return(default)
  })
}

# Function to safely convert and validate integer values
safe_integer <- function(x, default = 0) {
  tryCatch({
    result <- as.integer(x)
    if(is.na(result) || is.infinite(result)) return(default)
    return(result)
  }, error = function(e) {
    return(default)
  })
}

# Function to process projections data with enhanced error handling
process_projections <- function(projections_data) {
  log_message("INFO", "Starting projections data processing")
  
  if(is.null(projections_data)) {
    error_msg <- "Input data is NULL"
    log_message("ERROR", error_msg)
    return(list(success = FALSE, error = error_msg, data = NULL))
  }
  
  if(!is.data.frame(projections_data)) {
    error_msg <- "Input data is not a data frame"
    log_message("ERROR", error_msg)
    return(list(success = FALSE, error = error_msg, data = NULL))
  }
  
  if(nrow(projections_data) == 0) {
    error_msg <- "Input data frame is empty"
    log_message("ERROR", error_msg)
    return(list(success = FALSE, error = error_msg, data = NULL))
  }
  
  log_message("INFO", sprintf("Processing %d player projections", nrow(projections_data)))
  
  tryCatch({
    # Check for required columns
    required_cols <- c("player", "pos", "points")
    available_cols <- names(projections_data)
    missing_required <- setdiff(required_cols, available_cols)
    
    if(length(missing_required) > 0) {
      error_msg <- sprintf("Missing required columns: %s", paste(missing_required, collapse = ", "))
      log_message("ERROR", error_msg)
      return(list(success = FALSE, error = error_msg, data = NULL))
    }
    
    log_message("INFO", sprintf("Available columns: %s", paste(available_cols, collapse = ", ")))
    
    # Convert to structured format for database storage with safe column selection
    processed <- projections_data %>%
      mutate(
        # Ensure required columns exist with safe defaults
        player_name = ifelse("player" %in% names(.), player, NA_character_),
        position = ifelse("pos" %in% names(.), pos, NA_character_),
        team = ifelse("team" %in% names(.), team, NA_character_),
        points_avg = ifelse("points" %in% names(.), points, NA_real_),
        points_robust = ifelse("points_robust" %in% names(.), points_robust, 
                              ifelse("points" %in% names(.), points, NA_real_)),
        points_weighted = ifelse("points_weighted" %in% names(.), points_weighted, 
                                ifelse("points" %in% names(.), points, NA_real_)),
        ecr_avg = ifelse("ecr" %in% names(.), ecr, NA_real_),
        ecr_sd = ifelse("ecr_sd" %in% names(.), ecr_sd, NA_real_),
        adp_avg = ifelse("adp" %in% names(.), adp, NA_real_),
        uncertainty = ifelse("uncertainty" %in% names(.), uncertainty, NA_real_),
        ceiling = ifelse("ceiling" %in% names(.), ceiling, NA_real_),
        floor = ifelse("floor" %in% names(.), floor, NA_real_),
        tier = ifelse("tier" %in% names(.), tier, NA_real_),
        vor = ifelse("vor" %in% names(.), vor, NA_real_)
      ) %>%
      select(player_name, position, team, points_avg, points_robust, points_weighted,
             ecr_avg, ecr_sd, adp_avg, uncertainty, ceiling, floor, tier, vor) %>%
      mutate(
        # Calculate derived metrics with safe functions
        trend_score = mapply(calculate_trend_score, ecr_avg, uncertainty),
        consistency_rating = ifelse(is.na(uncertainty), 0, 
                                   pmax(0, pmin(1, 1 - (safe_numeric(uncertainty) / 100)))),
        ceiling_score = ifelse(is.na(ceiling), safe_numeric(points_avg), safe_numeric(ceiling)),
        floor_score = ifelse(is.na(floor), safe_numeric(points_avg), safe_numeric(floor)),
        
        # Clean up data types with safe conversions
        points_avg = round(safe_numeric(points_avg), 2),
        points_robust = round(safe_numeric(points_robust), 2),
        points_weighted = round(safe_numeric(points_weighted), 2),
        ecr_avg = safe_integer(ecr_avg),
        adp_avg = round(safe_numeric(adp_avg), 1),
        uncertainty = round(safe_numeric(uncertainty), 2),
        ceiling_score = round(ceiling_score, 2),
        floor_score = round(floor_score, 2),
        consistency_rating = round(consistency_rating, 2),
        
        # Clean up text fields
        player_name = trimws(as.character(player_name)),
        position = trimws(toupper(as.character(position))),
        team = trimws(toupper(as.character(team)))
      ) %>%
      # Remove rows with missing essential data
      filter(
        !is.na(player_name), 
        !is.na(position), 
        !is.na(points_avg),
        player_name != "",
        position != "",
        points_avg >= 0
      )
    
    if(nrow(processed) == 0) {
      error_msg <- "No valid records after processing and filtering"
      log_message("ERROR", error_msg)
      return(list(success = FALSE, error = error_msg, data = NULL))
    }
    
    # Data quality checks
    log_message("INFO", "Performing data quality checks")
    
    # Check for duplicate players
    duplicates <- processed %>%
      group_by(player_name, position, team) %>%
      summarise(count = n(), .groups = "drop") %>%
      filter(count > 1)
    
    if(nrow(duplicates) > 0) {
      log_message("WARN", sprintf("Found %d duplicate player records", nrow(duplicates)))
      # Remove duplicates, keeping first occurrence
      processed <- processed %>%
        distinct(player_name, position, team, .keep_all = TRUE)
    }
    
    # Validate position values
    valid_positions <- c("QB", "RB", "WR", "TE", "K", "DST", "DEF")
    invalid_positions <- processed %>%
      filter(!position %in% valid_positions) %>%
      distinct(position) %>%
      pull(position)
    
    if(length(invalid_positions) > 0) {
      log_message("WARN", sprintf("Found invalid positions: %s", paste(invalid_positions, collapse = ", ")))
    }
    
    # Summary statistics
    position_counts <- processed %>%
      count(position, sort = TRUE)
    
    log_message("INFO", sprintf("Position breakdown: %s", 
                               paste(sprintf("%s: %d", position_counts$position, position_counts$n), 
                                     collapse = ", ")))
    
    log_message("INFO", sprintf("Successfully processed %d player records", nrow(processed)))
    
    return(list(
      success = TRUE,
      data = processed,
      processed_count = nrow(processed),
      original_count = nrow(projections_data),
      position_breakdown = position_counts,
      timestamp = Sys.time()
    ))
    
  }, error = function(e) {
    error_msg <- sprintf("Error processing projections data: %s", e$message)
    log_message("ERROR", error_msg)
    return(list(success = FALSE, error = error_msg, data = NULL))
  })
}

# Main execution when script is called directly
if (!interactive()) {
  # Read JSON input from stdin or file
  args <- commandArgs(trailingOnly = TRUE)
  
  if (length(args) > 0 && file.exists(args[1])) {
    # Read from file
    input_data <- fromJSON(args[1])
  } else {
    # Read from stdin
    input_json <- paste(readLines(file("stdin")), collapse = "\n")
    input_data <- fromJSON(input_json)
  }
  
  # Process the data
  result <- process_projections(input_data)
  
  # Output JSON result
  cat(toJSON(result, auto_unbox = TRUE, pretty = TRUE))
}