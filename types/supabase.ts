// Generated from the live schema of Supabase project kvcnijyyfylxfarrlxkv.
// Regenerate with:  npm run db:types
// Do not edit by hand.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      award_votes: {
        Row: {
          award_id: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string | null
          vote_value: string
        }
        Insert: {
          award_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
          vote_value: string
        }
        Update: {
          award_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
          vote_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "award_votes_award_id_fkey"
            columns: ["award_id"]
            isOneToOne: false
            referencedRelation: "awards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_votes_award_id_fkey"
            columns: ["award_id"]
            isOneToOne: false
            referencedRelation: "awards_2025"
            referencedColumns: ["id"]
          },
        ]
      }
      awards: {
        Row: {
          award_type: string | null
          awarded_at: string | null
          category: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          season_id: string | null
          source: string
          title: string
          updated_at: string | null
          value: number | null
          value_label: string | null
          voting_options: Json | null
          winner_franchise_id: string | null
          winner_id: string | null
          winner_info: string | null
          winner_team_id: string | null
        }
        Insert: {
          award_type?: string | null
          awarded_at?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          season_id?: string | null
          source?: string
          title: string
          updated_at?: string | null
          value?: number | null
          value_label?: string | null
          voting_options?: Json | null
          winner_franchise_id?: string | null
          winner_id?: string | null
          winner_info?: string | null
          winner_team_id?: string | null
        }
        Update: {
          award_type?: string | null
          awarded_at?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          season_id?: string | null
          source?: string
          title?: string
          updated_at?: string | null
          value?: number | null
          value_label?: string | null
          voting_options?: Json | null
          winner_franchise_id?: string | null
          winner_id?: string | null
          winner_info?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_2025_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_2025_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_winner_franchise_id_fkey"
            columns: ["winner_franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_winner_franchise_id_fkey"
            columns: ["winner_franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "awards_winner_franchise_id_fkey"
            columns: ["winner_franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "awards_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "awards_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
        ]
      }
      awards_metadata: {
        Row: {
          created_at: string | null
          deadline: string | null
          results_released: boolean | null
          season_id: string
          updated_at: string | null
          voting_open_to_all: boolean | null
        }
        Insert: {
          created_at?: string | null
          deadline?: string | null
          results_released?: boolean | null
          season_id: string
          updated_at?: string | null
          voting_open_to_all?: boolean | null
        }
        Update: {
          created_at?: string | null
          deadline?: string | null
          results_released?: boolean | null
          season_id?: string
          updated_at?: string | null
          voting_open_to_all?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_metadata_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_metadata_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          created_at: string | null
          display_order: number
          id: number
          name: string
          season_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: number
          name?: string
          season_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: number
          name?: string
          season_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "divisions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      espn_matchups: {
        Row: {
          away_espn_team_id: number
          away_owner_id: string | null
          away_owner_name: string | null
          away_projected_score: number | null
          away_score: number | null
          away_team_id: string | null
          away_team_name: string
          created_at: string | null
          espn_matchup_id: number
          espn_raw_data: Json | null
          home_espn_team_id: number
          home_owner_id: string | null
          home_owner_name: string | null
          home_projected_score: number | null
          home_score: number | null
          home_team_id: string | null
          home_team_name: string
          id: string
          import_id: string
          is_playoff: boolean | null
          playoff_round: string | null
          playoff_tier_type: string | null
          scoring_period_id: number | null
          status: string | null
          tiebreaker: Json | null
          user_id: string | null
          week: number
          winner: string | null
        }
        Insert: {
          away_espn_team_id: number
          away_owner_id?: string | null
          away_owner_name?: string | null
          away_projected_score?: number | null
          away_score?: number | null
          away_team_id?: string | null
          away_team_name: string
          created_at?: string | null
          espn_matchup_id: number
          espn_raw_data?: Json | null
          home_espn_team_id: number
          home_owner_id?: string | null
          home_owner_name?: string | null
          home_projected_score?: number | null
          home_score?: number | null
          home_team_id?: string | null
          home_team_name: string
          id?: string
          import_id: string
          is_playoff?: boolean | null
          playoff_round?: string | null
          playoff_tier_type?: string | null
          scoring_period_id?: number | null
          status?: string | null
          tiebreaker?: Json | null
          user_id?: string | null
          week: number
          winner?: string | null
        }
        Update: {
          away_espn_team_id?: number
          away_owner_id?: string | null
          away_owner_name?: string | null
          away_projected_score?: number | null
          away_score?: number | null
          away_team_id?: string | null
          away_team_name?: string
          created_at?: string | null
          espn_matchup_id?: number
          espn_raw_data?: Json | null
          home_espn_team_id?: number
          home_owner_id?: string | null
          home_owner_name?: string | null
          home_projected_score?: number | null
          home_score?: number | null
          home_team_id?: string | null
          home_team_name?: string
          id?: string
          import_id?: string
          is_playoff?: boolean | null
          playoff_round?: string | null
          playoff_tier_type?: string | null
          scoring_period_id?: number | null
          status?: string | null
          tiebreaker?: Json | null
          user_id?: string | null
          week?: number
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "espn_matchups_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "espn_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "espn_matchups_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "espn_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "espn_matchups_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "espn_schedule_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      espn_schedule_imports: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_season_id: string | null
          assignment_notes: string | null
          assignment_status: string | null
          espn_league_id: string
          id: string
          import_source: string | null
          imported_at: string | null
          league_name: string | null
          playoff_matchups: number | null
          raw_data: Json | null
          regular_season_matchups: number | null
          season_year: number
          team_count: number | null
          total_matchups: number | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_season_id?: string | null
          assignment_notes?: string | null
          assignment_status?: string | null
          espn_league_id: string
          id?: string
          import_source?: string | null
          imported_at?: string | null
          league_name?: string | null
          playoff_matchups?: number | null
          raw_data?: Json | null
          regular_season_matchups?: number | null
          season_year: number
          team_count?: number | null
          total_matchups?: number | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_season_id?: string | null
          assignment_notes?: string | null
          assignment_status?: string | null
          espn_league_id?: string
          id?: string
          import_source?: string | null
          imported_at?: string | null
          league_name?: string | null
          playoff_matchups?: number | null
          raw_data?: Json | null
          regular_season_matchups?: number | null
          season_year?: number
          team_count?: number | null
          total_matchups?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "espn_schedule_imports_assigned_season_id_fkey"
            columns: ["assigned_season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "espn_schedule_imports_assigned_season_id_fkey"
            columns: ["assigned_season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      espn_teams: {
        Row: {
          abbreviation: string | null
          created_at: string | null
          espn_team_id: number
          id: string
          import_id: string
          location: string | null
          nickname: string | null
          owner_id: string | null
          owner_name: string | null
          owners: Json | null
          record: Json | null
          team_name: string
          user_id: string | null
        }
        Insert: {
          abbreviation?: string | null
          created_at?: string | null
          espn_team_id: number
          id?: string
          import_id: string
          location?: string | null
          nickname?: string | null
          owner_id?: string | null
          owner_name?: string | null
          owners?: Json | null
          record?: Json | null
          team_name: string
          user_id?: string | null
        }
        Update: {
          abbreviation?: string | null
          created_at?: string | null
          espn_team_id?: number
          id?: string
          import_id?: string
          location?: string | null
          nickname?: string | null
          owner_id?: string | null
          owner_name?: string | null
          owners?: Json | null
          record?: Json | null
          team_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "espn_teams_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "espn_schedule_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_records: {
        Row: {
          created_at: string | null
          franchise_id: string
          game_id: string | null
          id: string
          is_current_record: boolean | null
          notes: string | null
          previous_record_holder_id: string | null
          previous_record_value: number | null
          record_category: string
          record_name: string
          record_type: string
          season_id: string | null
          set_date: string
          value: number
          value_label: string | null
          week: number | null
        }
        Insert: {
          created_at?: string | null
          franchise_id: string
          game_id?: string | null
          id?: string
          is_current_record?: boolean | null
          notes?: string | null
          previous_record_holder_id?: string | null
          previous_record_value?: number | null
          record_category: string
          record_name: string
          record_type: string
          season_id?: string | null
          set_date: string
          value: number
          value_label?: string | null
          week?: number | null
        }
        Update: {
          created_at?: string | null
          franchise_id?: string
          game_id?: string | null
          id?: string
          is_current_record?: boolean | null
          notes?: string | null
          previous_record_holder_id?: string | null
          previous_record_value?: number | null
          record_category?: string
          record_name?: string
          record_type?: string
          season_id?: string | null
          set_date?: string
          value?: number
          value_label?: string | null
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_records_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_records_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "franchise_records_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "franchise_records_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "historical_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_records_previous_record_holder_id_fkey"
            columns: ["previous_record_holder_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_records_previous_record_holder_id_fkey"
            columns: ["previous_record_holder_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "franchise_records_previous_record_holder_id_fkey"
            columns: ["previous_record_holder_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "franchise_records_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "historical_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_records_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "mv_season_leaderboards"
            referencedColumns: ["season_id"]
          },
        ]
      }
      games: {
        Row: {
          completed_at: string | null
          created_at: string | null
          espn_matchup_id: number | null
          espn_scoring_period_id: number | null
          id: string
          is_blowout: boolean | null
          is_close: boolean | null
          is_completed: boolean | null
          is_tie: boolean | null
          is_upset: boolean | null
          loser_team_id: string | null
          point_differential: number | null
          season_id: string
          slot: number | null
          team1_id: string
          team1_score: number | null
          team2_id: string | null
          team2_score: number | null
          type: string | null
          user_id: string | null
          week: number
          winner_team_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          espn_matchup_id?: number | null
          espn_scoring_period_id?: number | null
          id?: string
          is_blowout?: boolean | null
          is_close?: boolean | null
          is_completed?: boolean | null
          is_tie?: boolean | null
          is_upset?: boolean | null
          loser_team_id?: string | null
          point_differential?: number | null
          season_id: string
          slot?: number | null
          team1_id: string
          team1_score?: number | null
          team2_id?: string | null
          team2_score?: number | null
          type?: string | null
          user_id?: string | null
          week: number
          winner_team_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          espn_matchup_id?: number | null
          espn_scoring_period_id?: number | null
          id?: string
          is_blowout?: boolean | null
          is_close?: boolean | null
          is_completed?: boolean | null
          is_tie?: boolean | null
          is_upset?: boolean | null
          loser_team_id?: string | null
          point_differential?: number | null
          season_id?: string
          slot?: number | null
          team1_id?: string
          team1_score?: number | null
          team2_id?: string | null
          team2_score?: number | null
          type?: string | null
          user_id?: string | null
          week?: number
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_loser_team_id_fkey"
            columns: ["loser_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "games_loser_team_id_fkey"
            columns: ["loser_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_loser_team_id_fkey"
            columns: ["loser_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "games_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "games_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "games_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "games_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "games_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
        ]
      }
      head_to_head_records: {
        Row: {
          current_streak_franchise_id: string | null
          current_streak_length: number | null
          franchise1_avg_points: number | null
          franchise1_id: string
          franchise1_total_points: number | null
          franchise1_wins: number | null
          franchise2_avg_points: number | null
          franchise2_id: string
          franchise2_total_points: number | null
          franchise2_wins: number | null
          highest_scoring_game_id: string | null
          id: string
          largest_margin_game_id: string | null
          last_calculated: string | null
          longest_streak_franchise_id: string | null
          longest_streak_length: number | null
          playoff_franchise1_wins: number | null
          playoff_franchise2_wins: number | null
          playoff_matchups: number | null
          regular_season_franchise1_wins: number | null
          regular_season_franchise2_wins: number | null
          regular_season_matchups: number | null
          ties: number | null
          total_matchups: number | null
        }
        Insert: {
          current_streak_franchise_id?: string | null
          current_streak_length?: number | null
          franchise1_avg_points?: number | null
          franchise1_id: string
          franchise1_total_points?: number | null
          franchise1_wins?: number | null
          franchise2_avg_points?: number | null
          franchise2_id: string
          franchise2_total_points?: number | null
          franchise2_wins?: number | null
          highest_scoring_game_id?: string | null
          id?: string
          largest_margin_game_id?: string | null
          last_calculated?: string | null
          longest_streak_franchise_id?: string | null
          longest_streak_length?: number | null
          playoff_franchise1_wins?: number | null
          playoff_franchise2_wins?: number | null
          playoff_matchups?: number | null
          regular_season_franchise1_wins?: number | null
          regular_season_franchise2_wins?: number | null
          regular_season_matchups?: number | null
          ties?: number | null
          total_matchups?: number | null
        }
        Update: {
          current_streak_franchise_id?: string | null
          current_streak_length?: number | null
          franchise1_avg_points?: number | null
          franchise1_id?: string
          franchise1_total_points?: number | null
          franchise1_wins?: number | null
          franchise2_avg_points?: number | null
          franchise2_id?: string
          franchise2_total_points?: number | null
          franchise2_wins?: number | null
          highest_scoring_game_id?: string | null
          id?: string
          largest_margin_game_id?: string | null
          last_calculated?: string | null
          longest_streak_franchise_id?: string | null
          longest_streak_length?: number | null
          playoff_franchise1_wins?: number | null
          playoff_franchise2_wins?: number | null
          playoff_matchups?: number | null
          regular_season_franchise1_wins?: number | null
          regular_season_franchise2_wins?: number | null
          regular_season_matchups?: number | null
          ties?: number | null
          total_matchups?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "head_to_head_records_current_streak_franchise_id_fkey"
            columns: ["current_streak_franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "head_to_head_records_current_streak_franchise_id_fkey"
            columns: ["current_streak_franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "head_to_head_records_current_streak_franchise_id_fkey"
            columns: ["current_streak_franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "head_to_head_records_franchise1_id_fkey"
            columns: ["franchise1_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "head_to_head_records_franchise1_id_fkey"
            columns: ["franchise1_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "head_to_head_records_franchise1_id_fkey"
            columns: ["franchise1_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "head_to_head_records_franchise2_id_fkey"
            columns: ["franchise2_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "head_to_head_records_franchise2_id_fkey"
            columns: ["franchise2_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "head_to_head_records_franchise2_id_fkey"
            columns: ["franchise2_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "head_to_head_records_highest_scoring_game_id_fkey"
            columns: ["highest_scoring_game_id"]
            isOneToOne: false
            referencedRelation: "historical_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "head_to_head_records_largest_margin_game_id_fkey"
            columns: ["largest_margin_game_id"]
            isOneToOne: false
            referencedRelation: "historical_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "head_to_head_records_longest_streak_franchise_id_fkey"
            columns: ["longest_streak_franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "head_to_head_records_longest_streak_franchise_id_fkey"
            columns: ["longest_streak_franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "head_to_head_records_longest_streak_franchise_id_fkey"
            columns: ["longest_streak_franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
        ]
      }
      historical_games: {
        Row: {
          completed_at: string | null
          created_at: string | null
          espn_matchup_id: number | null
          espn_scoring_period_id: number | null
          id: string
          is_blowout: boolean | null
          is_close: boolean | null
          is_completed: boolean | null
          is_tie: boolean | null
          is_upset: boolean | null
          loser_team_id: string | null
          point_differential: number | null
          season_id: string
          team1_id: string
          team1_score: number | null
          team2_id: string
          team2_score: number | null
          type: string | null
          week: number
          winner_team_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          espn_matchup_id?: number | null
          espn_scoring_period_id?: number | null
          id?: string
          is_blowout?: boolean | null
          is_close?: boolean | null
          is_completed?: boolean | null
          is_tie?: boolean | null
          is_upset?: boolean | null
          loser_team_id?: string | null
          point_differential?: number | null
          season_id: string
          team1_id: string
          team1_score?: number | null
          team2_id: string
          team2_score?: number | null
          type?: string | null
          week: number
          winner_team_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          espn_matchup_id?: number | null
          espn_scoring_period_id?: number | null
          id?: string
          is_blowout?: boolean | null
          is_close?: boolean | null
          is_completed?: boolean | null
          is_tie?: boolean | null
          is_upset?: boolean | null
          loser_team_id?: string | null
          point_differential?: number | null
          season_id?: string
          team1_id?: string
          team1_score?: number | null
          team2_id?: string
          team2_score?: number | null
          type?: string | null
          week?: number
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_games_loser_team_id_fkey"
            columns: ["loser_team_id"]
            isOneToOne: false
            referencedRelation: "historical_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "historical_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "mv_season_leaderboards"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "historical_games_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "historical_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_games_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "historical_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_games_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "historical_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_rosters: {
        Row: {
          acquisition_cost: number | null
          acquisition_type: string | null
          acquisition_week: number | null
          added_date: string | null
          created_at: string | null
          draft_pick: number | null
          draft_round: number | null
          dropped_date: string | null
          espn_player_id: number | null
          games_started: number | null
          id: string
          is_keeper: boolean | null
          player_name: string
          position: string | null
          pro_team: string | null
          season_id: string
          team_id: string
          total_points: number | null
        }
        Insert: {
          acquisition_cost?: number | null
          acquisition_type?: string | null
          acquisition_week?: number | null
          added_date?: string | null
          created_at?: string | null
          draft_pick?: number | null
          draft_round?: number | null
          dropped_date?: string | null
          espn_player_id?: number | null
          games_started?: number | null
          id?: string
          is_keeper?: boolean | null
          player_name: string
          position?: string | null
          pro_team?: string | null
          season_id: string
          team_id: string
          total_points?: number | null
        }
        Update: {
          acquisition_cost?: number | null
          acquisition_type?: string | null
          acquisition_week?: number | null
          added_date?: string | null
          created_at?: string | null
          draft_pick?: number | null
          draft_round?: number | null
          dropped_date?: string | null
          espn_player_id?: number | null
          games_started?: number | null
          id?: string
          is_keeper?: boolean | null
          player_name?: string
          position?: string | null
          pro_team?: string | null
          season_id?: string
          team_id?: string
          total_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_rosters_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "historical_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_rosters_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "mv_season_leaderboards"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "historical_rosters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "historical_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_seasons: {
        Row: {
          created_at: string | null
          data_quality_notes: string | null
          espn_import_date: string | null
          espn_league_id: string | null
          id: string
          imported_from_espn: boolean | null
          league_size: number
          name: string
          playoff_bracket: Json | null
          playoff_weeks: number
          regular_season_weeks: number
          scoring_type: string | null
          stats: Json | null
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          data_quality_notes?: string | null
          espn_import_date?: string | null
          espn_league_id?: string | null
          id?: string
          imported_from_espn?: boolean | null
          league_size?: number
          name: string
          playoff_bracket?: Json | null
          playoff_weeks?: number
          regular_season_weeks?: number
          scoring_type?: string | null
          stats?: Json | null
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          data_quality_notes?: string | null
          espn_import_date?: string | null
          espn_league_id?: string | null
          id?: string
          imported_from_espn?: boolean | null
          league_size?: number
          name?: string
          playoff_bracket?: Json | null
          playoff_weeks?: number
          regular_season_weeks?: number
          scoring_type?: string | null
          stats?: Json | null
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      historical_teams: {
        Row: {
          average_points_per_game: number | null
          created_at: string | null
          division_name: string | null
          draft_picks: Json | null
          espn_team_id: number | null
          final_rank: number | null
          franchise_id: string
          id: string
          made_playoffs: boolean | null
          playoff_finish: string | null
          playoff_losses: number | null
          playoff_seed: number | null
          playoff_wins: number | null
          point_differential: number | null
          points_against: number | null
          points_for: number | null
          power_rating: number | null
          regular_season_losses: number | null
          regular_season_ties: number | null
          regular_season_win_percentage: number | null
          regular_season_wins: number | null
          season_id: string
          season_stats: Json | null
          strength_of_schedule: number | null
          team_name: string
          updated_at: string | null
        }
        Insert: {
          average_points_per_game?: number | null
          created_at?: string | null
          division_name?: string | null
          draft_picks?: Json | null
          espn_team_id?: number | null
          final_rank?: number | null
          franchise_id: string
          id?: string
          made_playoffs?: boolean | null
          playoff_finish?: string | null
          playoff_losses?: number | null
          playoff_seed?: number | null
          playoff_wins?: number | null
          point_differential?: number | null
          points_against?: number | null
          points_for?: number | null
          power_rating?: number | null
          regular_season_losses?: number | null
          regular_season_ties?: number | null
          regular_season_win_percentage?: number | null
          regular_season_wins?: number | null
          season_id: string
          season_stats?: Json | null
          strength_of_schedule?: number | null
          team_name: string
          updated_at?: string | null
        }
        Update: {
          average_points_per_game?: number | null
          created_at?: string | null
          division_name?: string | null
          draft_picks?: Json | null
          espn_team_id?: number | null
          final_rank?: number | null
          franchise_id?: string
          id?: string
          made_playoffs?: boolean | null
          playoff_finish?: string | null
          playoff_losses?: number | null
          playoff_seed?: number | null
          playoff_wins?: number | null
          point_differential?: number | null
          points_against?: number | null
          points_for?: number | null
          power_rating?: number | null
          regular_season_losses?: number | null
          regular_season_ties?: number | null
          regular_season_win_percentage?: number | null
          regular_season_wins?: number | null
          season_id?: string
          season_stats?: Json | null
          strength_of_schedule?: number | null
          team_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "historical_teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "historical_teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "historical_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "mv_season_leaderboards"
            referencedColumns: ["season_id"]
          },
        ]
      }
      league_franchises: {
        Row: {
          career_win_percentage: number | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean | null
          joined_year: number
          left_year: number | null
          notes: string | null
          owner_name: string
          total_championships: number | null
          total_playoff_appearances: number | null
          total_points_against: number | null
          total_points_for: number | null
          total_regular_season_losses: number | null
          total_regular_season_wins: number | null
          total_seasons: number | null
          updated_at: string | null
        }
        Insert: {
          career_win_percentage?: number | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          joined_year: number
          left_year?: number | null
          notes?: string | null
          owner_name: string
          total_championships?: number | null
          total_playoff_appearances?: number | null
          total_points_against?: number | null
          total_points_for?: number | null
          total_regular_season_losses?: number | null
          total_regular_season_wins?: number | null
          total_seasons?: number | null
          updated_at?: string | null
        }
        Update: {
          career_win_percentage?: number | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          joined_year?: number
          left_year?: number | null
          notes?: string | null
          owner_name?: string
          total_championships?: number | null
          total_playoff_appearances?: number | null
          total_points_against?: number | null
          total_points_for?: number | null
          total_regular_season_losses?: number | null
          total_regular_season_wins?: number | null
          total_seasons?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      nfl_week_calendar: {
        Row: {
          created_at: string | null
          id: string
          is_playoff_week: boolean | null
          season_year: number
          snapshot_trigger_time: string
          week_end_date: string
          week_number: number
          week_start_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_playoff_week?: boolean | null
          season_year: number
          snapshot_trigger_time: string
          week_end_date: string
          week_number: number
          week_start_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_playoff_week?: boolean | null
          season_year?: number
          snapshot_trigger_time?: string
          week_end_date?: string
          week_number?: number
          week_start_date?: string
        }
        Relationships: []
      }
      pick_em_results: {
        Row: {
          actual_winner_team_id: string | null
          calculated_at: string | null
          id: string
          is_correct: boolean
          pick_em_week_id: string
          points_earned: number | null
          submission_id: string
          user_id: string
        }
        Insert: {
          actual_winner_team_id?: string | null
          calculated_at?: string | null
          id?: string
          is_correct: boolean
          pick_em_week_id: string
          points_earned?: number | null
          submission_id: string
          user_id?: string
        }
        Update: {
          actual_winner_team_id?: string | null
          calculated_at?: string | null
          id?: string
          is_correct?: boolean
          pick_em_week_id?: string
          points_earned?: number | null
          submission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pick_em_results_actual_winner_team_id_fkey"
            columns: ["actual_winner_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "pick_em_results_actual_winner_team_id_fkey"
            columns: ["actual_winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_em_results_actual_winner_team_id_fkey"
            columns: ["actual_winner_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "pick_em_results_pick_em_week_id_fkey"
            columns: ["pick_em_week_id"]
            isOneToOne: false
            referencedRelation: "pick_em_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_em_results_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "pick_em_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_em_season_standings: {
        Row: {
          current_streak: number | null
          id: string
          last_updated: string | null
          longest_streak: number | null
          overall_accuracy_percentage: number | null
          perfect_weeks: number | null
          season_id: string
          season_rank: number | null
          total_correct_picks: number | null
          total_picks: number | null
          total_points: number | null
          total_weeks_participated: number | null
          user_id: string
        }
        Insert: {
          current_streak?: number | null
          id?: string
          last_updated?: string | null
          longest_streak?: number | null
          overall_accuracy_percentage?: number | null
          perfect_weeks?: number | null
          season_id: string
          season_rank?: number | null
          total_correct_picks?: number | null
          total_picks?: number | null
          total_points?: number | null
          total_weeks_participated?: number | null
          user_id?: string
        }
        Update: {
          current_streak?: number | null
          id?: string
          last_updated?: string | null
          longest_streak?: number | null
          overall_accuracy_percentage?: number | null
          perfect_weeks?: number | null
          season_id?: string
          season_rank?: number | null
          total_correct_picks?: number | null
          total_picks?: number | null
          total_points?: number | null
          total_weeks_participated?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pick_em_season_standings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_em_season_standings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_em_submissions: {
        Row: {
          confidence_level: number | null
          game_id: string
          id: string
          pick_em_week_id: string
          predicted_winner_team_id: string
          submitted_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_level?: number | null
          game_id: string
          id?: string
          pick_em_week_id: string
          predicted_winner_team_id: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          confidence_level?: number | null
          game_id?: string
          id?: string
          pick_em_week_id?: string
          predicted_winner_team_id?: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pick_em_submissions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_em_submissions_pick_em_week_id_fkey"
            columns: ["pick_em_week_id"]
            isOneToOne: false
            referencedRelation: "pick_em_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_em_submissions_predicted_winner_team_id_fkey"
            columns: ["predicted_winner_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "pick_em_submissions_predicted_winner_team_id_fkey"
            columns: ["predicted_winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_em_submissions_predicted_winner_team_id_fkey"
            columns: ["predicted_winner_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
        ]
      }
      pick_em_submissions_backup: {
        Row: {
          backup_created_at: string
          backup_metadata: Json | null
          confidence_level: number | null
          game_id: string
          id: string
          operation_type: string
          original_record_id: string | null
          pick_em_week_id: string
          predicted_winner_team_id: string
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          backup_created_at?: string
          backup_metadata?: Json | null
          confidence_level?: number | null
          game_id: string
          id?: string
          operation_type?: string
          original_record_id?: string | null
          pick_em_week_id: string
          predicted_winner_team_id: string
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          backup_created_at?: string
          backup_metadata?: Json | null
          confidence_level?: number | null
          game_id?: string
          id?: string
          operation_type?: string
          original_record_id?: string | null
          pick_em_week_id?: string
          predicted_winner_team_id?: string
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pick_em_weekly_scores: {
        Row: {
          accuracy_percentage: number | null
          calculated_at: string | null
          correct_picks: number | null
          id: string
          pick_em_week_id: string
          total_picks: number | null
          total_points: number | null
          user_id: string
          weekly_rank: number | null
        }
        Insert: {
          accuracy_percentage?: number | null
          calculated_at?: string | null
          correct_picks?: number | null
          id?: string
          pick_em_week_id: string
          total_picks?: number | null
          total_points?: number | null
          user_id?: string
          weekly_rank?: number | null
        }
        Update: {
          accuracy_percentage?: number | null
          calculated_at?: string | null
          correct_picks?: number | null
          id?: string
          pick_em_week_id?: string
          total_picks?: number | null
          total_points?: number | null
          user_id?: string
          weekly_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pick_em_weekly_scores_pick_em_week_id_fkey"
            columns: ["pick_em_week_id"]
            isOneToOne: false
            referencedRelation: "pick_em_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_em_weeks: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_closed: boolean | null
          is_completed: boolean | null
          results_reveal_at: string
          season_id: string
          submission_closes_at: string
          submission_opens_at: string
          updated_at: string | null
          user_id: string
          week_number: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_closed?: boolean | null
          is_completed?: boolean | null
          results_reveal_at: string
          season_id: string
          submission_closes_at: string
          submission_opens_at: string
          updated_at?: string | null
          user_id?: string
          week_number: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_closed?: boolean | null
          is_completed?: boolean | null
          results_reveal_at?: string
          season_id?: string
          submission_closes_at?: string
          submission_opens_at?: string
          updated_at?: string | null
          user_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "pick_em_weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_em_weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          actual_points: number | null
          average_points_per_game: number | null
          ceiling_score: number | null
          consistency_rating: number | null
          created_at: string | null
          espn_data: Json | null
          espn_last_updated: string | null
          espn_player_id: number | null
          ffanalytics_data: Json | null
          ffanalytics_last_sync: string | null
          ffanalytics_player_id: string | null
          floor_score: number | null
          games_played: number | null
          id: string
          injury_status: string | null
          is_active: boolean | null
          jersey_number: number | null
          last_stats_sync: string | null
          name: string
          percent_owned: number | null
          percent_started: number | null
          position: string
          position_rank: number | null
          pro_team_id: number | null
          pro_team_name: string | null
          projected_average: number | null
          projected_points: number | null
          season_actual_points: number | null
          season_projected_points: number | null
          team_abbreviation: string | null
          trend_score: number | null
          updated_at: string | null
          weekly_rank: number | null
        }
        Insert: {
          actual_points?: number | null
          average_points_per_game?: number | null
          ceiling_score?: number | null
          consistency_rating?: number | null
          created_at?: string | null
          espn_data?: Json | null
          espn_last_updated?: string | null
          espn_player_id?: number | null
          ffanalytics_data?: Json | null
          ffanalytics_last_sync?: string | null
          ffanalytics_player_id?: string | null
          floor_score?: number | null
          games_played?: number | null
          id?: string
          injury_status?: string | null
          is_active?: boolean | null
          jersey_number?: number | null
          last_stats_sync?: string | null
          name: string
          percent_owned?: number | null
          percent_started?: number | null
          position: string
          position_rank?: number | null
          pro_team_id?: number | null
          pro_team_name?: string | null
          projected_average?: number | null
          projected_points?: number | null
          season_actual_points?: number | null
          season_projected_points?: number | null
          team_abbreviation?: string | null
          trend_score?: number | null
          updated_at?: string | null
          weekly_rank?: number | null
        }
        Update: {
          actual_points?: number | null
          average_points_per_game?: number | null
          ceiling_score?: number | null
          consistency_rating?: number | null
          created_at?: string | null
          espn_data?: Json | null
          espn_last_updated?: string | null
          espn_player_id?: number | null
          ffanalytics_data?: Json | null
          ffanalytics_last_sync?: string | null
          ffanalytics_player_id?: string | null
          floor_score?: number | null
          games_played?: number | null
          id?: string
          injury_status?: string | null
          is_active?: boolean | null
          jersey_number?: number | null
          last_stats_sync?: string | null
          name?: string
          percent_owned?: number | null
          percent_started?: number | null
          position?: string
          position_rank?: number | null
          pro_team_id?: number | null
          pro_team_name?: string | null
          projected_average?: number | null
          projected_points?: number | null
          season_actual_points?: number | null
          season_projected_points?: number | null
          team_abbreviation?: string | null
          trend_score?: number | null
          updated_at?: string | null
          weekly_rank?: number | null
        }
        Relationships: []
      }
      playoff_config: {
        Row: {
          bracket_data: Json | null
          created_at: string | null
          id: string
          results_released: boolean | null
          season_id: string
          submission_deadline: string
          updated_at: string | null
        }
        Insert: {
          bracket_data?: Json | null
          created_at?: string | null
          id?: string
          results_released?: boolean | null
          season_id: string
          submission_deadline?: string
          updated_at?: string | null
        }
        Update: {
          bracket_data?: Json | null
          created_at?: string | null
          id?: string
          results_released?: boolean | null
          season_id?: string
          submission_deadline?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playoffs_2025_config_season_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoffs_2025_config_season_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      playoff_picks: {
        Row: {
          actual_winner_team_id: string | null
          championship_point_total: number | null
          game_id: string | null
          id: string
          is_correct: boolean | null
          matchup_id: string
          points_earned: number | null
          predicted_winner_team_id: string
          season_id: string
          submitted_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          actual_winner_team_id?: string | null
          championship_point_total?: number | null
          game_id?: string | null
          id?: string
          is_correct?: boolean | null
          matchup_id: string
          points_earned?: number | null
          predicted_winner_team_id: string
          season_id: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          actual_winner_team_id?: string | null
          championship_point_total?: number | null
          game_id?: string | null
          id?: string
          is_correct?: boolean | null
          matchup_id?: string
          points_earned?: number | null
          predicted_winner_team_id?: string
          season_id?: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playoffs_2025_actual_winner_fkey"
            columns: ["actual_winner_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "playoffs_2025_actual_winner_fkey"
            columns: ["actual_winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoffs_2025_actual_winner_fkey"
            columns: ["actual_winner_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "playoffs_2025_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoffs_2025_predicted_winner_fkey"
            columns: ["predicted_winner_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "playoffs_2025_predicted_winner_fkey"
            columns: ["predicted_winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoffs_2025_predicted_winner_fkey"
            columns: ["predicted_winner_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "playoffs_2025_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoffs_2025_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      power_rankings_history: {
        Row: {
          all_play_win_pct: number | null
          clutch_score: number | null
          consistency_score: number | null
          created_at: string | null
          id: string
          injury_score: number | null
          losses: number | null
          momentum_score: number | null
          performance_score: number | null
          point_differential: number | null
          points_against: number | null
          points_for: number | null
          power_rating: number
          rank: number
          season_id: string
          snapshot_type: string | null
          strength_of_schedule: number | null
          team_id: string
          team_strength: number | null
          ties: number | null
          user_id: string | null
          week_number: number
          win_percentage: number | null
          wins: number | null
        }
        Insert: {
          all_play_win_pct?: number | null
          clutch_score?: number | null
          consistency_score?: number | null
          created_at?: string | null
          id?: string
          injury_score?: number | null
          losses?: number | null
          momentum_score?: number | null
          performance_score?: number | null
          point_differential?: number | null
          points_against?: number | null
          points_for?: number | null
          power_rating: number
          rank: number
          season_id: string
          snapshot_type?: string | null
          strength_of_schedule?: number | null
          team_id: string
          team_strength?: number | null
          ties?: number | null
          user_id?: string | null
          week_number: number
          win_percentage?: number | null
          wins?: number | null
        }
        Update: {
          all_play_win_pct?: number | null
          clutch_score?: number | null
          consistency_score?: number | null
          created_at?: string | null
          id?: string
          injury_score?: number | null
          losses?: number | null
          momentum_score?: number | null
          performance_score?: number | null
          point_differential?: number | null
          points_against?: number | null
          points_for?: number | null
          power_rating?: number
          rank?: number
          season_id?: string
          snapshot_type?: string | null
          strength_of_schedule?: number | null
          team_id?: string
          team_strength?: number | null
          ties?: number | null
          user_id?: string | null
          week_number?: number
          win_percentage?: number | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "power_rankings_history_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_rankings_history_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_rankings_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "power_rankings_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_rankings_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
        ]
      }
      roster_history: {
        Row: {
          created_at: string | null
          espn_transaction_id: string | null
          faab_bid: number | null
          id: string
          notes: string | null
          player_id: string
          season_id: string
          team_id: string
          trade_id: string | null
          trade_partner_team_id: string | null
          transaction_date: string | null
          transaction_type: string
          transaction_week: number
          user_id: string
          waiver_priority: number | null
        }
        Insert: {
          created_at?: string | null
          espn_transaction_id?: string | null
          faab_bid?: number | null
          id?: string
          notes?: string | null
          player_id: string
          season_id: string
          team_id: string
          trade_id?: string | null
          trade_partner_team_id?: string | null
          transaction_date?: string | null
          transaction_type: string
          transaction_week: number
          user_id?: string
          waiver_priority?: number | null
        }
        Update: {
          created_at?: string | null
          espn_transaction_id?: string | null
          faab_bid?: number | null
          id?: string
          notes?: string | null
          player_id?: string
          season_id?: string
          team_id?: string
          trade_id?: string | null
          trade_partner_team_id?: string | null
          transaction_date?: string | null
          transaction_type?: string
          transaction_week?: number
          user_id?: string
          waiver_priority?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_history_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_history_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "roster_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "roster_history_trade_partner_team_id_fkey"
            columns: ["trade_partner_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "roster_history_trade_partner_team_id_fkey"
            columns: ["trade_partner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_history_trade_partner_team_id_fkey"
            columns: ["trade_partner_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
        ]
      }
      rosters: {
        Row: {
          acquisition_type: string | null
          acquisition_week: number | null
          added_date: string | null
          cost: number | null
          created_at: string | null
          id: string
          is_keeper: boolean | null
          keeper_round: number | null
          player_id: string
          points_when_rostered: number | null
          projected_when_rostered: number | null
          roster_slot: string | null
          team_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          acquisition_type?: string | null
          acquisition_week?: number | null
          added_date?: string | null
          cost?: number | null
          created_at?: string | null
          id?: string
          is_keeper?: boolean | null
          keeper_round?: number | null
          player_id: string
          points_when_rostered?: number | null
          projected_when_rostered?: number | null
          roster_slot?: string | null
          team_id: string
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          acquisition_type?: string | null
          acquisition_week?: number | null
          added_date?: string | null
          cost?: number | null
          created_at?: string | null
          id?: string
          is_keeper?: boolean | null
          keeper_round?: number | null
          player_id?: string
          points_when_rostered?: number | null
          projected_when_rostered?: number | null
          roster_slot?: string | null
          team_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rosters_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rosters_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rosters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "rosters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rosters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
        ]
      }
      season_awards: {
        Row: {
          award_category: string
          award_name: string
          award_type: string
          awarded_date: string | null
          created_at: string | null
          description: string | null
          franchise_id: string
          id: string
          notes: string | null
          season_id: string
          team_id: string | null
          value: number | null
          value_label: string | null
        }
        Insert: {
          award_category: string
          award_name: string
          award_type: string
          awarded_date?: string | null
          created_at?: string | null
          description?: string | null
          franchise_id: string
          id?: string
          notes?: string | null
          season_id: string
          team_id?: string | null
          value?: number | null
          value_label?: string | null
        }
        Update: {
          award_category?: string
          award_name?: string
          award_type?: string
          awarded_date?: string | null
          created_at?: string | null
          description?: string | null
          franchise_id?: string
          id?: string
          notes?: string | null
          season_id?: string
          team_id?: string | null
          value?: number | null
          value_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_awards_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_awards_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "season_awards_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "season_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "historical_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "mv_season_leaderboards"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "season_awards_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "historical_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          awards_release_at: string | null
          completed_at: string | null
          created_at: string | null
          espn_league_id: string | null
          espn_season_year: number | null
          id: string
          is_active: boolean
          is_completed: boolean
          league_size: number
          name: string
          pickem_close_offset_days: number
          pickem_close_time: string
          pickem_open_offset_days: number
          pickem_open_time: string
          pickem_reveal_offset_days: number
          pickem_reveal_time: string
          playoff_bracket: Json | null
          playoff_weeks: number
          regular_season_weeks: number
          scoring_type: string | null
          start_date: string | null
          stats: Json | null
          status: string | null
          timezone: string
          total_weeks: number | null
          user_id: string | null
          year: number
        }
        Insert: {
          awards_release_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          espn_league_id?: string | null
          espn_season_year?: number | null
          id?: string
          is_active?: boolean
          is_completed?: boolean
          league_size?: number
          name?: string
          pickem_close_offset_days?: number
          pickem_close_time?: string
          pickem_open_offset_days?: number
          pickem_open_time?: string
          pickem_reveal_offset_days?: number
          pickem_reveal_time?: string
          playoff_bracket?: Json | null
          playoff_weeks?: number
          regular_season_weeks?: number
          scoring_type?: string | null
          start_date?: string | null
          stats?: Json | null
          status?: string | null
          timezone?: string
          total_weeks?: number | null
          user_id?: string | null
          year: number
        }
        Update: {
          awards_release_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          espn_league_id?: string | null
          espn_season_year?: number | null
          id?: string
          is_active?: boolean
          is_completed?: boolean
          league_size?: number
          name?: string
          pickem_close_offset_days?: number
          pickem_close_time?: string
          pickem_open_offset_days?: number
          pickem_open_time?: string
          pickem_reveal_offset_days?: number
          pickem_reveal_time?: string
          playoff_bracket?: Json | null
          playoff_weeks?: number
          regular_season_weeks?: number
          scoring_type?: string | null
          start_date?: string | null
          stats?: Json | null
          status?: string | null
          timezone?: string
          total_weeks?: number | null
          user_id?: string | null
          year?: number
        }
        Relationships: []
      }
      team_analytics_summary: {
        Row: {
          analytics_strength_score: number | null
          avg_consistency_rating: number | null
          avg_player_rank: number | null
          avg_uncertainty: number | null
          calculated_at: string | null
          created_at: string | null
          id: string
          season_year: number
          team_id: string
          total_ceiling_score: number | null
          total_floor_score: number | null
          total_projected_points: number | null
          trending_down_players: number | null
          trending_up_players: number | null
          updated_at: string | null
          week: number
        }
        Insert: {
          analytics_strength_score?: number | null
          avg_consistency_rating?: number | null
          avg_player_rank?: number | null
          avg_uncertainty?: number | null
          calculated_at?: string | null
          created_at?: string | null
          id?: string
          season_year: number
          team_id: string
          total_ceiling_score?: number | null
          total_floor_score?: number | null
          total_projected_points?: number | null
          trending_down_players?: number | null
          trending_up_players?: number | null
          updated_at?: string | null
          week: number
        }
        Update: {
          analytics_strength_score?: number | null
          avg_consistency_rating?: number | null
          avg_player_rank?: number | null
          avg_uncertainty?: number | null
          calculated_at?: string | null
          created_at?: string | null
          id?: string
          season_year?: number
          team_id?: string
          total_ceiling_score?: number | null
          total_floor_score?: number | null
          total_projected_points?: number | null
          trending_down_players?: number | null
          trending_up_players?: number | null
          updated_at?: string | null
          week?: number
        }
        Relationships: []
      }
      teams: {
        Row: {
          average_points_against: number | null
          average_points_for: number | null
          bad_losses: number | null
          bench_actual_points: number | null
          bench_projected_points: number | null
          blowout_wins: number | null
          close_losses: number | null
          close_wins: number | null
          created_at: string | null
          current_streak: Json | null
          division_id: number | null
          draft_picks: Json | null
          espn_team_id: number | null
          final_rank: number | null
          franchise_id: string | null
          id: string
          last_roster_sync: string | null
          losses: number | null
          made_playoffs: boolean | null
          name: string
          opponent_win_percentage: number | null
          owner: string | null
          playoff_finish: string | null
          playoff_losses: number | null
          playoff_seed: number | null
          playoff_wins: number | null
          point_differential: number | null
          points_against: number | null
          points_for: number | null
          position_strengths: Json | null
          power_rating: number | null
          previous_rank: number | null
          quality_wins: number | null
          rank_change: number | null
          recent_form: number | null
          roster: Json | null
          roster_total_actual_points: number | null
          roster_total_projected_points: number | null
          season_id: string
          season_stats: Json | null
          starter_actual_points: number | null
          starter_projected_points: number | null
          strength_of_schedule: number | null
          ties: number | null
          updated_at: string | null
          user_id: string | null
          win_percentage: number | null
          wins: number | null
        }
        Insert: {
          average_points_against?: number | null
          average_points_for?: number | null
          bad_losses?: number | null
          bench_actual_points?: number | null
          bench_projected_points?: number | null
          blowout_wins?: number | null
          close_losses?: number | null
          close_wins?: number | null
          created_at?: string | null
          current_streak?: Json | null
          division_id?: number | null
          draft_picks?: Json | null
          espn_team_id?: number | null
          final_rank?: number | null
          franchise_id?: string | null
          id?: string
          last_roster_sync?: string | null
          losses?: number | null
          made_playoffs?: boolean | null
          name: string
          opponent_win_percentage?: number | null
          owner?: string | null
          playoff_finish?: string | null
          playoff_losses?: number | null
          playoff_seed?: number | null
          playoff_wins?: number | null
          point_differential?: number | null
          points_against?: number | null
          points_for?: number | null
          position_strengths?: Json | null
          power_rating?: number | null
          previous_rank?: number | null
          quality_wins?: number | null
          rank_change?: number | null
          recent_form?: number | null
          roster?: Json | null
          roster_total_actual_points?: number | null
          roster_total_projected_points?: number | null
          season_id: string
          season_stats?: Json | null
          starter_actual_points?: number | null
          starter_projected_points?: number | null
          strength_of_schedule?: number | null
          ties?: number | null
          updated_at?: string | null
          user_id?: string | null
          win_percentage?: number | null
          wins?: number | null
        }
        Update: {
          average_points_against?: number | null
          average_points_for?: number | null
          bad_losses?: number | null
          bench_actual_points?: number | null
          bench_projected_points?: number | null
          blowout_wins?: number | null
          close_losses?: number | null
          close_wins?: number | null
          created_at?: string | null
          current_streak?: Json | null
          division_id?: number | null
          draft_picks?: Json | null
          espn_team_id?: number | null
          final_rank?: number | null
          franchise_id?: string | null
          id?: string
          last_roster_sync?: string | null
          losses?: number | null
          made_playoffs?: boolean | null
          name?: string
          opponent_win_percentage?: number | null
          owner?: string | null
          playoff_finish?: string | null
          playoff_losses?: number | null
          playoff_seed?: number | null
          playoff_wins?: number | null
          point_differential?: number | null
          points_against?: number | null
          points_for?: number | null
          position_strengths?: Json | null
          power_rating?: number | null
          previous_rank?: number | null
          quality_wins?: number | null
          rank_change?: number | null
          recent_form?: number | null
          roster?: Json | null
          roster_total_actual_points?: number | null
          roster_total_projected_points?: number | null
          season_id?: string
          season_stats?: Json | null
          starter_actual_points?: number | null
          starter_projected_points?: number | null
          strength_of_schedule?: number | null
          ties?: number | null
          updated_at?: string | null
          user_id?: string | null
          win_percentage?: number | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          created_at: string | null
          drops: number | null
          espn_team_id: number | null
          faab_spent: number | null
          franchise_id: string
          free_agent_adds: number | null
          id: string
          last_synced_at: string | null
          owner_name: string
          season_id: string
          team_id: string | null
          total_transactions: number | null
          trades: number | null
          updated_at: string | null
          waiver_claims: number | null
        }
        Insert: {
          created_at?: string | null
          drops?: number | null
          espn_team_id?: number | null
          faab_spent?: number | null
          franchise_id: string
          free_agent_adds?: number | null
          id?: string
          last_synced_at?: string | null
          owner_name: string
          season_id: string
          team_id?: string | null
          total_transactions?: number | null
          trades?: number | null
          updated_at?: string | null
          waiver_claims?: number | null
        }
        Update: {
          created_at?: string | null
          drops?: number | null
          espn_team_id?: number | null
          faab_spent?: number | null
          franchise_id?: string
          free_agent_adds?: number | null
          id?: string
          last_synced_at?: string | null
          owner_name?: string
          season_id?: string
          team_id?: string | null
          total_transactions?: number | null
          trades?: number | null
          updated_at?: string | null
          waiver_claims?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_transactions_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_transactions_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "team_transactions_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "transactions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
        ]
      }
      transactions_2025_legacy: {
        Row: {
          created_at: string | null
          drops: number | null
          espn_team_id: number | null
          faab_spent: number | null
          free_agent_adds: number | null
          id: string
          last_synced_at: string | null
          owner_name: string
          team_id: string
          trades: number | null
          updated_at: string | null
          waiver_claims: number | null
        }
        Insert: {
          created_at?: string | null
          drops?: number | null
          espn_team_id?: number | null
          faab_spent?: number | null
          free_agent_adds?: number | null
          id?: string
          last_synced_at?: string | null
          owner_name: string
          team_id: string
          trades?: number | null
          updated_at?: string | null
          waiver_claims?: number | null
        }
        Update: {
          created_at?: string | null
          drops?: number | null
          espn_team_id?: number | null
          faab_spent?: number | null
          free_agent_adds?: number | null
          id?: string
          last_synced_at?: string | null
          owner_name?: string
          team_id?: string
          trades?: number | null
          updated_at?: string | null
          waiver_claims?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_2025_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "transactions_2025_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_2025_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
        ]
      }
      weekly_lineups: {
        Row: {
          created_at: string | null
          dst_id: string | null
          flex_id: string | null
          id: string
          is_optimal: boolean | null
          k_id: string | null
          lineup_json: Json | null
          projected_points: number | null
          qb_id: string | null
          rb1_id: string | null
          rb2_id: string | null
          season_id: string
          submitted_at: string | null
          te_id: string | null
          team_id: string
          total_points: number | null
          updated_at: string | null
          user_id: string
          week: number
          wr1_id: string | null
          wr2_id: string | null
        }
        Insert: {
          created_at?: string | null
          dst_id?: string | null
          flex_id?: string | null
          id?: string
          is_optimal?: boolean | null
          k_id?: string | null
          lineup_json?: Json | null
          projected_points?: number | null
          qb_id?: string | null
          rb1_id?: string | null
          rb2_id?: string | null
          season_id: string
          submitted_at?: string | null
          te_id?: string | null
          team_id: string
          total_points?: number | null
          updated_at?: string | null
          user_id?: string
          week: number
          wr1_id?: string | null
          wr2_id?: string | null
        }
        Update: {
          created_at?: string | null
          dst_id?: string | null
          flex_id?: string | null
          id?: string
          is_optimal?: boolean | null
          k_id?: string | null
          lineup_json?: Json | null
          projected_points?: number | null
          qb_id?: string | null
          rb1_id?: string | null
          rb2_id?: string | null
          season_id?: string
          submitted_at?: string | null
          te_id?: string | null
          team_id?: string
          total_points?: number | null
          updated_at?: string | null
          user_id?: string
          week?: number
          wr1_id?: string | null
          wr2_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_lineups_dst_id_fkey"
            columns: ["dst_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_dst_id_fkey"
            columns: ["dst_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_flex_id_fkey"
            columns: ["flex_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_flex_id_fkey"
            columns: ["flex_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_k_id_fkey"
            columns: ["k_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_k_id_fkey"
            columns: ["k_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_qb_id_fkey"
            columns: ["qb_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_qb_id_fkey"
            columns: ["qb_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_rb1_id_fkey"
            columns: ["rb1_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_rb1_id_fkey"
            columns: ["rb1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_rb2_id_fkey"
            columns: ["rb2_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_rb2_id_fkey"
            columns: ["rb2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_te_id_fkey"
            columns: ["te_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_te_id_fkey"
            columns: ["te_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "weekly_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "weekly_lineups_wr1_id_fkey"
            columns: ["wr1_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_wr1_id_fkey"
            columns: ["wr1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_wr2_id_fkey"
            columns: ["wr2_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_lineups_wr2_id_fkey"
            columns: ["wr2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_player_stats: {
        Row: {
          actual_points: number | null
          created_at: string | null
          espn_sync_timestamp: string | null
          fantasy_team_id: string | null
          game_date: string | null
          id: string
          opponent_team: string | null
          percentile_vs_position: number | null
          performance_vs_projection: number | null
          player_id: string
          projected_points: number | null
          season_id: string
          user_id: string
          was_started: boolean | null
          week: number
        }
        Insert: {
          actual_points?: number | null
          created_at?: string | null
          espn_sync_timestamp?: string | null
          fantasy_team_id?: string | null
          game_date?: string | null
          id?: string
          opponent_team?: string | null
          percentile_vs_position?: number | null
          performance_vs_projection?: number | null
          player_id: string
          projected_points?: number | null
          season_id: string
          user_id?: string
          was_started?: boolean | null
          week: number
        }
        Update: {
          actual_points?: number | null
          created_at?: string | null
          espn_sync_timestamp?: string | null
          fantasy_team_id?: string | null
          game_date?: string | null
          id?: string
          opponent_team?: string | null
          percentile_vs_position?: number | null
          performance_vs_projection?: number | null
          player_id?: string
          projected_points?: number | null
          season_id?: string
          user_id?: string
          was_started?: boolean | null
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_player_stats_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "weekly_player_stats_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_player_stats_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "weekly_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "current_player_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_player_stats_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_player_stats_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      weeks: {
        Row: {
          completed_at: string | null
          id: string
          is_completed: boolean | null
          power_rankings: Json | null
          season_id: string
          user_id: string | null
          week_number: number
          weekly_stats: Json | null
        }
        Insert: {
          completed_at?: string | null
          id?: string
          is_completed?: boolean | null
          power_rankings?: Json | null
          season_id: string
          user_id?: string | null
          week_number: number
          weekly_stats?: Json | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          is_completed?: boolean | null
          power_rankings?: Json | null
          season_id?: string
          user_id?: string | null
          week_number?: number
          weekly_stats?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      awards_2025: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string | null
          season_id: string | null
          title: string | null
          updated_at: string | null
          voting_options: Json | null
          winner_id: string | null
          winner_info: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string | null
          season_id?: string | null
          title?: string | null
          updated_at?: string | null
          voting_options?: Json | null
          winner_id?: string | null
          winner_info?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string | null
          season_id?: string | null
          title?: string | null
          updated_at?: string | null
          voting_options?: Json | null
          winner_id?: string | null
          winner_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_2025_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_2025_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      current_player_analytics: {
        Row: {
          ceiling_score: number | null
          consistency_rating: number | null
          ffanalytics_last_sync: string | null
          ffanalytics_player_id: string | null
          floor_score: number | null
          id: string | null
          name: string | null
          position: string | null
          position_rank: number | null
          season_actual_points: number | null
          season_projected_points: number | null
          team_abbreviation: string | null
          trend_score: number | null
          weekly_rank: number | null
        }
        Insert: {
          ceiling_score?: number | null
          consistency_rating?: number | null
          ffanalytics_last_sync?: string | null
          ffanalytics_player_id?: string | null
          floor_score?: number | null
          id?: string | null
          name?: string | null
          position?: string | null
          position_rank?: number | null
          season_actual_points?: number | null
          season_projected_points?: number | null
          team_abbreviation?: string | null
          trend_score?: number | null
          weekly_rank?: number | null
        }
        Update: {
          ceiling_score?: number | null
          consistency_rating?: number | null
          ffanalytics_last_sync?: string | null
          ffanalytics_player_id?: string | null
          floor_score?: number | null
          id?: string | null
          name?: string | null
          position?: string | null
          position_rank?: number | null
          season_actual_points?: number | null
          season_projected_points?: number | null
          team_abbreviation?: string | null
          trend_score?: number | null
          weekly_rank?: number | null
        }
        Relationships: []
      }
      latest_team_analytics: {
        Row: {
          analytics_strength_score: number | null
          avg_consistency_rating: number | null
          avg_player_rank: number | null
          avg_uncertainty: number | null
          calculated_at: string | null
          created_at: string | null
          id: string | null
          season_year: number | null
          team_id: string | null
          total_ceiling_score: number | null
          total_floor_score: number | null
          total_projected_points: number | null
          trending_down_players: number | null
          trending_up_players: number | null
          updated_at: string | null
          week: number | null
        }
        Relationships: []
      }
      mv_franchise_career_stats: {
        Row: {
          avg_final_rank: number | null
          avg_points_per_game: number | null
          avg_win_percentage: number | null
          best_finish: number | null
          calculated_at: string | null
          career_point_differential: number | null
          career_points_against: number | null
          career_points_for: number | null
          championships: number | null
          display_name: string | null
          franchise_id: string | null
          owner_name: string | null
          playoff_appearances: number | null
          runner_ups: number | null
          seasons_played: number | null
          total_losses: number | null
          total_ties: number | null
          total_wins: number | null
          worst_finish: number | null
        }
        Relationships: []
      }
      mv_season_leaderboards: {
        Row: {
          best_record: Json | null
          calculated_at: string | null
          champion: Json | null
          highest_scorer: Json | null
          season_id: string | null
          year: number | null
        }
        Relationships: []
      }
      mv_transaction_leaderboards: {
        Row: {
          avg_transactions_per_season: number | null
          avg_waivers_per_season: number | null
          calculated_at: string | null
          display_name: string | null
          franchise_id: string | null
          least_active_season_transactions: number | null
          most_active_season_transactions: number | null
          owner_name: string | null
          seasons_tracked: number | null
          total_all_transactions: number | null
          total_drops: number | null
          total_faab_spent: number | null
          total_free_agent_adds: number | null
          total_trades: number | null
          total_waiver_claims: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_transactions_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_transactions_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "team_transactions_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
        ]
      }
      playoffs_2025: {
        Row: {
          actual_winner_team_id: string | null
          championship_point_total: number | null
          game_id: string | null
          id: string | null
          is_correct: boolean | null
          matchup_id: string | null
          points_earned: number | null
          predicted_winner_team_id: string | null
          season_id: string | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          actual_winner_team_id?: string | null
          championship_point_total?: number | null
          game_id?: string | null
          id?: string | null
          is_correct?: boolean | null
          matchup_id?: string | null
          points_earned?: number | null
          predicted_winner_team_id?: string | null
          season_id?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          actual_winner_team_id?: string | null
          championship_point_total?: number | null
          game_id?: string | null
          id?: string | null
          is_correct?: boolean | null
          matchup_id?: string | null
          points_earned?: number | null
          predicted_winner_team_id?: string | null
          season_id?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playoffs_2025_actual_winner_fkey"
            columns: ["actual_winner_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "playoffs_2025_actual_winner_fkey"
            columns: ["actual_winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoffs_2025_actual_winner_fkey"
            columns: ["actual_winner_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "playoffs_2025_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoffs_2025_predicted_winner_fkey"
            columns: ["predicted_winner_team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "playoffs_2025_predicted_winner_fkey"
            columns: ["predicted_winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoffs_2025_predicted_winner_fkey"
            columns: ["predicted_winner_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "playoffs_2025_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoffs_2025_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      playoffs_2025_config: {
        Row: {
          bracket_data: Json | null
          created_at: string | null
          id: string | null
          results_released: boolean | null
          season_id: string | null
          submission_deadline: string | null
          updated_at: string | null
        }
        Insert: {
          bracket_data?: Json | null
          created_at?: string | null
          id?: string | null
          results_released?: boolean | null
          season_id?: string | null
          submission_deadline?: string | null
          updated_at?: string | null
        }
        Update: {
          bracket_data?: Json | null
          created_at?: string | null
          id?: string | null
          results_released?: boolean | null
          season_id?: string | null
          submission_deadline?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playoffs_2025_config_season_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoffs_2025_config_season_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_stats: {
        Row: {
          bench_players: number | null
          ir_players: number | null
          last_roster_move: string | null
          season_id: string | null
          starting_players: number | null
          team_id: string | null
          team_name: string | null
          total_players: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      team_transactions: {
        Row: {
          created_at: string | null
          drops: number | null
          espn_team_id: number | null
          faab_spent: number | null
          franchise_id: string | null
          free_agent_adds: number | null
          id: string | null
          last_synced_at: string | null
          owner_name: string | null
          season_id: string | null
          total_transactions: number | null
          trades: number | null
          updated_at: string | null
          waiver_claims: number | null
        }
        Insert: {
          created_at?: string | null
          drops?: number | null
          espn_team_id?: number | null
          faab_spent?: number | null
          franchise_id?: string | null
          free_agent_adds?: number | null
          id?: string | null
          last_synced_at?: string | null
          owner_name?: string | null
          season_id?: string | null
          total_transactions?: number | null
          trades?: number | null
          updated_at?: string | null
          waiver_claims?: number | null
        }
        Update: {
          created_at?: string | null
          drops?: number | null
          espn_team_id?: number | null
          faab_spent?: number | null
          franchise_id?: string | null
          free_agent_adds?: number | null
          id?: string | null
          last_synced_at?: string | null
          owner_name?: string | null
          season_id?: string | null
          total_transactions?: number | null
          trades?: number | null
          updated_at?: string | null
          waiver_claims?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_transactions_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_transactions_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "team_transactions_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions_2025: {
        Row: {
          created_at: string | null
          drops: number | null
          espn_team_id: number | null
          faab_spent: number | null
          free_agent_adds: number | null
          id: string | null
          last_synced_at: string | null
          owner_name: string | null
          team_id: string | null
          trades: number | null
          updated_at: string | null
          waiver_claims: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "roster_stats"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "transactions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_standings"
            referencedColumns: ["team_id"]
          },
        ]
      }
      v_active_season: {
        Row: {
          awards_release_at: string | null
          completed_at: string | null
          created_at: string | null
          current_week: number | null
          espn_league_id: string | null
          espn_season_year: number | null
          id: string | null
          is_active: boolean | null
          is_completed: boolean | null
          league_size: number | null
          name: string | null
          pickem_close_offset_days: number | null
          pickem_close_time: string | null
          pickem_open_offset_days: number | null
          pickem_open_time: string | null
          pickem_reveal_offset_days: number | null
          pickem_reveal_time: string | null
          playoff_bracket: Json | null
          playoff_start_week: number | null
          playoff_weeks: number | null
          regular_season_weeks: number | null
          start_date: string | null
          stats: Json | null
          status: string | null
          timezone: string | null
          total_weeks: number | null
          user_id: string | null
          week_count: number | null
          year: number | null
        }
        Insert: {
          awards_release_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_week?: never
          espn_league_id?: string | null
          espn_season_year?: number | null
          id?: string | null
          is_active?: boolean | null
          is_completed?: boolean | null
          league_size?: number | null
          name?: string | null
          pickem_close_offset_days?: number | null
          pickem_close_time?: string | null
          pickem_open_offset_days?: number | null
          pickem_open_time?: string | null
          pickem_reveal_offset_days?: number | null
          pickem_reveal_time?: string | null
          playoff_bracket?: Json | null
          playoff_start_week?: never
          playoff_weeks?: number | null
          regular_season_weeks?: number | null
          start_date?: string | null
          stats?: Json | null
          status?: string | null
          timezone?: string | null
          total_weeks?: number | null
          user_id?: string | null
          week_count?: never
          year?: number | null
        }
        Update: {
          awards_release_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_week?: never
          espn_league_id?: string | null
          espn_season_year?: number | null
          id?: string | null
          is_active?: boolean | null
          is_completed?: boolean | null
          league_size?: number | null
          name?: string | null
          pickem_close_offset_days?: number | null
          pickem_close_time?: string | null
          pickem_open_offset_days?: number | null
          pickem_open_time?: string | null
          pickem_reveal_offset_days?: number | null
          pickem_reveal_time?: string | null
          playoff_bracket?: Json | null
          playoff_start_week?: never
          playoff_weeks?: number | null
          regular_season_weeks?: number | null
          start_date?: string | null
          stats?: Json | null
          status?: string | null
          timezone?: string | null
          total_weeks?: number | null
          user_id?: string | null
          week_count?: never
          year?: number | null
        }
        Relationships: []
      }
      v_franchise_career: {
        Row: {
          avg_final_rank: number | null
          avg_points_per_game: number | null
          best_finish: number | null
          career_point_differential: number | null
          career_points_against: number | null
          career_points_for: number | null
          career_win_percentage: number | null
          championships: number | null
          display_name: string | null
          first_season: number | null
          franchise_id: string | null
          is_active: boolean | null
          last_season: number | null
          owner_name: string | null
          playoff_appearances: number | null
          runner_ups: number | null
          seasons_played: number | null
          total_losses: number | null
          total_ties: number | null
          total_wins: number | null
          worst_finish: number | null
        }
        Relationships: []
      }
      v_game_results: {
        Row: {
          completed_at: string | null
          game_id: string | null
          is_playoff: boolean | null
          is_regular: boolean | null
          opponent_id: string | null
          points_against: number | null
          points_for: number | null
          result: string | null
          season_id: string | null
          team_id: string | null
          type: string | null
          week: number | null
        }
        Relationships: []
      }
      v_head_to_head: {
        Row: {
          avg_points_against: number | null
          avg_points_for: number | null
          franchise_id: string | null
          highest_score: number | null
          largest_margin: number | null
          losses: number | null
          opponent_franchise_id: string | null
          playoff_matchups: number | null
          playoff_wins: number | null
          regular_season_matchups: number | null
          regular_season_wins: number | null
          ties: number | null
          total_matchups: number | null
          total_points_against: number | null
          total_points_for: number | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["opponent_franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["opponent_franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["opponent_franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
        ]
      }
      v_record_book: {
        Row: {
          franchise_id: string | null
          game_id: string | null
          owner_name: string | null
          record_type: string | null
          scope: string | null
          season_id: string | null
          season_year: number | null
          value: number | null
          value_label: string | null
          week: number | null
        }
        Relationships: []
      }
      v_team_standings: {
        Row: {
          average_points_against: number | null
          average_points_for: number | null
          best_week: number | null
          division_id: number | null
          final_rank: number | null
          franchise_id: string | null
          games_played: number | null
          losses: number | null
          made_playoffs: boolean | null
          owner_name: string | null
          playoff_finish: string | null
          playoff_losses_played: number | null
          playoff_seed: number | null
          playoff_wins_played: number | null
          point_differential: number | null
          points_against: number | null
          points_for: number | null
          season_id: string | null
          season_status: string | null
          season_year: number | null
          streak_length: number | null
          streak_type: string | null
          team_id: string | null
          team_name: string | null
          ties: number | null
          win_percentage: number | null
          wins: number | null
          worst_week: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "league_franchises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "mv_franchise_career_stats"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "teams_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "v_franchise_career"
            referencedColumns: ["franchise_id"]
          },
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_active_season"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_player_to_roster: {
        Args: {
          p_acquisition_type?: string
          p_acquisition_week?: number
          p_cost?: number
          p_player_id: string
          p_roster_slot?: string
          p_team_id: string
        }
        Returns: string
      }
      assign_schedule_to_season: {
        Args: {
          p_assigned_by?: string
          p_import_id: string
          p_notes?: string
          p_season_id: string
        }
        Returns: Json
      }
      calculate_pick_em_results: {
        Args: { p_pick_em_week_id: string }
        Returns: number
      }
      calculate_power_rankings: {
        Args: { season_id: string; week_number?: number }
        Returns: {
          power_rating: number
          rank: number
          team_id: string
          team_name: string
        }[]
      }
      calculate_team_roster_analytics: {
        Args: { team_uuid: string }
        Returns: undefined
      }
      calculate_weekly_pick_em_scores: {
        Args: { p_pick_em_week_id: string }
        Returns: undefined
      }
      check_awards_unlock_status: {
        Args: { season_id_param: string }
        Returns: Json
      }
      cleanup_old_espn_imports: { Args: never; Returns: undefined }
      cleanup_old_power_rankings_snapshots: { Args: never; Returns: number }
      compare_rankings_between_weeks: {
        Args: { season_id: string; week1: number; week2: number }
        Returns: {
          power_rating_change: number
          rank_change: number
          team_id: string
          team_name: string
          week1_power_rating: number
          week1_rank: number
          week2_power_rating: number
          week2_rank: number
        }[]
      }
      create_pick_em_week: {
        Args: {
          p_results_reveal_at?: string
          p_season_id: string
          p_submission_closes_at?: string
          p_submission_opens_at?: string
          p_week_number: number
        }
        Returns: string
      }
      debug_refresh_season_data: {
        Args: { season_id: string }
        Returns: string
      }
      direct_match_test: {
        Args: { p_import_id: string; p_season_id: string }
        Returns: {
          espn_id: number
          espn_owner: string
          matched_owner: string
          matched_season_team: string
          matched_team_id: string
        }[]
      }
      disable_roster_trigger: { Args: never; Returns: undefined }
      drop_player_from_roster: {
        Args: {
          p_player_id: string
          p_team_id: string
          p_transaction_week?: number
        }
        Returns: boolean
      }
      enable_roster_trigger: { Args: never; Returns: undefined }
      execute_trade: {
        Args: {
          p_notes?: string
          p_season_id: string
          p_team1_id: string
          p_team1_players: string[]
          p_team2_id: string
          p_team2_players: string[]
          p_transaction_week: number
        }
        Returns: string
      }
      execute_weekly_snapshot_if_needed: {
        Args: { season_year?: number }
        Returns: Json
      }
      get_available_players: {
        Args: { p_position?: string; p_season_id: string }
        Returns: {
          jersey_number: number
          nfl_team: string
          player_id: string
          player_name: string
          position: string
        }[]
      }
      get_available_snapshot_weeks: {
        Args: { season_id: string }
        Returns: {
          created_at: string
          snapshot_count: number
          week_number: number
        }[]
      }
      get_current_nfl_week: { Args: { season_year?: number }; Returns: number }
      get_franchise_awards: {
        Args: { p_franchise_id: string }
        Returns: {
          award_category: string
          award_name: string
          value_label: string
          year: number
        }[]
      }
      get_franchise_career_stats: {
        Args: { p_franchise_id: string }
        Returns: {
          avg_points_per_game: number
          championships: number
          playoff_appearances: number
          total_losses: number
          total_points: number
          total_seasons: number
          total_wins: number
          win_percentage: number
        }[]
      }
      get_franchise_transaction_history: {
        Args: { p_franchise_id: string }
        Returns: {
          drops: number
          faab_spent: number
          free_agent_adds: number
          total_transactions: number
          trades: number
          waiver_claims: number
          year: number
        }[]
      }
      get_franchise_transaction_totals: {
        Args: never
        Returns: {
          franchise_id: string
          owner_name: string
          seasons_count: number
          total_all_transactions: number
          total_drops: number
          total_faab_spent: number
          total_free_agent_adds: number
          total_trades: number
          total_waiver_claims: number
        }[]
      }
      get_h2h_record: {
        Args: { p_franchise1_id: string; p_franchise2_id: string }
        Returns: {
          franchise1_avg_points: number
          franchise1_wins: number
          franchise2_avg_points: number
          franchise2_wins: number
          ties: number
          total_matchups: number
        }[]
      }
      get_pending_schedule_imports: {
        Args: never
        Returns: {
          assignment_status: string
          espn_league_id: string
          import_id: string
          imported_at: string
          league_name: string
          season_year: number
          team_count: number
          total_matchups: number
        }[]
      }
      get_pick_em_status: {
        Args: { p_season_id: string }
        Returns: {
          can_submit: boolean
          pick_em_week_id: string
          results_available: boolean
          results_reveal_at: string
          status: string
          submission_closes_at: string
          submission_opens_at: string
          week_number: number
        }[]
      }
      get_power_rankings_for_week: {
        Args: { season_id: string; week_number: number }
        Returns: {
          all_play_win_pct: number
          clutch_score: number
          consistency_score: number
          games_played: number
          injury_score: number
          losses: number
          momentum_score: number
          performance_score: number
          point_differential: number
          points_against: number
          points_for: number
          power_rating: number
          previous_rank: number
          rank: number
          rank_change: number
          strength_of_schedule: number
          team_id: string
          team_name: string
          team_owner: string
          team_strength: number
          ties: number
          win_percentage: number
          wins: number
        }[]
      }
      get_roster_transaction_history: {
        Args: { p_limit?: number; p_team_id: string }
        Returns: {
          faab_bid: number
          notes: string
          player_name: string
          position: string
          trade_partner_name: string
          transaction_date: string
          transaction_type: string
          transaction_week: number
        }[]
      }
      get_season_summary: { Args: { season_id: string }; Returns: Json }
      get_snapshot_execution_history: {
        Args: { limit_count?: number; season_id: string }
        Returns: {
          last_created: string
          snapshot_count: number
          snapshot_type: string
          teams_in_snapshot: number
          week_number: number
        }[]
      }
      get_standings_by_division: {
        Args: { season_id_param: string }
        Returns: {
          division_id: number
          division_name: string
          division_rank: number
          losses: number
          owner: string
          playoff_position: boolean
          point_differential: number
          points_against: number
          points_for: number
          streak_length: number
          streak_type: string
          team_id: string
          team_name: string
          ties: number
          win_percentage: number
          wins: number
        }[]
      }
      get_team_roster: {
        Args: { p_team_id: string }
        Returns: {
          acquisition_type: string
          added_date: string
          is_keeper: boolean
          nfl_team: string
          player_id: string
          player_name: string
          position: string
          roster_slot: string
        }[]
      }
      get_user_display_names: {
        Args: { user_ids: string[] }
        Returns: {
          display_name: string
          id: string
        }[]
      }
      get_user_picks_for_week: {
        Args: { p_pick_em_week_id: string; p_user_id?: string }
        Returns: {
          actual_winner_name: string
          actual_winner_team_id: string
          confidence_level: number
          game_id: string
          is_correct: boolean
          points_earned: number
          predicted_winner_name: string
          predicted_winner_team_id: string
          submission_id: string
          submitted_at: string
          team1_name: string
          team2_name: string
          week_number: number
        }[]
      }
      get_users_for_admin: {
        Args: { user_ids: string[] }
        Returns: {
          display_name: string
          email: string
          id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      manual_weekly_snapshot_check: {
        Args: { season_year?: number }
        Returns: Json
      }
      refresh_league_history_views: { Args: never; Returns: undefined }
      refresh_season_stats: { Args: { season_id: string }; Returns: undefined }
      refresh_team_stats: { Args: { team_id: string }; Returns: undefined }
      refresh_transaction_views: { Args: never; Returns: undefined }
      save_enhanced_power_rankings_snapshot: {
        Args: { season_id: string; snapshot_type?: string; week_number: number }
        Returns: number
      }
      save_power_rankings_snapshot: {
        Args: { season_id: string; week_number: number }
        Returns: undefined
      }
      save_weekly_power_rankings_snapshot: {
        Args: {
          p_season_id: string
          p_snapshot_type?: string
          p_week_number: number
        }
        Returns: number
      }
      season_current_week: { Args: { p_season_id: string }; Returns: number }
      season_week_start: {
        Args: { p_season_id: string; p_week: number }
        Returns: string
      }
      should_trigger_weekly_snapshot: {
        Args: { season_year?: number }
        Returns: {
          reason: string
          season_id: string
          should_trigger: boolean
          week_number: number
        }[]
      }
      submit_pick_em_picks: {
        Args: { p_pick_em_week_id: string; p_picks: Json }
        Returns: {
          game_id: string
          status: string
          submission_id: string
        }[]
      }
      submit_playoff_picks: {
        Args: {
          p_championship_point_total?: number
          p_picks: Json
          p_season_id: string
        }
        Returns: Json
      }
      sync_espn_player_stats: {
        Args: {
          actual_pts?: number
          espn_id: number
          games?: number
          injury?: string
          owned_pct?: number
          projected_pts?: number
          season_actual_pts?: number
          season_projected_pts?: number
          started_pct?: number
        }
        Returns: undefined
      }
      sync_player_from_espn: {
        Args: {
          p_espn_data?: Json
          p_espn_player_id: number
          p_jersey_number?: number
          p_name: string
          p_position: string
          p_team_abbreviation?: string
        }
        Returns: string
      }
      sync_team_roster_from_espn: {
        Args: { p_current_week: number; p_roster_data: Json; p_team_id: string }
        Returns: number
      }
      team_standings_as_of: {
        Args: { p_season_id: string; p_through_week: number }
        Returns: {
          games_played: number
          losses: number
          owner_name: string
          point_differential: number
          points_against: number
          points_for: number
          team_id: string
          team_name: string
          ties: number
          win_percentage: number
          wins: number
        }[]
      }
      test_owner_matching: {
        Args: { p_import_id: string; p_season_id: string }
        Returns: {
          espn_owner_clean: string
          espn_owner_raw: string
          espn_team_id: number
          found_team_id: string
          match_result: boolean
          season_owner_clean: string
          season_owner_raw: string
        }[]
      }
      update_game_result: {
        Args: { game_id: string; team1_score: number; team2_score: number }
        Returns: {
          completed_at: string | null
          created_at: string | null
          espn_matchup_id: number | null
          espn_scoring_period_id: number | null
          id: string
          is_blowout: boolean | null
          is_close: boolean | null
          is_completed: boolean | null
          is_tie: boolean | null
          is_upset: boolean | null
          loser_team_id: string | null
          point_differential: number | null
          season_id: string
          slot: number | null
          team1_id: string
          team1_score: number | null
          team2_id: string | null
          team2_score: number | null
          type: string | null
          user_id: string | null
          week: number
          winner_team_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "games"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_season_pick_em_standings: {
        Args: { p_season_id: string }
        Returns: undefined
      }
      validate_nfl_calendar: {
        Args: { season_year?: number }
        Returns: {
          issues_found: string[]
          validation_passed: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
