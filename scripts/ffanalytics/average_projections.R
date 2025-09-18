#!/usr/bin/env Rscript

# Averages projections from multiple sources (ESPN, FantasyPros, CBS)
library(jsonlite)
library(dplyr)

# Function to match players across sources using fuzzy matching
match_players <- function(player_name, position, team, all_players) {
  # Exact match first
  exact_matches <- all_players[
    all_players$player == player_name & 
    all_players$pos == position, 
  ]
  
  if(nrow(exact_matches) > 0) {
    return(exact_matches)
  }
  
  # Fuzzy match on name and position
  name_matches <- all_players[
    all_players$pos == position &
    grepl(gsub("[^A-Za-z]", "", player_name), gsub("[^A-Za-z]", "", all_players$player), ignore.case = TRUE),
  ]
  
  if(nrow(name_matches) > 0) {
    return(name_matches)
  }
  
  # Return empty if no matches
  return(data.frame())
}

# Function to average projections from multiple sources
average_projections <- function(espn_data = NULL, fantasypros_data = NULL, cbs_data = NULL) {
  cat("Averaging projections from available sources\n")
  
  # Combine all available data
  all_data <- list()
  sources_used <- c()
  
  if(!is.null(espn_data) && nrow(espn_data) > 0) {
    all_data[["ESPN"]] <- espn_data
    sources_used <- c(sources_used, "ESPN")
    cat("- ESPN data:", nrow(espn_data), "players\n")
  }
  
  if(!is.null(fantasypros_data) && nrow(fantasypros_data) > 0) {
    all_data[["FantasyPros"]] <- fantasypros_data
    sources_used <- c(sources_used, "FantasyPros")
    cat("- FantasyPros data:", nrow(fantasypros_data), "players\n")
  }
  
  if(!is.null(cbs_data) && nrow(cbs_data) > 0) {
    all_data[["CBS"]] <- cbs_data
    sources_used <- c(sources_used, "CBS")
    cat("- CBS data:", nrow(cbs_data), "players\n")
  }
  
  if(length(all_data) == 0) {
    cat("No data available to average\n")
    return(list(success = FALSE, error = "No data available", data = NULL))
  }
  
  # Get all unique players across all sources
  all_players <- do.call(rbind, all_data)
  unique_players <- unique(all_players[, c("player", "pos", "team")])
  
  cat("Found", nrow(unique_players), "unique players across all sources\n")
  
  # Calculate averages for each unique player
  averaged_data <- data.frame()
  
  for(i in 1:nrow(unique_players)) {
    player_name <- unique_players$player[i]
    position <- unique_players$pos[i]
    team <- unique_players$team[i]
    
    # Find this player in all sources
    player_data <- list()
    for(source in names(all_data)) {
      source_data <- all_data[[source]]
      player_matches <- source_data[
        source_data$player == player_name & 
        source_data$pos == position,
      ]
      
      if(nrow(player_matches) > 0) {
        player_data[[source]] <- player_matches[1, ]  # Take first match
      }
    }
    
    if(length(player_data) > 0) {
      # Calculate averages
      points_values <- sapply(player_data, function(x) as.numeric(x$points))
      points_values <- points_values[!is.na(points_values)]
      
      avg_points <- if(length(points_values) > 0) mean(points_values) else NA
      
      # Create averaged record
      avg_record <- data.frame(
        player = player_name,
        pos = position,
        team = team,
        points_avg = round(avg_points, 2),
        sources_count = length(player_data),
        sources_used = paste(names(player_data), collapse = ","),
        stringsAsFactors = FALSE
      )
      
      averaged_data <- rbind(averaged_data, avg_record)
    }
  }
  
  # Sort by position and points
  averaged_data <- averaged_data[order(averaged_data$pos, -averaged_data$points_avg), ]
  
  cat("Successfully averaged", nrow(averaged_data), "player projections\n")
  
  return(list(
    success = TRUE,
    data = averaged_data,
    sources_used = sources_used,
    total_players = nrow(averaged_data)
  ))
}

# Main execution when script is called directly
if (!interactive()) {
  # Read JSON input from command line arguments (file paths)
  args <- commandArgs(trailingOnly = TRUE)
  
  espn_data <- NULL
  fantasypros_data <- NULL
  cbs_data <- NULL
  
  # Parse file arguments
  for (i in seq_along(args)) {
    if (args[i] == "--espn" && i < length(args) && file.exists(args[i + 1])) {
      espn_result <- fromJSON(args[i + 1])
      if(espn_result$success && !is.null(espn_result$data)) {
        espn_data <- espn_result$data
      }
    } else if (args[i] == "--fantasypros" && i < length(args) && file.exists(args[i + 1])) {
      fp_result <- fromJSON(args[i + 1])
      if(fp_result$success && !is.null(fp_result$data)) {
        fantasypros_data <- fp_result$data
      }
    } else if (args[i] == "--cbs" && i < length(args) && file.exists(args[i + 1])) {
      cbs_result <- fromJSON(args[i + 1])
      if(cbs_result$success && !is.null(cbs_result$data)) {
        cbs_data <- cbs_result$data
      }
    }
  }
  
  # Execute averaging
  result <- average_projections(espn_data, fantasypros_data, cbs_data)
  
  # Output JSON result
  cat(toJSON(result, auto_unbox = TRUE, pretty = TRUE))
}