


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_player_to_roster"("p_team_id" "uuid", "p_player_id" "uuid", "p_roster_slot" "text" DEFAULT 'BE'::"text", "p_acquisition_type" "text" DEFAULT 'free_agent'::"text", "p_acquisition_week" integer DEFAULT NULL::integer, "p_cost" integer DEFAULT 0) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    roster_id UUID;
    current_season_id UUID;
BEGIN
    -- Get season_id from team
    SELECT season_id INTO current_season_id 
    FROM teams WHERE id = p_team_id;
    
    -- Add to current roster
    INSERT INTO rosters (
        team_id, player_id, roster_slot, acquisition_type, 
        acquisition_week, cost
    ) VALUES (
        p_team_id, p_player_id, p_roster_slot, p_acquisition_type, 
        p_acquisition_week, p_cost
    )
    RETURNING id INTO roster_id;
    
    -- Record in history
    INSERT INTO roster_history (
        season_id, team_id, player_id, transaction_type, 
        transaction_week, faab_bid
    ) VALUES (
        current_season_id, p_team_id, p_player_id, 'add', 
        p_acquisition_week, p_cost
    );
    
    RETURN roster_id;
END;
$$;


ALTER FUNCTION "public"."add_player_to_roster"("p_team_id" "uuid", "p_player_id" "uuid", "p_roster_slot" "text", "p_acquisition_type" "text", "p_acquisition_week" integer, "p_cost" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."after_game_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Only proceed if the game is completed
    IF NEW.is_completed AND (OLD IS NULL OR NOT OLD.is_completed) THEN
        -- Update both team statistics
        PERFORM refresh_team_stats(NEW.team1_id);
        PERFORM refresh_team_stats(NEW.team2_id);
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."after_game_completion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_schedule_to_season"("p_import_id" "uuid", "p_season_id" "uuid", "p_assigned_by" "uuid" DEFAULT "auth"."uid"(), "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_import_record RECORD;
    v_season_record RECORD;
    v_matchup RECORD;
    v_home_team_id UUID;
    v_away_team_id UUID;
    v_games_created INTEGER := 0;
    v_teams_mapped INTEGER := 0;
    v_team_mapping JSONB := '{}';
    v_espn_team RECORD;
    v_season_team_id UUID;
    v_debug_info TEXT := '';
    v_games_with_scores INTEGER := 0;
BEGIN
    IF NOT public.can_write_league() THEN
        RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
    END IF;

    -- Verify import exists
    SELECT * INTO v_import_record 
    FROM espn_schedule_imports 
    WHERE id = p_import_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Import not found'
        );
    END IF;
    
    -- Verify season exists
    SELECT * INTO v_season_record 
    FROM seasons 
    WHERE id = p_season_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Season not found'
        );
    END IF;
    
    -- Create owner-based team mapping
    FOR v_espn_team IN 
        SELECT * FROM espn_teams 
        WHERE import_id = p_import_id
        ORDER BY espn_team_id
    LOOP
        SELECT t.id INTO v_season_team_id
        FROM teams t
        WHERE t.season_id = p_season_id 
        AND t.owner IS NOT NULL 
        AND TRIM(t.owner) != ''
        AND LOWER(TRIM(t.owner)) = LOWER(TRIM(v_espn_team.owner_name))
        LIMIT 1;
        
        IF v_season_team_id IS NOT NULL THEN
            v_team_mapping := v_team_mapping || jsonb_build_object(
                v_espn_team.espn_team_id::text, 
                v_season_team_id
            );
            v_teams_mapped := v_teams_mapped + 1;
        END IF;
    END LOOP;
    
    -- Create games with FIXED score logic
    FOR v_matchup IN 
        SELECT *
        FROM espn_matchups 
        WHERE import_id = p_import_id
        ORDER BY week, espn_matchup_id
    LOOP
        v_home_team_id := (v_team_mapping->>(v_matchup.home_espn_team_id::text))::UUID;
        v_away_team_id := (v_team_mapping->>(v_matchup.away_espn_team_id::text))::UUID;
        
        IF v_home_team_id IS NOT NULL AND v_away_team_id IS NOT NULL THEN
            -- Check if this game has actual scores (not 0.00)
            IF v_matchup.home_score > 0 OR v_matchup.away_score > 0 THEN
                v_games_with_scores := v_games_with_scores + 1;
            END IF;
            
            INSERT INTO games (
                season_id,
                week,
                team1_id,
                team2_id,
                team1_score,
                team2_score,
                winner_team_id,
                loser_team_id,
                is_tie,
                point_differential,
                type,
                completed_at
            ) VALUES (
                p_season_id,
                v_matchup.week,
                v_home_team_id,
                v_away_team_id,
                -- Import scores if they exist (> 0), regardless of status
                CASE WHEN v_matchup.home_score > 0 OR v_matchup.away_score > 0 THEN v_matchup.home_score ELSE NULL END,
                CASE WHEN v_matchup.home_score > 0 OR v_matchup.away_score > 0 THEN v_matchup.away_score ELSE NULL END,
                -- Determine winner if scores exist
                CASE 
                    WHEN (v_matchup.home_score > 0 OR v_matchup.away_score > 0) AND v_matchup.home_score > v_matchup.away_score THEN v_home_team_id
                    WHEN (v_matchup.home_score > 0 OR v_matchup.away_score > 0) AND v_matchup.away_score > v_matchup.home_score THEN v_away_team_id
                    ELSE NULL
                END,
                -- Determine loser if scores exist
                CASE 
                    WHEN (v_matchup.home_score > 0 OR v_matchup.away_score > 0) AND v_matchup.home_score > v_matchup.away_score THEN v_away_team_id
                    WHEN (v_matchup.home_score > 0 OR v_matchup.away_score > 0) AND v_matchup.away_score > v_matchup.home_score THEN v_home_team_id
                    ELSE NULL
                END,
                -- Check for tie if scores exist
                CASE 
                    WHEN (v_matchup.home_score > 0 OR v_matchup.away_score > 0) AND v_matchup.home_score = v_matchup.away_score THEN true
                    ELSE false
                END,
                -- Point differential if scores exist
                CASE 
                    WHEN v_matchup.home_score > 0 OR v_matchup.away_score > 0 THEN ABS(v_matchup.home_score - v_matchup.away_score)
                    ELSE 0
                END,
                CASE WHEN v_matchup.is_playoff THEN 'playoff' ELSE 'regular' END,
                -- Set completed_at if scores exist
                CASE WHEN v_matchup.home_score > 0 OR v_matchup.away_score > 0 THEN NOW() ELSE NULL END
            ) ON CONFLICT (season_id, week, team1_id, team2_id) DO UPDATE SET
                team1_score = EXCLUDED.team1_score,
                team2_score = EXCLUDED.team2_score,
                winner_team_id = EXCLUDED.winner_team_id,
                loser_team_id = EXCLUDED.loser_team_id,
                is_tie = EXCLUDED.is_tie,
                point_differential = EXCLUDED.point_differential,
                completed_at = EXCLUDED.completed_at,
                type = EXCLUDED.type;
            
            v_games_created := v_games_created + 1;
        END IF;
    END LOOP;
    
    v_debug_info := format('Teams mapped: %s, Games created: %s, Games with scores: %s', 
        v_teams_mapped, v_games_created, v_games_with_scores);
    
    -- Update the import record
    UPDATE espn_schedule_imports 
    SET 
        assigned_season_id = p_season_id,
        assignment_status = 'ASSIGNED',
        assigned_at = NOW(),
        assigned_by = p_assigned_by,
        assignment_notes = COALESCE(p_notes, '') || E'\n\n' || v_debug_info
    WHERE id = p_import_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'import_id', p_import_id,
        'season_id', p_season_id,
        'games_created', v_games_created,
        'games_with_scores', v_games_with_scores,
        'teams_mapped', v_teams_mapped,
        'summary', v_debug_info
    );
END;
$$;


ALTER FUNCTION "public"."assign_schedule_to_season"("p_import_id" "uuid", "p_season_id" "uuid", "p_assigned_by" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_save_weekly_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    current_season_id UUID;
    previous_week INTEGER;
BEGIN
    -- This function is called when a week is marked as completed
    -- Save a snapshot for the completed week
    IF NEW.is_completed = true AND (OLD.is_completed IS NULL OR OLD.is_completed = false) THEN
        -- Get the season ID for this week
        SELECT season_id INTO current_season_id 
        FROM weeks 
        WHERE id = NEW.id;
        
        -- Save snapshot for the completed week
        PERFORM save_enhanced_power_rankings_snapshot(
            current_season_id, 
            NEW.week_number, 
            'weekly'
        );
        
        RAISE NOTICE 'Automatically saved power rankings snapshot for season % week %', current_season_id, NEW.week_number;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_save_weekly_snapshot"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auto_save_weekly_snapshot"() IS 'Trigger function that automatically saves power rankings when a week is marked as completed';



CREATE OR REPLACE FUNCTION "public"."backup_pick_em_submissions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    operation_type_value TEXT;
BEGIN
    -- Determine operation type
    IF TG_OP = 'DELETE' THEN
        operation_type_value := 'DELETE';
        -- For DELETE, OLD contains the deleted record
        INSERT INTO pick_em_submissions_backup (
            user_id,
            pick_em_week_id,
            game_id,
            predicted_winner_team_id,
            confidence_level,
            submitted_at,
            backup_created_at,
            operation_type,
            original_record_id,
            backup_metadata
        ) VALUES (
            OLD.user_id,
            OLD.pick_em_week_id,
            OLD.game_id,
            OLD.predicted_winner_team_id,
            OLD.confidence_level,
            OLD.submitted_at,
            NOW(),
            operation_type_value,
            OLD.id,
            jsonb_build_object(
                'trigger_timestamp', NOW(),
                'trigger_operation', TG_OP,
                'table_name', TG_TABLE_NAME
            )
        );
        RETURN OLD;

    ELSIF TG_OP = 'UPDATE' THEN
        operation_type_value := 'UPDATE';
        -- For UPDATE, NEW contains the updated record
        INSERT INTO pick_em_submissions_backup (
            user_id,
            pick_em_week_id,
            game_id,
            predicted_winner_team_id,
            confidence_level,
            submitted_at,
            backup_created_at,
            operation_type,
            original_record_id,
            backup_metadata
        ) VALUES (
            NEW.user_id,
            NEW.pick_em_week_id,
            NEW.game_id,
            NEW.predicted_winner_team_id,
            NEW.confidence_level,
            NEW.submitted_at,
            NOW(),
            operation_type_value,
            NEW.id,
            jsonb_build_object(
                'trigger_timestamp', NOW(),
                'trigger_operation', TG_OP,
                'table_name', TG_TABLE_NAME,
                'changed_from', row_to_json(OLD),
                'changed_to', row_to_json(NEW)
            )
        );
        RETURN NEW;

    ELSIF TG_OP = 'INSERT' THEN
        operation_type_value := 'INSERT';
        -- For INSERT, NEW contains the new record
        INSERT INTO pick_em_submissions_backup (
            user_id,
            pick_em_week_id,
            game_id,
            predicted_winner_team_id,
            confidence_level,
            submitted_at,
            backup_created_at,
            operation_type,
            original_record_id,
            backup_metadata
        ) VALUES (
            NEW.user_id,
            NEW.pick_em_week_id,
            NEW.game_id,
            NEW.predicted_winner_team_id,
            NEW.confidence_level,
            NEW.submitted_at,
            NOW(),
            operation_type_value,
            NEW.id,
            jsonb_build_object(
                'trigger_timestamp', NOW(),
                'trigger_operation', TG_OP,
                'table_name', TG_TABLE_NAME
            )
        );
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."backup_pick_em_submissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_pick_em_results"("p_pick_em_week_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_results_count INTEGER := 0;
    v_submission RECORD;
    v_game RECORD;
    v_is_correct BOOLEAN;
    v_points_earned INTEGER;
BEGIN
    -- Only calculate if week is ready for results
    IF NOT EXISTS (
        SELECT 1 FROM pick_em_weeks
        WHERE id = p_pick_em_week_id
        AND is_closed = true
        AND NOW() >= results_reveal_at
    ) THEN
        RAISE EXCEPTION 'Results are not ready to be calculated for this week';
    END IF;

    -- Calculate results for each submission
    FOR v_submission IN
        SELECT
            ps.id AS submission_id,
            ps.game_id,
            ps.predicted_winner_team_id,
            ps.confidence_level,
            ps.user_id
        FROM pick_em_submissions ps
        WHERE ps.pick_em_week_id = p_pick_em_week_id
    LOOP
        -- Get the actual game result
        SELECT
            winner_team_id,
            is_completed,
            is_tie
        INTO v_game
        FROM games
        WHERE id = v_submission.game_id;

        -- Skip if game isn't completed yet
        IF NOT v_game.is_completed THEN
            CONTINUE;
        END IF;

        -- Determine if pick was correct
        v_is_correct := (v_submission.predicted_winner_team_id = v_game.winner_team_id);

        -- Calculate points (could implement confidence-based scoring)
        v_points_earned := CASE
            WHEN v_is_correct THEN v_submission.confidence_level
            ELSE 0
        END;

        -- Insert or update result
        INSERT INTO pick_em_results (
            pick_em_week_id,
            submission_id,
            is_correct,
            points_earned,
            actual_winner_team_id
        )
        VALUES (
            p_pick_em_week_id,
            v_submission.submission_id,
            v_is_correct,
            v_points_earned,
            v_game.winner_team_id
        )
        ON CONFLICT (submission_id)
        DO UPDATE SET
            is_correct = EXCLUDED.is_correct,
            points_earned = EXCLUDED.points_earned,
            actual_winner_team_id = EXCLUDED.actual_winner_team_id,
            calculated_at = NOW();

        v_results_count := v_results_count + 1;
    END LOOP;

    -- Update weekly scores
    PERFORM calculate_weekly_pick_em_scores(p_pick_em_week_id);

    -- Mark week as completed
    UPDATE pick_em_weeks
    SET is_completed = true
    WHERE id = p_pick_em_week_id;

    RETURN v_results_count;
END;
$$;


ALTER FUNCTION "public"."calculate_pick_em_results"("p_pick_em_week_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_power_rankings"("season_id" "uuid", "week_number" integer DEFAULT NULL::integer) RETURNS TABLE("team_id" "uuid", "team_name" "text", "power_rating" numeric, "rank" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    weights JSONB := '{
        "winPercentage": 0.25,
        "pointDifferential": 0.20,
        "strengthOfSchedule": 0.15,
        "recentForm": 0.15,
        "qualityWins": 0.10,
        "averagePointsFor": 0.10,
        "badLosses": -0.05
    }';
    max_point_diff DECIMAL(10,2) := 1;
    max_avg_points DECIMAL(10,2) := 1;
    team_count INTEGER := 0;
BEGIN
    -- First refresh all team stats
    PERFORM refresh_season_stats(season_id);
    
    -- Check if we have any teams
    SELECT COUNT(*) INTO team_count FROM teams t WHERE t.season_id = calculate_power_rankings.season_id;
    
    IF team_count = 0 THEN
        RAISE NOTICE 'No teams found for season %', season_id;
        RETURN;
    END IF;
    
    -- Get normalization values (with safe defaults)
    SELECT 
        GREATEST(MAX(ABS(COALESCE(point_differential, 0))), 1),
        GREATEST(MAX(COALESCE(average_points_for, 0)), 1)
    INTO max_point_diff, max_avg_points
    FROM teams t
    WHERE t.season_id = calculate_power_rankings.season_id;
    
    RAISE NOTICE 'Calculating power rankings for season % with % teams. Max point diff: %, Max avg points: %', 
        season_id, team_count, max_point_diff, max_avg_points;
    
    RETURN QUERY
    WITH power_calc AS (
        SELECT 
            t.id,
            t.name,
            (
                (weights->>'winPercentage')::DECIMAL * COALESCE(t.win_percentage, 0) +
                (weights->>'pointDifferential')::DECIMAL * (COALESCE(t.point_differential, 0) / max_point_diff) +
                (weights->>'averagePointsFor')::DECIMAL * (COALESCE(t.average_points_for, 0) / max_avg_points) +
                (weights->>'qualityWins')::DECIMAL * (COALESCE(t.quality_wins, 0) * 0.1) +
                (weights->>'badLosses')::DECIMAL * (COALESCE(t.bad_losses, 0) * 0.1)
            ) AS rating
        FROM teams t
        WHERE t.season_id = calculate_power_rankings.season_id
    )
    SELECT 
        pc.id,
        pc.name,
        COALESCE(pc.rating, 0),
        ROW_NUMBER() OVER (ORDER BY COALESCE(pc.rating, 0) DESC)::INTEGER
    FROM power_calc pc
    ORDER BY COALESCE(pc.rating, 0) DESC;
END;
$$;


ALTER FUNCTION "public"."calculate_power_rankings"("season_id" "uuid", "week_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_team_roster_analytics"("team_uuid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    total_projected DECIMAL(12,2) := 0;
    total_actual DECIMAL(12,2) := 0;
    starter_projected DECIMAL(12,2) := 0;
    starter_actual DECIMAL(12,2) := 0;
    bench_projected DECIMAL(12,2) := 0;
    bench_actual DECIMAL(12,2) := 0;
    pos_strengths JSONB;
BEGIN
    -- Calculate totals from roster
    SELECT 
        COALESCE(SUM(p.season_projected_points), 0),
        COALESCE(SUM(p.season_actual_points), 0),
        COALESCE(SUM(CASE WHEN r.roster_slot NOT IN ('BE', 'IR', 'TAXI') THEN p.season_projected_points ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN r.roster_slot NOT IN ('BE', 'IR', 'TAXI') THEN p.season_actual_points ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN r.roster_slot IN ('BE', 'IR', 'TAXI') THEN p.season_projected_points ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN r.roster_slot IN ('BE', 'IR', 'TAXI') THEN p.season_actual_points ELSE 0 END), 0)
    INTO total_projected, total_actual, starter_projected, starter_actual, bench_projected, bench_actual
    FROM rosters r
    JOIN players p ON r.player_id = p.id
    WHERE r.team_id = team_uuid;

    -- Calculate position strengths
    SELECT jsonb_object_agg(
        position,
        jsonb_build_object(
            'projected', COALESCE(projected_sum, 0),
            'actual', COALESCE(actual_sum, 0),
            'rank', 0  -- Will be calculated separately across all teams
        )
    )
    INTO pos_strengths
    FROM (
        SELECT 
            p.position,
            SUM(p.season_projected_points) as projected_sum,
            SUM(p.season_actual_points) as actual_sum
        FROM rosters r
        JOIN players p ON r.player_id = p.id
        WHERE r.team_id = team_uuid
        GROUP BY p.position
    ) pos_totals;

    -- Update team record
    UPDATE teams 
    SET 
        roster_total_projected_points = total_projected,
        roster_total_actual_points = total_actual,
        starter_projected_points = starter_projected,
        starter_actual_points = starter_actual,
        bench_projected_points = bench_projected,
        bench_actual_points = bench_actual,
        position_strengths = COALESCE(pos_strengths, teams.position_strengths),
        updated_at = NOW()
    WHERE id = team_uuid;
END;
$$;


ALTER FUNCTION "public"."calculate_team_roster_analytics"("team_uuid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_team_roster_analytics"("team_uuid" "uuid") IS 'Recalculates all roster analytics for a given team after roster changes';



CREATE OR REPLACE FUNCTION "public"."calculate_total_transactions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.total_transactions := NEW.free_agent_adds + NEW.waiver_claims + NEW.trades + NEW.drops;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_total_transactions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_weekly_pick_em_scores"("p_pick_em_week_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_score RECORD;
    v_rank INTEGER := 1;
BEGIN
    -- Calculate scores for each user
    FOR v_user_score IN
        SELECT
            ps.user_id,
            COUNT(*) AS total_picks,
            COUNT(CASE WHEN pr.is_correct THEN 1 END) AS correct_picks,
            COALESCE(SUM(pr.points_earned), 0) AS total_points,
            ROUND(
                (COUNT(CASE WHEN pr.is_correct THEN 1 END) * 100.0) / COUNT(*),
                2
            ) AS accuracy_percentage
        FROM pick_em_submissions ps
        LEFT JOIN pick_em_results pr ON ps.id = pr.submission_id
        WHERE ps.pick_em_week_id = p_pick_em_week_id
        GROUP BY ps.user_id
        ORDER BY total_points DESC, accuracy_percentage DESC, correct_picks DESC
    LOOP
        INSERT INTO pick_em_weekly_scores (
            pick_em_week_id,
            user_id,
            total_picks,
            correct_picks,
            total_points,
            accuracy_percentage,
            weekly_rank
        )
        VALUES (
            p_pick_em_week_id,
            v_user_score.user_id,
            v_user_score.total_picks,
            v_user_score.correct_picks,
            v_user_score.total_points,
            v_user_score.accuracy_percentage,
            v_rank
        )
        ON CONFLICT (user_id, pick_em_week_id)
        DO UPDATE SET
            total_picks = EXCLUDED.total_picks,
            correct_picks = EXCLUDED.correct_picks,
            total_points = EXCLUDED.total_points,
            accuracy_percentage = EXCLUDED.accuracy_percentage,
            weekly_rank = EXCLUDED.weekly_rank,
            calculated_at = NOW();

        v_rank := v_rank + 1;
    END LOOP;

    -- Update season standings
    PERFORM update_season_pick_em_standings(
        (SELECT season_id FROM pick_em_weeks WHERE id = p_pick_em_week_id)
    );
END;
$$;


ALTER FUNCTION "public"."calculate_weekly_pick_em_scores"("p_pick_em_week_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_write_league"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is null
      then true
    else public.is_admin()
         or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
  end
$$;


ALTER FUNCTION "public"."can_write_league"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_write_league"() IS 'True for the league admin, a service_role caller, or a direct backend connection (no PostgREST JWT). Guard for privileged SECURITY DEFINER functions. Deliberately does NOT test current_user: inside a SECURITY DEFINER function that is the owner, not the caller.';



CREATE OR REPLACE FUNCTION "public"."check_awards_unlock_status"("season_id_param" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    unique_voters INTEGER;
    metadata_record RECORD;
    is_released BOOLEAN := FALSE;
    voting_open BOOLEAN := FALSE;
BEGIN
    -- Get unique voters count
    SELECT COUNT(DISTINCT user_id) INTO unique_voters
    FROM award_votes av
    JOIN awards_2025 a ON av.award_id = a.id
    WHERE a.season_id = season_id_param;

    -- Get metadata
    SELECT * INTO metadata_record FROM awards_metadata WHERE season_id = season_id_param;

    IF metadata_record.results_released THEN
        is_released := TRUE;
    END IF;

    IF metadata_record.voting_open_to_all THEN
        voting_open := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'unique_voters', unique_voters,
        'required_voters', 14,
        'results_released', is_released,
        'voting_open_to_all', voting_open,
        'deadline', metadata_record.deadline
    );
END;
$$;


ALTER FUNCTION "public"."check_awards_unlock_status"("season_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_espn_imports"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Keep only the 3 most recent imports per user/league/season combination
    DELETE FROM espn_schedule_imports 
    WHERE id NOT IN (
        SELECT id FROM (
            SELECT id, 
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id, espn_league_id, season_year 
                       ORDER BY imported_at DESC
                   ) as rn
            FROM espn_schedule_imports
        ) ranked 
        WHERE rn <= 3
    );
    
    RAISE NOTICE 'Cleanup function created/updated: cleanup_old_espn_imports()';
END;
$$;


ALTER FUNCTION "public"."cleanup_old_espn_imports"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_power_rankings_snapshots"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    deleted_count INTEGER;
    cutoff_date TIMESTAMP;
BEGIN
    -- Keep snapshots for the last 3 years only
    cutoff_date := NOW() - INTERVAL '3 years';
    
    WITH old_seasons AS (
        SELECT id FROM seasons 
        WHERE created_at < cutoff_date
    )
    DELETE FROM power_rankings_history 
    WHERE season_id IN (SELECT id FROM old_seasons);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Cleaned up % old power rankings snapshot records', deleted_count;
    RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_power_rankings_snapshots"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compare_rankings_between_weeks"("season_id" "uuid", "week1" integer, "week2" integer) RETURNS TABLE("team_id" "uuid", "team_name" "text", "week1_rank" integer, "week2_rank" integer, "rank_change" integer, "week1_power_rating" numeric, "week2_power_rating" numeric, "power_rating_change" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as team_id,
        t.name as team_name,
        w1.rank as week1_rank,
        w2.rank as week2_rank,
        (w1.rank - w2.rank) as rank_change,
        w1.power_rating as week1_power_rating,
        w2.power_rating as week2_power_rating,
        (w2.power_rating - w1.power_rating) as power_rating_change
    FROM teams t
    LEFT JOIN power_rankings_history w1 ON (t.id = w1.team_id AND w1.season_id = compare_rankings_between_weeks.season_id AND w1.week_number = compare_rankings_between_weeks.week1)
    LEFT JOIN power_rankings_history w2 ON (t.id = w2.team_id AND w2.season_id = compare_rankings_between_weeks.season_id AND w2.week_number = compare_rankings_between_weeks.week2)
    WHERE t.season_id = compare_rankings_between_weeks.season_id
      AND (w1.team_id IS NOT NULL OR w2.team_id IS NOT NULL)
    ORDER BY COALESCE(w2.rank, w1.rank, 999);
END;
$$;


ALTER FUNCTION "public"."compare_rankings_between_weeks"("season_id" "uuid", "week1" integer, "week2" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_divisions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.divisions (season_id, name, display_order) values
    (new.id, 'Division 1', 1),
    (new.id, 'Division 2', 2);

  return new;
end;
$$;


ALTER FUNCTION "public"."create_default_divisions"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_default_divisions"() IS 'Seeds two placeholder divisions for a new season. Names are intentionally generic - the admin renames them. See supabase/migrations/20260806120000.';



CREATE OR REPLACE FUNCTION "public"."create_pick_em_week"("p_season_id" "uuid", "p_week_number" integer, "p_submission_opens_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_submission_closes_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_results_reveal_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_pick_em_week_id uuid;
    v_week_start timestamptz;
    v_season seasons%ROWTYPE;
    v_tz text;
    v_opens_at timestamptz;
    v_closes_at timestamptz;
    v_reveal_at timestamptz;
begin
    if not public.can_write_league() then
      raise exception 'admin only' using errcode = '42501';
    end if;

    select * into v_season from seasons where id = p_season_id;
    if not found then
      raise exception 'season % not found', p_season_id using errcode = 'P0002';
    end if;

    v_tz := coalesce(v_season.timezone, 'America/New_York');
    v_week_start := public.season_week_start(p_season_id, p_week_number);

    v_opens_at := coalesce(
      p_submission_opens_at,
      ((v_week_start at time zone v_tz)::date
        + coalesce(v_season.pickem_open_offset_days, 0)
        + coalesce(v_season.pickem_open_time, time '04:00')) at time zone v_tz
    );

    v_closes_at := coalesce(
      p_submission_closes_at,
      ((v_week_start at time zone v_tz)::date
        + coalesce(v_season.pickem_close_offset_days, 2)
        + coalesce(v_season.pickem_close_time, time '20:00')) at time zone v_tz
    );

    v_reveal_at := coalesce(
      p_results_reveal_at,
      ((v_week_start at time zone v_tz)::date
        + coalesce(v_season.pickem_reveal_offset_days, 7)
        + coalesce(v_season.pickem_reveal_time, time '12:00')) at time zone v_tz
    );

    insert into pick_em_weeks (
        season_id, week_number, submission_opens_at,
        submission_closes_at, results_reveal_at, is_active
    )
    values (
        p_season_id, p_week_number, v_opens_at,
        v_closes_at, v_reveal_at,
        now() between v_opens_at and v_closes_at
    )
    returning id into v_pick_em_week_id;

    return v_pick_em_week_id;
end;
$$;


ALTER FUNCTION "public"."create_pick_em_week"("p_season_id" "uuid", "p_week_number" integer, "p_submission_opens_at" timestamp with time zone, "p_submission_closes_at" timestamp with time zone, "p_results_reveal_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debug_refresh_season_data"("season_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    team_record RECORD;
    game_record RECORD;
    result_text TEXT := '';
    team_count INTEGER := 0;
    game_count INTEGER := 0;
    completed_game_count INTEGER := 0;
BEGIN
    -- Count teams
    SELECT COUNT(*) INTO team_count FROM teams WHERE teams.season_id = debug_refresh_season_data.season_id;
    
    -- Count games
    SELECT COUNT(*) INTO game_count FROM games WHERE games.season_id = debug_refresh_season_data.season_id;
    SELECT COUNT(*) INTO completed_game_count FROM games WHERE games.season_id = debug_refresh_season_data.season_id AND is_completed = true;
    
    result_text := format('Season %s: %s teams, %s games (%s completed)' || E'\n', 
        season_id, team_count, game_count, completed_game_count);
    
    -- Refresh all team stats
    FOR team_record IN SELECT id, name FROM teams WHERE teams.season_id = debug_refresh_season_data.season_id
    LOOP
        PERFORM refresh_team_stats(team_record.id);
        result_text := result_text || format('Refreshed stats for team: %s' || E'\n', team_record.name);
    END LOOP;
    
    -- Show sample of completed games
    result_text := result_text || E'\nCompleted Games:' || E'\n';
    FOR game_record IN 
        SELECT g.week, t1.name as team1_name, g.team1_score, t2.name as team2_name, g.team2_score
        FROM games g
        JOIN teams t1 ON g.team1_id = t1.id
        JOIN teams t2 ON g.team2_id = t2.id
        WHERE g.season_id = debug_refresh_season_data.season_id AND g.is_completed = true
        ORDER BY g.week, g.id
        LIMIT 10
    LOOP
        result_text := result_text || format('Week %s: %s %.1f - %.1f %s' || E'\n', 
            game_record.week, game_record.team1_name, game_record.team1_score, 
            game_record.team2_score, game_record.team2_name);
    END LOOP;
    
    RETURN result_text;
END;
$$;


ALTER FUNCTION "public"."debug_refresh_season_data"("season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."direct_match_test"("p_import_id" "uuid", "p_season_id" "uuid") RETURNS TABLE("espn_id" integer, "espn_owner" "text", "matched_season_team" "text", "matched_owner" "text", "matched_team_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.espn_team_id,
        et.owner_name,
        st.name,
        st.owner,
        st.id
    FROM espn_teams et
    LEFT JOIN (
        SELECT DISTINCT ON (LOWER(TRIM(owner)))
            id, name, owner, season_id
        FROM teams 
        WHERE season_id = p_season_id
        AND owner IS NOT NULL 
        AND TRIM(owner) != ''
    ) st ON LOWER(TRIM(st.owner)) = LOWER(TRIM(et.owner_name))
    WHERE et.import_id = p_import_id
    ORDER BY et.espn_team_id;
END;
$$;


ALTER FUNCTION "public"."direct_match_test"("p_import_id" "uuid", "p_season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."disable_roster_trigger"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.can_write_league() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  alter table rosters disable trigger set_rosters_user_id;
end;
$$;


ALTER FUNCTION "public"."disable_roster_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."drop_player_from_roster"("p_team_id" "uuid", "p_player_id" "uuid", "p_transaction_week" integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    current_season_id UUID;
    roster_exists BOOLEAN;
BEGIN
    -- Check if player is on roster
    SELECT EXISTS(
        SELECT 1 FROM rosters 
        WHERE team_id = p_team_id AND player_id = p_player_id
    ) INTO roster_exists;
    
    IF NOT roster_exists THEN
        RAISE EXCEPTION 'Player not on roster';
    END IF;
    
    -- Get season_id
    SELECT season_id INTO current_season_id 
    FROM teams WHERE id = p_team_id;
    
    -- Remove from current roster
    DELETE FROM rosters 
    WHERE team_id = p_team_id AND player_id = p_player_id;
    
    -- Record in history
    INSERT INTO roster_history (
        season_id, team_id, player_id, transaction_type, 
        transaction_week
    ) VALUES (
        current_season_id, p_team_id, p_player_id, 'drop', 
        p_transaction_week
    );
    
    RETURN true;
END;
$$;


ALTER FUNCTION "public"."drop_player_from_roster"("p_team_id" "uuid", "p_player_id" "uuid", "p_transaction_week" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enable_roster_trigger"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.can_write_league() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  alter table rosters enable trigger set_rosters_user_id;
end;
$$;


ALTER FUNCTION "public"."enable_roster_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_trade"("p_season_id" "uuid", "p_team1_id" "uuid", "p_team2_id" "uuid", "p_team1_players" "uuid"[], "p_team2_players" "uuid"[], "p_transaction_week" integer, "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    trade_uuid UUID;
    player_id UUID;
BEGIN
    -- Generate unique trade ID
    trade_uuid := uuid_generate_v4();
    
    -- Move players from team1 to team2
    FOREACH player_id IN ARRAY p_team1_players
    LOOP
        -- Remove from team1
        DELETE FROM rosters WHERE team_id = p_team1_id AND player_id = player_id;
        
        -- Add to team2
        INSERT INTO rosters (team_id, player_id, acquisition_type, acquisition_week)
        VALUES (p_team2_id, player_id, 'trade', p_transaction_week);
        
        -- Record history
        INSERT INTO roster_history (
            season_id, team_id, player_id, transaction_type, 
            transaction_week, trade_partner_team_id, trade_id, notes
        ) VALUES (
            p_season_id, p_team2_id, player_id, 'trade', 
            p_transaction_week, p_team1_id, trade_uuid, p_notes
        );
    END LOOP;
    
    -- Move players from team2 to team1
    FOREACH player_id IN ARRAY p_team2_players
    LOOP
        -- Remove from team2
        DELETE FROM rosters WHERE team_id = p_team2_id AND player_id = player_id;
        
        -- Add to team1
        INSERT INTO rosters (team_id, player_id, acquisition_type, acquisition_week)
        VALUES (p_team1_id, player_id, 'trade', p_transaction_week);
        
        -- Record history
        INSERT INTO roster_history (
            season_id, team_id, player_id, transaction_type, 
            transaction_week, trade_partner_team_id, trade_id, notes
        ) VALUES (
            p_season_id, p_team1_id, player_id, 'trade', 
            p_transaction_week, p_team2_id, trade_uuid, p_notes
        );
    END LOOP;
    
    RETURN trade_uuid;
END;
$$;


ALTER FUNCTION "public"."execute_trade"("p_season_id" "uuid", "p_team1_id" "uuid", "p_team2_id" "uuid", "p_team1_players" "uuid"[], "p_team2_players" "uuid"[], "p_transaction_week" integer, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_weekly_snapshot_if_needed"("season_year" integer DEFAULT 2025) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    trigger_check RECORD;
    snapshot_result INTEGER;
    execution_log JSONB := '{}';
    error_message TEXT;
BEGIN
    -- Check if we should trigger
    SELECT * INTO trigger_check
    FROM should_trigger_weekly_snapshot(season_year)
    LIMIT 1;
    
    execution_log := jsonb_build_object(
        'timestamp', NOW(),
        'season_year', season_year,
        'should_trigger', trigger_check.should_trigger,
        'week_number', trigger_check.week_number,
        'season_id', trigger_check.season_id,
        'reason', trigger_check.reason
    );
    
    IF NOT trigger_check.should_trigger THEN
        execution_log := execution_log || jsonb_build_object('status', 'skipped');
        RETURN execution_log;
    END IF;
    
    -- Execute snapshot with error handling
    BEGIN
        -- Save snapshot for the previous week (completed week)
        IF trigger_check.week_number > 1 THEN
            snapshot_result := save_enhanced_power_rankings_snapshot(
                trigger_check.season_id,
                trigger_check.week_number - 1,
                'weekly'
            );
            
            execution_log := execution_log || jsonb_build_object(
                'status', 'success',
                'snapshot_week', trigger_check.week_number - 1,
                'teams_saved', snapshot_result
            );
        ELSE
            execution_log := execution_log || jsonb_build_object(
                'status', 'skipped',
                'reason', 'Week 1 - no previous week to snapshot'
            );
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
        execution_log := execution_log || jsonb_build_object(
            'status', 'error',
            'error_message', error_message
        );
        
        -- Log error for debugging
        RAISE WARNING 'Weekly snapshot failed: %', error_message;
    END;
    
    RETURN execution_log;
END;
$$;


ALTER FUNCTION "public"."execute_weekly_snapshot_if_needed"("season_year" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."execute_weekly_snapshot_if_needed"("season_year" integer) IS 'Executes weekly power rankings snapshot if all conditions are met';



CREATE OR REPLACE FUNCTION "public"."get_available_players"("p_season_id" "uuid", "p_position" "text" DEFAULT NULL::"text") RETURNS TABLE("player_id" "uuid", "player_name" "text", "position" "text", "nfl_team" "text", "jersey_number" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.position,
        p.team_abbreviation,
        p.jersey_number
    FROM players p
    WHERE p.is_active = true
      AND (p_position IS NULL OR p.position = p_position)
      AND NOT EXISTS (
          SELECT 1 FROM rosters r
          JOIN teams t ON r.team_id = t.id
          WHERE r.player_id = p.id 
            AND t.season_id = p_season_id
      )
    ORDER BY p.position, p.name;
END;
$$;


ALTER FUNCTION "public"."get_available_players"("p_season_id" "uuid", "p_position" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_snapshot_weeks"("season_id" "uuid") RETURNS TABLE("week_number" integer, "snapshot_count" integer, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        prh.week_number,
        COUNT(*)::INTEGER as snapshot_count,
        MAX(prh.created_at) as created_at
    FROM power_rankings_history prh
    WHERE prh.season_id = get_available_snapshot_weeks.season_id
    GROUP BY prh.week_number
    ORDER BY prh.week_number;
END;
$$;


ALTER FUNCTION "public"."get_available_snapshot_weeks"("season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_nfl_week"("season_year" integer DEFAULT 2025) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    current_week INTEGER;
    current_timestamp TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Find the current week based on snapshot trigger times
    SELECT nwc.week_number INTO current_week
    FROM nfl_week_calendar nwc
    WHERE nwc.season_year = get_current_nfl_week.season_year
      AND current_timestamp >= (nwc.week_start_date::timestamp with time zone)
      AND current_timestamp < (nwc.snapshot_trigger_time + INTERVAL '7 days')
    ORDER BY nwc.week_number DESC
    LIMIT 1;
    
    -- If no week found, default to week 1
    RETURN COALESCE(current_week, 1);
END;
$$;


ALTER FUNCTION "public"."get_current_nfl_week"("season_year" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_current_nfl_week"("season_year" integer) IS 'Returns the current NFL week number based on the calendar and current time';



CREATE OR REPLACE FUNCTION "public"."get_franchise_awards"("p_franchise_id" "uuid") RETURNS TABLE("year" integer, "award_category" "text", "award_name" "text", "value_label" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        hs.year,
        sa.award_category,
        sa.award_name,
        sa.value_label
    FROM season_awards sa
    JOIN historical_seasons hs ON sa.season_id = hs.id
    WHERE sa.franchise_id = p_franchise_id
    ORDER BY hs.year DESC, sa.award_category, sa.award_name;
END;
$$;


ALTER FUNCTION "public"."get_franchise_awards"("p_franchise_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_franchise_awards"("p_franchise_id" "uuid") IS 'Returns all awards won by a franchise, ordered by year.';



CREATE OR REPLACE FUNCTION "public"."get_franchise_career_stats"("p_franchise_id" "uuid") RETURNS TABLE("total_seasons" integer, "total_wins" integer, "total_losses" integer, "win_percentage" numeric, "championships" integer, "playoff_appearances" integer, "total_points" numeric, "avg_points_per_game" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT season_id)::INTEGER,
        SUM(regular_season_wins)::INTEGER,
        SUM(regular_season_losses)::INTEGER,
        ROUND(AVG(regular_season_win_percentage), 4),
        COUNT(*) FILTER (WHERE playoff_finish = 'champion')::INTEGER,
        COUNT(*) FILTER (WHERE made_playoffs = true)::INTEGER,
        SUM(points_for),
        ROUND(AVG(average_points_per_game), 2)
    FROM historical_teams
    WHERE franchise_id = p_franchise_id;
END;
$$;


ALTER FUNCTION "public"."get_franchise_career_stats"("p_franchise_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_franchise_career_stats"("p_franchise_id" "uuid") IS 'Returns career statistics for a specific franchise across all seasons.';



CREATE OR REPLACE FUNCTION "public"."get_franchise_transaction_history"("p_franchise_id" "uuid") RETURNS TABLE("year" integer, "free_agent_adds" integer, "waiver_claims" integer, "trades" integer, "drops" integer, "total_transactions" integer, "faab_spent" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        hs.year,
        tt.free_agent_adds,
        tt.waiver_claims,
        tt.trades,
        tt.drops,
        tt.total_transactions,
        tt.faab_spent
    FROM team_transactions tt
    JOIN historical_seasons hs ON tt.season_id = hs.id
    WHERE tt.franchise_id = p_franchise_id
    ORDER BY hs.year ASC;
END;
$$;


ALTER FUNCTION "public"."get_franchise_transaction_history"("p_franchise_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_franchise_transaction_history"("p_franchise_id" "uuid") IS 'Returns season-by-season transaction breakdown for a specific franchise.';



CREATE OR REPLACE FUNCTION "public"."get_franchise_transaction_totals"() RETURNS TABLE("franchise_id" "uuid", "owner_name" "text", "total_free_agent_adds" integer, "total_waiver_claims" integer, "total_trades" integer, "total_drops" integer, "total_all_transactions" integer, "total_faab_spent" numeric, "seasons_count" integer)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        tt.franchise_id,
        tt.owner_name,
        SUM(tt.free_agent_adds)::INTEGER,
        SUM(tt.waiver_claims)::INTEGER,
        SUM(tt.trades)::INTEGER,
        SUM(tt.drops)::INTEGER,
        SUM(tt.total_transactions)::INTEGER,
        SUM(tt.faab_spent),
        COUNT(*)::INTEGER
    FROM team_transactions tt
    GROUP BY tt.franchise_id, tt.owner_name
    ORDER BY SUM(tt.total_transactions) DESC;
END;
$$;


ALTER FUNCTION "public"."get_franchise_transaction_totals"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_franchise_transaction_totals"() IS 'Returns all-time transaction totals for all franchises, sorted by most active.';



CREATE OR REPLACE FUNCTION "public"."get_h2h_record"("p_franchise1_id" "uuid", "p_franchise2_id" "uuid") RETURNS TABLE("total_matchups" integer, "franchise1_wins" integer, "franchise2_wins" integer, "ties" integer, "franchise1_avg_points" numeric, "franchise2_avg_points" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_min_id UUID;
    v_max_id UUID;
BEGIN
    -- Ensure consistent ordering (franchise1_id < franchise2_id)
    IF p_franchise1_id < p_franchise2_id THEN
        v_min_id := p_franchise1_id;
        v_max_id := p_franchise2_id;
    ELSE
        v_min_id := p_franchise2_id;
        v_max_id := p_franchise1_id;
    END IF;

    RETURN QUERY
    SELECT
        h.total_matchups,
        CASE WHEN p_franchise1_id = v_min_id THEN h.franchise1_wins ELSE h.franchise2_wins END,
        CASE WHEN p_franchise1_id = v_min_id THEN h.franchise2_wins ELSE h.franchise1_wins END,
        h.ties,
        CASE WHEN p_franchise1_id = v_min_id THEN h.franchise1_avg_points ELSE h.franchise2_avg_points END,
        CASE WHEN p_franchise1_id = v_min_id THEN h.franchise2_avg_points ELSE h.franchise1_avg_points END
    FROM head_to_head_records h
    WHERE h.franchise1_id = v_min_id AND h.franchise2_id = v_max_id;
END;
$$;


ALTER FUNCTION "public"."get_h2h_record"("p_franchise1_id" "uuid", "p_franchise2_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_h2h_record"("p_franchise1_id" "uuid", "p_franchise2_id" "uuid") IS 'Returns head-to-head record between two franchises across all seasons.';



CREATE OR REPLACE FUNCTION "public"."get_pending_schedule_imports"() RETURNS TABLE("import_id" "uuid", "espn_league_id" "text", "season_year" integer, "league_name" "text", "team_count" integer, "total_matchups" integer, "imported_at" timestamp with time zone, "assignment_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        esi.id,
        esi.espn_league_id,
        esi.season_year,
        esi.league_name,
        esi.team_count,
        esi.total_matchups,
        esi.imported_at,
        esi.assignment_status
    FROM espn_schedule_imports esi
    WHERE esi.assignment_status = 'PENDING'
    ORDER BY esi.imported_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_pending_schedule_imports"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pick_em_status"("p_season_id" "uuid") RETURNS TABLE("week_number" integer, "pick_em_week_id" "uuid", "status" "text", "submission_opens_at" timestamp with time zone, "submission_closes_at" timestamp with time zone, "results_reveal_at" timestamp with time zone, "can_submit" boolean, "results_available" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        pew.week_number,
        pew.id AS pick_em_week_id,
        CASE
            WHEN NOW() < pew.submission_opens_at THEN 'upcoming'
            WHEN NOW() BETWEEN pew.submission_opens_at AND pew.submission_closes_at THEN 'open'
            WHEN NOW() BETWEEN pew.submission_closes_at AND pew.results_reveal_at THEN 'closed'
            WHEN NOW() >= pew.results_reveal_at THEN 'completed'
            ELSE 'unknown'
        END AS status,
        pew.submission_opens_at,
        pew.submission_closes_at,
        pew.results_reveal_at,
        NOW() BETWEEN pew.submission_opens_at AND pew.submission_closes_at AS can_submit,
        NOW() >= pew.results_reveal_at AS results_available
    FROM pick_em_weeks pew
    WHERE pew.season_id = p_season_id
    ORDER BY pew.week_number;
END;
$$;


ALTER FUNCTION "public"."get_pick_em_status"("p_season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_power_rankings_for_week"("season_id" "uuid", "week_number" integer) RETURNS TABLE("team_id" "uuid", "team_name" "text", "team_owner" "text", "rank" integer, "power_rating" numeric, "rank_change" integer, "previous_rank" integer, "performance_score" numeric, "team_strength" numeric, "strength_of_schedule" numeric, "momentum_score" numeric, "consistency_score" numeric, "injury_score" numeric, "clutch_score" numeric, "all_play_win_pct" numeric, "wins" integer, "losses" integer, "ties" integer, "points_for" numeric, "points_against" numeric, "win_percentage" numeric, "point_differential" numeric, "games_played" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    input_season_id UUID := season_id;
    input_week_number INTEGER := week_number;
BEGIN
    -- Check if historical data exists for this week
    IF EXISTS (
        SELECT 1 FROM power_rankings_history prh 
        WHERE prh.season_id = input_season_id 
          AND prh.week_number = input_week_number
    ) THEN
        -- Return historical data
        RETURN QUERY
        SELECT 
            prh.team_id,
            t.name as team_name,
            t.owner as team_owner,
            prh.rank,
            prh.power_rating,
            prh.rank_change,
            prh.previous_rank,
            prh.performance_score,
            prh.team_strength,
            prh.strength_of_schedule,
            prh.momentum_score,
            prh.consistency_score,
            prh.injury_score,
            prh.clutch_score,
            prh.all_play_win_pct,
            prh.wins,
            prh.losses,
            prh.ties,
            prh.points_for,
            prh.points_against,
            prh.win_percentage,
            prh.point_differential,
            (prh.wins + prh.losses + prh.ties) as games_played
        FROM power_rankings_history prh
        JOIN teams t ON t.id = prh.team_id
        WHERE prh.season_id = input_season_id 
          AND prh.week_number = input_week_number
        ORDER BY prh.rank;
    ELSE
        -- Calculate current rankings with limited data
        RETURN QUERY
        WITH team_stats AS (
            SELECT 
                t.id as team_id,
                t.name as team_name,
                t.owner as team_owner,
                t.wins as team_wins,
                t.losses as team_losses,
                t.ties as team_ties,
                t.points_for as team_points_for,
                t.points_against as team_points_against,
                t.win_percentage as team_win_percentage,
                t.point_differential as team_point_differential,
                COALESCE(t.power_rating, 50.0) as power_rating,
                50.0::NUMERIC as performance_score,
                50.0::NUMERIC as team_strength,
                0.0::NUMERIC as strength_of_schedule,
                50.0::NUMERIC as momentum_score,
                50.0::NUMERIC as consistency_score,
                75.0::NUMERIC as injury_score,
                50.0::NUMERIC as clutch_score,
                50.0::NUMERIC as all_play_win_pct
            FROM teams t 
            WHERE t.season_id = input_season_id
        ),
        ranked_teams AS (
            SELECT 
                ts.*,
                ROW_NUMBER() OVER (ORDER BY ts.power_rating DESC, ts.team_win_percentage DESC, ts.team_point_differential DESC) as current_rank,
                (ts.team_wins + ts.team_losses + ts.team_ties) as games_played
            FROM team_stats ts
        )
        SELECT 
            rt.team_id,
            rt.team_name,
            rt.team_owner,
            rt.current_rank::INTEGER as rank,
            rt.power_rating,
            0::INTEGER as rank_change,
            rt.current_rank::INTEGER as previous_rank,
            rt.performance_score,
            rt.team_strength,
            rt.strength_of_schedule,
            rt.momentum_score,
            rt.consistency_score,
            rt.injury_score,
            rt.clutch_score,
            rt.all_play_win_pct,
            rt.team_wins as wins,
            rt.team_losses as losses,
            rt.team_ties as ties,
            rt.team_points_for as points_for,
            rt.team_points_against as points_against,
            rt.team_win_percentage as win_percentage,
            rt.team_point_differential as point_differential,
            rt.games_played
        FROM ranked_teams rt
        ORDER BY rt.current_rank;
    END IF;
END;
$$;


ALTER FUNCTION "public"."get_power_rankings_for_week"("season_id" "uuid", "week_number" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_power_rankings_for_week"("season_id" "uuid", "week_number" integer) IS 'Final fixed version: Retrieves week-specific power rankings with RPC compatibility';



CREATE OR REPLACE FUNCTION "public"."get_roster_transaction_history"("p_team_id" "uuid", "p_limit" integer DEFAULT 50) RETURNS TABLE("transaction_date" timestamp with time zone, "transaction_type" "text", "player_name" "text", "position" "text", "transaction_week" integer, "trade_partner_name" "text", "faab_bid" integer, "notes" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rh.transaction_date,
        rh.transaction_type,
        p.name,
        p.position,
        rh.transaction_week,
        CASE 
            WHEN rh.trade_partner_team_id IS NOT NULL 
            THEN (SELECT name FROM teams WHERE id = rh.trade_partner_team_id)
            ELSE NULL
        END,
        rh.faab_bid,
        rh.notes
    FROM roster_history rh
    JOIN players p ON rh.player_id = p.id
    WHERE rh.team_id = p_team_id
    ORDER BY rh.transaction_date DESC, rh.created_at DESC
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_roster_transaction_history"("p_team_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_season_summary"("season_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    summary JSONB;
BEGIN
    SELECT jsonb_build_object(
        'totalGames', COUNT(*),
        'completedGames', COUNT(*) FILTER (WHERE is_completed = true),
        'totalPoints', SUM(team1_score + team2_score) FILTER (WHERE is_completed = true),
        'averageGameScore', AVG(team1_score + team2_score) FILTER (WHERE is_completed = true),
        'blowoutCount', COUNT(*) FILTER (WHERE is_blowout = true),
        'closeGameCount', COUNT(*) FILTER (WHERE is_close = true),
        'biggestBlowout', jsonb_build_object(
            'differential', MAX(point_differential),
            'week', (SELECT week FROM games WHERE season_id = get_season_summary.season_id AND point_differential = MAX(games.point_differential) LIMIT 1)
        )
    )
    INTO summary
    FROM games 
    WHERE games.season_id = get_season_summary.season_id;
    
    RETURN summary;
END;
$$;


ALTER FUNCTION "public"."get_season_summary"("season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_snapshot_execution_history"("season_id" "uuid", "limit_count" integer DEFAULT 10) RETURNS TABLE("week_number" integer, "snapshot_count" integer, "last_created" timestamp with time zone, "snapshot_type" "text", "teams_in_snapshot" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        prh.week_number,
        COUNT(*)::INTEGER as snapshot_count,
        MAX(prh.created_at) as last_created,
        prh.snapshot_type,
        COUNT(DISTINCT prh.team_id)::INTEGER as teams_in_snapshot
    FROM power_rankings_history prh
    WHERE prh.season_id = get_snapshot_execution_history.season_id
    GROUP BY prh.week_number, prh.snapshot_type
    ORDER BY prh.week_number DESC
    LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."get_snapshot_execution_history"("season_id" "uuid", "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_standings_by_division"("season_id_param" "uuid") RETURNS TABLE("team_id" "uuid", "team_name" "text", "owner" "text", "division_id" integer, "division_name" character varying, "wins" integer, "losses" integer, "ties" integer, "points_for" numeric, "points_against" numeric, "point_differential" numeric, "win_percentage" numeric, "streak_type" character varying, "streak_length" integer, "division_rank" integer, "playoff_position" boolean)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH team_stats AS (
        SELECT
            t.id as team_id,
            t.name as team_name,
            t.owner,
            t.division_id,
            d.name as division_name,
            t.wins,
            t.losses,
            t.ties,
            t.points_for,
            t.points_against,
            t.point_differential,
            t.win_percentage,
            COALESCE((t.current_streak->>'type')::VARCHAR, 'none') as streak_type,
            COALESCE((t.current_streak->>'length')::INTEGER, 0) as streak_length,
            ROW_NUMBER() OVER (
                PARTITION BY t.division_id
                ORDER BY t.win_percentage DESC, t.points_for DESC, t.points_against ASC
            ) as division_rank
        FROM teams t
        LEFT JOIN divisions d ON t.division_id = d.id
        WHERE t.season_id = season_id_param
    )
    SELECT
        ts.team_id,
        ts.team_name,
        ts.owner,
        ts.division_id,
        ts.division_name,
        ts.wins,
        ts.losses,
        ts.ties,
        ts.points_for,
        ts.points_against,
        ts.point_differential,
        ts.win_percentage,
        ts.streak_type,
        ts.streak_length,
        ts.division_rank::INTEGER,
        (ts.division_rank <= 3) as playoff_position
    FROM team_stats ts
    ORDER BY ts.division_id, ts.division_rank;
END;
$$;


ALTER FUNCTION "public"."get_standings_by_division"("season_id_param" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_standings_by_division"("season_id_param" "uuid") IS 'Returns standings grouped by division with playoff positions marked';



CREATE OR REPLACE FUNCTION "public"."get_team_roster"("p_team_id" "uuid") RETURNS TABLE("player_id" "uuid", "player_name" "text", "position" "text", "nfl_team" "text", "roster_slot" "text", "added_date" timestamp with time zone, "acquisition_type" "text", "is_keeper" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.position,
        p.team_abbreviation,
        r.roster_slot,
        r.added_date,
        r.acquisition_type,
        r.is_keeper
    FROM rosters r
    JOIN players p ON r.player_id = p.id
    WHERE r.team_id = p_team_id
    ORDER BY 
        CASE r.roster_slot 
            WHEN 'QB' THEN 1
            WHEN 'RB' THEN 2 
            WHEN 'WR' THEN 3
            WHEN 'TE' THEN 4
            WHEN 'FLEX' THEN 5
            WHEN 'K' THEN 6
            WHEN 'D/ST' THEN 7
            WHEN 'BE' THEN 8
            WHEN 'IR' THEN 9
            ELSE 10
        END,
        p.name;
END;
$$;


ALTER FUNCTION "public"."get_team_roster"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_display_names"("user_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    au.id,
    COALESCE(
      au.raw_user_meta_data->>'full_name',
      au.raw_user_meta_data->>'name',
      split_part(au.email, '@', 1),
      'User ' || substring(au.id::text, 1, 8)
    )::text as display_name
  FROM auth.users au
  WHERE au.id = ANY(user_ids);
END;
$$;


ALTER FUNCTION "public"."get_user_display_names"("user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_picks_for_week"("p_pick_em_week_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("submission_id" "uuid", "game_id" "uuid", "week_number" integer, "team1_name" "text", "team2_name" "text", "predicted_winner_team_id" "uuid", "predicted_winner_name" "text", "confidence_level" integer, "is_correct" boolean, "points_earned" integer, "actual_winner_team_id" "uuid", "actual_winner_name" "text", "submitted_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        ps.id AS submission_id,
        ps.game_id,
        pew.week_number,
        t1.name AS team1_name,
        t2.name AS team2_name,
        ps.predicted_winner_team_id,
        predicted_team.name AS predicted_winner_name,
        ps.confidence_level,
        pr.is_correct,
        pr.points_earned,
        pr.actual_winner_team_id,
        actual_team.name AS actual_winner_name,
        ps.submitted_at
    FROM pick_em_submissions ps
    JOIN pick_em_weeks pew ON ps.pick_em_week_id = pew.id
    JOIN games g ON ps.game_id = g.id
    JOIN teams t1 ON g.team1_id = t1.id
    JOIN teams t2 ON g.team2_id = t2.id
    JOIN teams predicted_team ON ps.predicted_winner_team_id = predicted_team.id
    LEFT JOIN pick_em_results pr ON ps.id = pr.submission_id
    LEFT JOIN teams actual_team ON pr.actual_winner_team_id = actual_team.id
    WHERE ps.pick_em_week_id = p_pick_em_week_id
    AND ps.user_id = p_user_id
    ORDER BY g.id;
END;
$$;


ALTER FUNCTION "public"."get_user_picks_for_week"("p_pick_em_week_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_users_for_admin"("user_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "email" "text", "display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required. Unauthorized access to user details is not permitted.'
      using errcode = 'P0001';
  end if;

  if array_length(user_ids, 1) > 100 then
    raise exception 'Too many user IDs requested. Maximum 100 allowed per request.'
      using errcode = 'P0001';
  end if;

  return query
  select
    au.id,
    au.email::text,
    coalesce(
      (au.raw_user_meta_data->>'full_name')::text,
      (au.raw_user_meta_data->>'name')::text,
      au.email::text
    ) as display_name
  from auth.users au
  where au.id = any(user_ids);
end;
$$;


ALTER FUNCTION "public"."get_users_for_admin"("user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((auth.jwt() ->> 'email') = 'humzak2001@gmail.com', false)
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"() IS 'True when the current JWT belongs to the league admin. Sole authority for admin-write RLS policies.';



CREATE OR REPLACE FUNCTION "public"."manual_weekly_snapshot_check"("season_year" integer DEFAULT 2025) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN execute_weekly_snapshot_if_needed(season_year);
END;
$$;


ALTER FUNCTION "public"."manual_weekly_snapshot_check"("season_year" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."manual_weekly_snapshot_check"("season_year" integer) IS 'Manually triggers the weekly snapshot check process for testing';



CREATE OR REPLACE FUNCTION "public"."refresh_league_history_views"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_franchise_career_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_season_leaderboards;
END;
$$;


ALTER FUNCTION "public"."refresh_league_history_views"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."refresh_league_history_views"() IS 'Refreshes all materialized views. Run after importing historical data or updating stats.';



CREATE OR REPLACE FUNCTION "public"."refresh_season_stats"("season_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    team_record RECORD;
BEGIN
    FOR team_record IN SELECT id FROM teams WHERE teams.season_id = refresh_season_stats.season_id
    LOOP
        PERFORM refresh_team_stats(team_record.id);
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."refresh_season_stats"("season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_team_stats"("team_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    team_record teams%ROWTYPE;
    total_games INTEGER := 0;
    total_wins INTEGER := 0;
    total_losses INTEGER := 0;
    total_ties INTEGER := 0;
    total_points_for DECIMAL(10,2) := 0;
    total_points_against DECIMAL(10,2) := 0;
    win_pct DECIMAL(5,4) := 0;
    avg_pf DECIMAL(10,2) := 0;
    avg_pa DECIMAL(10,2) := 0;
    point_diff DECIMAL(10,2) := 0;
    blowout_win_count INTEGER := 0;
    close_win_count INTEGER := 0;
    close_loss_count INTEGER := 0;
BEGIN
    SELECT * INTO team_record FROM teams WHERE id = team_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Team not found: %', team_id;
    END IF;

    SELECT
        COALESCE(COUNT(*), 0),
        COALESCE(SUM(CASE
            WHEN (team1_id = team_id AND team1_score > team2_score) OR
                 (team2_id = team_id AND team2_score > team1_score) THEN 1
            ELSE 0
        END), 0),
        COALESCE(SUM(CASE
            WHEN (team1_id = team_id AND team1_score < team2_score) OR
                 (team2_id = team_id AND team2_score < team1_score) THEN 1
            ELSE 0
        END), 0),
        COALESCE(SUM(CASE WHEN team1_score = team2_score THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN team1_id = team_id THEN team1_score ELSE team2_score END), 0),
        COALESCE(SUM(CASE WHEN team1_id = team_id THEN team2_score ELSE team1_score END), 0)
    INTO total_games, total_wins, total_losses, total_ties, total_points_for, total_points_against
    FROM games
    WHERE (team1_id = team_id OR team2_id = team_id)
      AND is_completed = true
      AND type = 'regular'
      AND season_id = team_record.season_id;

    win_pct := CASE WHEN total_games > 0 THEN total_wins::DECIMAL / total_games ELSE 0 END;
    avg_pf := CASE WHEN total_games > 0 THEN total_points_for / total_games ELSE 0 END;
    avg_pa := CASE WHEN total_games > 0 THEN total_points_against / total_games ELSE 0 END;
    point_diff := total_points_for - total_points_against;

    SELECT
        COALESCE(SUM(CASE WHEN winner_team_id = team_id AND is_blowout THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN winner_team_id = team_id AND is_close THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN loser_team_id = team_id AND is_close THEN 1 ELSE 0 END), 0)
    INTO blowout_win_count, close_win_count, close_loss_count
    FROM games
    WHERE (team1_id = team_id OR team2_id = team_id)
      AND is_completed = true
      AND type = 'regular'
      AND season_id = team_record.season_id;

    UPDATE teams
    SET
        wins = total_wins,
        losses = total_losses,
        ties = total_ties,
        points_for = total_points_for,
        points_against = total_points_against,
        win_percentage = win_pct,
        point_differential = point_diff,
        average_points_for = avg_pf,
        average_points_against = avg_pa,
        blowout_wins = blowout_win_count,
        close_wins = close_win_count,
        close_losses = close_loss_count,
        quality_wins = COALESCE(quality_wins, 0),
        bad_losses = COALESCE(bad_losses, 0)
    WHERE id = team_id;
END;
$$;


ALTER FUNCTION "public"."refresh_team_stats"("team_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."refresh_team_stats"("team_id" "uuid") IS 'Recompute a team''s stored regular-season stats from games. Postseason games are excluded -- see public.v_team_standings for the same numbers as a view.';



CREATE OR REPLACE FUNCTION "public"."refresh_transaction_views"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_transaction_leaderboards;
END;
$$;


ALTER FUNCTION "public"."refresh_transaction_views"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_enhanced_power_rankings_snapshot"("season_id" "uuid", "week_number" integer, "snapshot_type" "text" DEFAULT 'weekly'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    team_record RECORD;
    saved_count INTEGER := 0;
    current_week_games INTEGER;
    input_season_id UUID := season_id;
    input_week_number INTEGER := week_number;
    input_snapshot_type TEXT := snapshot_type;
BEGIN
    -- Check if there are any completed games for this week
    SELECT COUNT(*) INTO current_week_games
    FROM games g
    WHERE g.season_id = input_season_id 
      AND g.week = input_week_number
      AND g.team1_score IS NOT NULL 
      AND g.team2_score IS NOT NULL;

    -- Only save if there are completed games or it's a manual snapshot
    IF current_week_games = 0 AND input_snapshot_type = 'weekly' THEN
        RAISE NOTICE 'No completed games found for season % week %. Skipping snapshot.', input_season_id, input_week_number;
        RETURN 0;
    END IF;

    -- Delete existing rankings for this week
    DELETE FROM power_rankings_history prh
    WHERE prh.season_id = input_season_id 
      AND prh.week_number = input_week_number;
    
    -- Calculate and save power rankings with all components
    FOR team_record IN 
        WITH team_calculations AS (
            SELECT 
                t.id as team_id,
                t.name as team_name,
                t.wins as team_wins,
                t.losses as team_losses,
                t.ties as team_ties,
                t.points_for as team_points_for,
                t.points_against as team_points_against,
                t.win_percentage as team_win_percentage,
                t.point_differential as team_point_differential,
                COALESCE(t.power_rating, 50.0) as power_rating,
                50.0 as performance_score,
                50.0 as team_strength,
                0.0 as strength_of_schedule,
                50.0 as momentum_score,
                50.0 as consistency_score,
                75.0 as injury_score,
                50.0 as clutch_score,
                50.0 as all_play_win_pct
            FROM teams t 
            WHERE t.season_id = input_season_id
        ),
        ranked_teams AS (
            SELECT 
                tc.*,
                ROW_NUMBER() OVER (ORDER BY tc.power_rating DESC, tc.team_win_percentage DESC, tc.team_point_differential DESC) as current_rank
            FROM team_calculations tc
        )
        SELECT 
            rt.*,
            COALESCE(
                (SELECT prh.rank FROM power_rankings_history prh
                 WHERE prh.season_id = input_season_id 
                   AND prh.team_id = rt.team_id
                   AND prh.week_number = input_week_number - 1
                 LIMIT 1), 
                rt.current_rank
            ) as previous_rank
        FROM ranked_teams rt
        ORDER BY rt.current_rank
    LOOP
        INSERT INTO power_rankings_history (
            season_id, 
            week_number, 
            team_id, 
            rank, 
            power_rating,
            rank_change,
            previous_rank,
            performance_score,
            team_strength,
            strength_of_schedule,
            momentum_score,
            consistency_score,
            injury_score,
            clutch_score,
            all_play_win_pct,
            wins,
            losses,
            ties,
            points_for,
            points_against,
            win_percentage,
            point_differential,
            snapshot_type
        ) VALUES (
            input_season_id,
            input_week_number,
            team_record.team_id,
            team_record.current_rank,
            team_record.power_rating,
            team_record.previous_rank - team_record.current_rank,
            team_record.previous_rank,
            team_record.performance_score,
            team_record.team_strength,
            team_record.strength_of_schedule,
            team_record.momentum_score,
            team_record.consistency_score,
            team_record.injury_score,
            team_record.clutch_score,
            team_record.all_play_win_pct,
            team_record.team_wins,
            team_record.team_losses,
            team_record.team_ties,
            team_record.team_points_for,
            team_record.team_points_against,
            team_record.team_win_percentage,
            team_record.team_point_differential,
            input_snapshot_type
        );
        
        saved_count := saved_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Saved % power ranking records for season % week %', saved_count, input_season_id, input_week_number;
    RETURN saved_count;
END;
$$;


ALTER FUNCTION "public"."save_enhanced_power_rankings_snapshot"("season_id" "uuid", "week_number" integer, "snapshot_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."save_enhanced_power_rankings_snapshot"("season_id" "uuid", "week_number" integer, "snapshot_type" "text") IS 'Final fixed version: Saves power rankings snapshot with original parameter names and proper table aliases';



CREATE OR REPLACE FUNCTION "public"."save_power_rankings_snapshot"("season_id" "uuid", "week_number" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    ranking_record RECORD;
BEGIN
    -- Delete existing rankings for this week
    DELETE FROM power_rankings_history 
    WHERE power_rankings_history.season_id = save_power_rankings_snapshot.season_id 
      AND power_rankings_history.week_number = save_power_rankings_snapshot.week_number;
    
    -- Insert new rankings
    FOR ranking_record IN 
        SELECT * FROM calculate_power_rankings(season_id)
    LOOP
        INSERT INTO power_rankings_history (
            season_id, week_number, team_id, rank, power_rating
        ) VALUES (
            season_id, week_number, ranking_record.team_id, 
            ranking_record.rank, ranking_record.power_rating
        );
    END LOOP;
    
    -- Update teams table with current rankings
    WITH current_rankings AS (
        SELECT * FROM calculate_power_rankings(season_id)
    )
    UPDATE teams 
    SET 
        power_rating = cr.power_rating,
        previous_rank = COALESCE(
            (SELECT rank FROM power_rankings_history 
             WHERE power_rankings_history.season_id = save_power_rankings_snapshot.season_id 
               AND power_rankings_history.team_id = teams.id
               AND power_rankings_history.week_number = save_power_rankings_snapshot.week_number - 1
             LIMIT 1), 
            cr.rank
        ),
        rank_change = COALESCE(previous_rank, cr.rank) - cr.rank
    FROM current_rankings cr
    WHERE teams.id = cr.team_id;
END;
$$;


ALTER FUNCTION "public"."save_power_rankings_snapshot"("season_id" "uuid", "week_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_weekly_power_rankings_snapshot"("p_season_id" "uuid", "p_week_number" integer, "p_snapshot_type" "text" DEFAULT 'manual'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inserted_count INTEGER := 0;
BEGIN
  -- Delete existing snapshot for this week (if any)
  DELETE FROM power_rankings_history
  WHERE season_id = p_season_id
    AND week_number = p_week_number;

  -- Insert new rankings snapshot
  -- This is a simplified version - you may need to adjust based on your actual ranking calculation logic
  WITH team_stats AS (
    SELECT
      t.id as team_id,
      t.season_id,
      COUNT(CASE WHEN (g.team1_id = t.id AND g.team1_score > g.team2_score)
                   OR (g.team2_id = t.id AND g.team2_score > g.team1_score) THEN 1 END) as wins,
      COUNT(CASE WHEN (g.team1_id = t.id AND g.team1_score < g.team2_score)
                   OR (g.team2_id = t.id AND g.team2_score < g.team1_score) THEN 1 END) as losses,
      COUNT(CASE WHEN (g.team1_id = t.id OR g.team2_id = t.id)
                  AND g.team1_score = g.team2_score
                  AND g.team1_score IS NOT NULL THEN 1 END) as ties,
      COUNT(CASE WHEN (g.team1_id = t.id OR g.team2_id = t.id)
                  AND g.team1_score IS NOT NULL THEN 1 END) as games_played,
      COALESCE(SUM(CASE WHEN g.team1_id = t.id THEN g.team1_score ELSE g.team2_score END), 0) as points_for,
      COALESCE(SUM(CASE WHEN g.team1_id = t.id THEN g.team2_score ELSE g.team1_score END), 0) as points_against
    FROM teams t
    LEFT JOIN games g ON (g.team1_id = t.id OR g.team2_id = t.id)
      AND g.season_id = t.season_id
      AND g.week <= p_week_number
      AND g.team1_score IS NOT NULL
      AND g.team2_score IS NOT NULL
    WHERE t.season_id = p_season_id
    GROUP BY t.id, t.season_id
  ),
  ranked_teams AS (
    SELECT
      team_id,
      wins,
      losses,
      ties,
      games_played,
      points_for,
      points_against,
      points_for - points_against as point_differential,
      CASE WHEN games_played > 0
           THEN CAST(wins AS DECIMAL) / games_played
           ELSE 0 END as win_percentage,
      -- Simple power rating based on win percentage and point differential
      (CASE WHEN games_played > 0
            THEN CAST(wins AS DECIMAL) / games_played
            ELSE 0 END * 60) +
      ((points_for - points_against) / NULLIF(games_played, 0) * 0.5) + 40 as power_rating,
      ROW_NUMBER() OVER (ORDER BY
        CASE WHEN games_played > 0
             THEN CAST(wins AS DECIMAL) / games_played
             ELSE 0 END DESC,
        (points_for - points_against) DESC,
        points_for DESC
      ) as rank
    FROM team_stats
  ),
  with_rank_change AS (
    SELECT
      rt.*,
      COALESCE(prev.rank, rt.rank) as previous_rank,
      COALESCE(prev.rank, rt.rank) - rt.rank as rank_change
    FROM ranked_teams rt
    LEFT JOIN power_rankings_history prev ON prev.team_id = rt.team_id
      AND prev.season_id = p_season_id
      AND prev.week_number = p_week_number - 1
  )
  INSERT INTO power_rankings_history (
    season_id,
    week_number,
    team_id,
    rank,
    power_rating,
    rank_change,
    previous_rank,
    wins,
    losses,
    ties,
    points_for,
    points_against,
    point_differential,
    win_percentage,
    snapshot_type,
    performance_score,
    team_strength,
    strength_of_schedule,
    momentum_score,
    consistency_score,
    injury_score,
    clutch_score,
    all_play_win_pct
  )
  SELECT
    p_season_id,
    p_week_number,
    team_id,
    rank,
    power_rating,
    rank_change,
    previous_rank,
    wins,
    losses,
    ties,
    points_for,
    points_against,
    point_differential,
    win_percentage,
    p_snapshot_type,
    0, -- performance_score (placeholder)
    0, -- team_strength (placeholder)
    0, -- strength_of_schedule (placeholder)
    0, -- momentum_score (placeholder)
    0, -- consistency_score (placeholder)
    0, -- injury_score (placeholder)
    0, -- clutch_score (placeholder)
    0  -- all_play_win_pct (placeholder)
  FROM with_rank_change;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
END;
$$;


ALTER FUNCTION "public"."save_weekly_power_rankings_snapshot"("p_season_id" "uuid", "p_week_number" integer, "p_snapshot_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."season_current_week"("p_season_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select greatest(1, least(
    coalesce(s.total_weeks, s.regular_season_weeks + s.playoff_weeks),
    floor(
      extract(epoch from (
        now() - ((s.start_date + time '00:00') at time zone s.timezone)
      )) / 604800
    )::integer + 1
  ))
  from public.seasons s
  where s.id = p_season_id
$$;


ALTER FUNCTION "public"."season_current_week"("p_season_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."season_current_week"("p_season_id" "uuid") IS 'Current fantasy week, clamped to [1, total_weeks]. Replaces the SEASON_START_DATE constant in utils/weekCalculator.js.';



CREATE OR REPLACE FUNCTION "public"."season_week_start"("p_season_id" "uuid", "p_week" integer) RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select ((s.start_date + ((p_week - 1) * 7)) + time '00:00') at time zone s.timezone
  from public.seasons s
  where s.id = p_season_id
$$;


ALTER FUNCTION "public"."season_week_start"("p_season_id" "uuid", "p_week" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."season_week_start"("p_season_id" "uuid", "p_week" integer) IS 'Instant at which the given fantasy week begins. Weeks roll over Tuesday midnight in the season timezone.';



CREATE OR REPLACE FUNCTION "public"."set_user_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    -- Only set user_id if not already provided (allows service role to set it explicitly)
    IF NEW.user_id IS NULL THEN
      NEW.user_id := auth.uid();
    END IF;
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."set_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."should_trigger_weekly_snapshot"("season_year" integer DEFAULT 2025) RETURNS TABLE("should_trigger" boolean, "week_number" integer, "season_id" "uuid", "reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    current_timestamp TIMESTAMP WITH TIME ZONE := NOW();
    trigger_window_start TIMESTAMP WITH TIME ZONE;
    trigger_window_end TIMESTAMP WITH TIME ZONE;
    current_week INTEGER;
    active_season_record RECORD;
    last_snapshot_time TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get current NFL week
    current_week := get_current_nfl_week(season_year);
    
    -- Get trigger window (snapshot time ± 30 minutes)
    SELECT 
        nwc.snapshot_trigger_time - INTERVAL '30 minutes' as window_start,
        nwc.snapshot_trigger_time + INTERVAL '30 minutes' as window_end
    INTO trigger_window_start, trigger_window_end
    FROM nfl_week_calendar nwc
    WHERE nwc.season_year = should_trigger_weekly_snapshot.season_year
      AND nwc.week_number = current_week;
    
    -- Check if we're in the trigger window
    IF current_timestamp < trigger_window_start OR current_timestamp > trigger_window_end THEN
        RETURN QUERY SELECT false, current_week, NULL::UUID, 'Outside trigger window';
        RETURN;
    END IF;
    
    -- Get active season
    SELECT s.* INTO active_season_record
    FROM seasons s
    WHERE s.is_active = true
      AND s.year = season_year
    LIMIT 1;
    
    IF active_season_record IS NULL THEN
        RETURN QUERY SELECT false, current_week, NULL::UUID, 'No active season found';
        RETURN;
    END IF;
    
    -- Check if snapshot already exists for this week
    SELECT MAX(created_at) INTO last_snapshot_time
    FROM power_rankings_history
    WHERE season_id = active_season_record.id
      AND week_number = current_week;
    
    -- If snapshot exists and was created recently, don't trigger
    IF last_snapshot_time IS NOT NULL AND last_snapshot_time > (current_timestamp - INTERVAL '6 hours') THEN
        RETURN QUERY SELECT false, current_week, active_season_record.id, 'Recent snapshot exists';
        RETURN;
    END IF;
    
    -- Check if there are completed games for the previous week
    IF current_week > 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM games
            WHERE season_id = active_season_record.id
              AND week = current_week - 1
              AND team1_score IS NOT NULL
              AND team2_score IS NOT NULL
        ) THEN
            RETURN QUERY SELECT false, current_week, active_season_record.id, 'No completed games for previous week';
            RETURN;
        END IF;
    END IF;
    
    -- All conditions met - trigger snapshot
    RETURN QUERY SELECT true, current_week, active_season_record.id, 'Conditions met for weekly snapshot';
END;
$$;


ALTER FUNCTION "public"."should_trigger_weekly_snapshot"("season_year" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."should_trigger_weekly_snapshot"("season_year" integer) IS 'Determines if a weekly power rankings snapshot should be triggered based on time and conditions';



CREATE OR REPLACE FUNCTION "public"."submit_pick_em_picks"("p_pick_em_week_id" "uuid", "p_picks" "jsonb") RETURNS TABLE("submission_id" "uuid", "game_id" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_pick JSONB;
    v_new_submission_id UUID;
    v_game_id_val UUID;
    v_predicted_winner_val UUID;
BEGIN
    -- First, delete any existing picks for this user and week
    DELETE FROM pick_em_submissions
    WHERE pick_em_week_id = p_pick_em_week_id
    AND user_id = auth.uid();

    -- Process each pick
    FOR v_pick IN SELECT * FROM jsonb_array_elements(p_picks)
    LOOP
        -- Extract values from JSONB
        v_game_id_val := (v_pick->>'gameId')::UUID;
        v_predicted_winner_val := (v_pick->>'predictedWinnerTeamId')::UUID;

        -- Simple insert with explicit column names
        INSERT INTO pick_em_submissions (
            pick_em_week_id,
            game_id,
            predicted_winner_team_id,
            confidence_level,
            user_id
        )
        VALUES (
            p_pick_em_week_id,
            v_game_id_val,
            v_predicted_winner_val,
            1,
            auth.uid()
        )
        RETURNING pick_em_submissions.id INTO v_new_submission_id;

        -- Return the result using our local variables
        RETURN QUERY SELECT
            v_new_submission_id,
            v_game_id_val,
            'success'::TEXT;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."submit_pick_em_picks"("p_pick_em_week_id" "uuid", "p_picks" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_playoff_picks"("p_season_id" "uuid", "p_picks" "jsonb", "p_championship_point_total" double precision DEFAULT NULL::double precision) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  pick_record jsonb;
  deadline timestamptz;
  result_count int := 0;
begin
  select submission_deadline into deadline
  from playoffs_2025_config
  where season_id = p_season_id;

  deadline := coalesce(deadline, 'infinity'::timestamptz);

  if now() > deadline then
    raise exception 'Submission deadline has passed';
  end if;

  for pick_record in select * from jsonb_array_elements(p_picks)
  loop
    insert into playoffs_2025 (
      user_id, season_id, matchup_id, game_id,
      predicted_winner_team_id, championship_point_total
    )
    values (
      auth.uid(),
      p_season_id,
      pick_record->>'matchup_id',
      (pick_record->>'game_id')::uuid,
      (pick_record->>'predicted_winner_team_id')::uuid,
      case
        when pick_record->>'matchup_id' = 'championship'
        then coalesce((pick_record->>'championship_point_total')::float8, p_championship_point_total)
        else null
      end
    )
    on conflict (user_id, matchup_id)
    do update set
      predicted_winner_team_id = excluded.predicted_winner_team_id,
      game_id = excluded.game_id,
      championship_point_total = excluded.championship_point_total,
      updated_at = now();

    result_count := result_count + 1;
  end loop;

  return jsonb_build_object('success', true, 'picks_submitted', result_count);
end;
$$;


ALTER FUNCTION "public"."submit_playoff_picks"("p_season_id" "uuid", "p_picks" "jsonb", "p_championship_point_total" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_espn_player_stats"("espn_id" integer, "projected_pts" numeric DEFAULT 0, "actual_pts" numeric DEFAULT 0, "season_projected_pts" numeric DEFAULT 0, "season_actual_pts" numeric DEFAULT 0, "games" integer DEFAULT 0, "injury" "text" DEFAULT 'ACTIVE'::"text", "owned_pct" numeric DEFAULT 0, "started_pct" numeric DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE players 
    SET 
        projected_points = projected_pts,
        actual_points = actual_pts,
        season_projected_points = season_projected_pts,
        season_actual_points = season_actual_pts,
        games_played = games,
        injury_status = injury,
        percent_owned = owned_pct,
        percent_started = started_pct,
        last_stats_sync = NOW(),
        espn_last_updated = NOW()
    WHERE espn_player_id = espn_id;
END;
$$;


ALTER FUNCTION "public"."sync_espn_player_stats"("espn_id" integer, "projected_pts" numeric, "actual_pts" numeric, "season_projected_pts" numeric, "season_actual_pts" numeric, "games" integer, "injury" "text", "owned_pct" numeric, "started_pct" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_player_from_espn"("p_espn_player_id" integer, "p_name" "text", "p_position" "text", "p_team_abbreviation" "text" DEFAULT NULL::"text", "p_jersey_number" integer DEFAULT NULL::integer, "p_espn_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    player_uuid UUID;
BEGIN
    -- Insert or update player data
    INSERT INTO players (
        espn_player_id, name, position, team_abbreviation, 
        jersey_number, espn_data, updated_at
    ) VALUES (
        p_espn_player_id, p_name, p_position, p_team_abbreviation, 
        p_jersey_number, p_espn_data, NOW()
    )
    ON CONFLICT (espn_player_id) 
    DO UPDATE SET 
        name = EXCLUDED.name,
        position = EXCLUDED.position,
        team_abbreviation = EXCLUDED.team_abbreviation,
        jersey_number = EXCLUDED.jersey_number,
        espn_data = EXCLUDED.espn_data,
        updated_at = NOW()
    RETURNING id INTO player_uuid;
    
    RETURN player_uuid;
END;
$$;


ALTER FUNCTION "public"."sync_player_from_espn"("p_espn_player_id" integer, "p_name" "text", "p_position" "text", "p_team_abbreviation" "text", "p_jersey_number" integer, "p_espn_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_team_roster_from_espn"("p_team_id" "uuid", "p_roster_data" "jsonb", "p_current_week" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    player_data JSONB;
    player_uuid UUID;
    players_synced INTEGER := 0;
BEGIN
    -- Clear current roster (this assumes full replacement)
    DELETE FROM rosters WHERE team_id = p_team_id;
    
    -- Process each player in the roster data
    FOR player_data IN SELECT jsonb_array_elements(p_roster_data)
    LOOP
        -- Sync/create player
        SELECT sync_player_from_espn(
            (player_data->>'espn_player_id')::INTEGER,
            player_data->>'name',
            player_data->>'position',
            player_data->>'nfl_team',
            (player_data->>'jersey_number')::INTEGER,
            player_data->'additional_data'
        ) INTO player_uuid;
        
        -- Add to roster
        INSERT INTO rosters (
            team_id, 
            player_id, 
            roster_slot,
            acquisition_type,
            acquisition_week
        ) VALUES (
            p_team_id,
            player_uuid,
            COALESCE(player_data->>'roster_slot', 'BE'),
            'free_agent', -- Default for API sync
            p_current_week
        );
        
        players_synced := players_synced + 1;
    END LOOP;
    
    RETURN players_synced;
END;
$$;


ALTER FUNCTION "public"."sync_team_roster_from_espn"("p_team_id" "uuid", "p_roster_data" "jsonb", "p_current_week" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."team_standings_as_of"("p_season_id" "uuid", "p_through_week" integer) RETURNS TABLE("team_id" "uuid", "team_name" "text", "owner_name" "text", "games_played" bigint, "wins" bigint, "losses" bigint, "ties" bigint, "win_percentage" numeric, "points_for" numeric, "points_against" numeric, "point_differential" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    t.id, t.name, t.owner,
    count(*) filter (where r.is_regular),
    count(*) filter (where r.is_regular and r.result = 'W'),
    count(*) filter (where r.is_regular and r.result = 'L'),
    count(*) filter (where r.is_regular and r.result = 'T'),
    round(
      (count(*) filter (where r.is_regular and r.result = 'W')
       + 0.5 * count(*) filter (where r.is_regular and r.result = 'T'))
      / nullif(count(*) filter (where r.is_regular), 0)
    , 4),
    coalesce(sum(r.points_for) filter (where r.is_regular), 0),
    coalesce(sum(r.points_against) filter (where r.is_regular), 0),
    coalesce(sum(r.points_for) filter (where r.is_regular), 0)
      - coalesce(sum(r.points_against) filter (where r.is_regular), 0)
  from public.teams t
  left join public.v_game_results r on r.team_id = t.id and r.week <= p_through_week
  where t.season_id = p_season_id
  group by t.id, t.name, t.owner
$$;


ALTER FUNCTION "public"."team_standings_as_of"("p_season_id" "uuid", "p_through_week" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."team_standings_as_of"("p_season_id" "uuid", "p_through_week" integer) IS 'Standings for a season restricted to weeks 1..p_through_week.';



CREATE OR REPLACE FUNCTION "public"."test_owner_matching"("p_import_id" "uuid", "p_season_id" "uuid") RETURNS TABLE("espn_team_id" integer, "espn_owner_raw" "text", "espn_owner_clean" "text", "season_owner_raw" "text", "season_owner_clean" "text", "match_result" boolean, "found_team_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.espn_team_id,
        et.owner_name as espn_owner_raw,
        LOWER(TRIM(et.owner_name)) as espn_owner_clean,
        t.owner as season_owner_raw,
        LOWER(TRIM(t.owner)) as season_owner_clean,
        (LOWER(TRIM(t.owner)) = LOWER(TRIM(et.owner_name))) as match_result,
        t.id as found_team_id
    FROM espn_teams et
    LEFT JOIN teams t ON (
        t.season_id = p_season_id 
        AND t.owner IS NOT NULL 
        AND TRIM(t.owner) != ''
        AND LOWER(TRIM(t.owner)) = LOWER(TRIM(et.owner_name))
    )
    WHERE et.import_id = p_import_id
    ORDER BY et.espn_team_id;
END;
$$;


ALTER FUNCTION "public"."test_owner_matching"("p_import_id" "uuid", "p_season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_team_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Only update if the game is now completed (has scores)
    IF NEW.team1_score IS NOT NULL AND NEW.team2_score IS NOT NULL THEN
        -- Calculate derived fields for the game
        NEW.point_differential := ABS(NEW.team1_score - NEW.team2_score);
        NEW.is_blowout := NEW.point_differential >= 30;
        NEW.is_close := NEW.point_differential <= 5;
        NEW.is_tie := NEW.team1_score = NEW.team2_score;
        NEW.completed_at := COALESCE(NEW.completed_at, NOW());
        
        -- Set winner and loser
        IF NEW.team1_score > NEW.team2_score THEN
            NEW.winner_team_id := NEW.team1_id;
            NEW.loser_team_id := NEW.team2_id;
        ELSIF NEW.team2_score > NEW.team1_score THEN
            NEW.winner_team_id := NEW.team2_id;
            NEW.loser_team_id := NEW.team1_id;
        ELSE
            NEW.winner_team_id := NULL;
            NEW.loser_team_id := NULL;
        END IF;
        
        -- Update team statistics after the game is saved
        -- We'll do this in an AFTER trigger
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_update_team_stats"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "season_id" "uuid" NOT NULL,
    "week" integer NOT NULL,
    "team1_id" "uuid" NOT NULL,
    "team2_id" "uuid",
    "team1_score" numeric(10,2),
    "team2_score" numeric(10,2),
    "type" "text" DEFAULT 'regular'::"text",
    "is_completed" boolean GENERATED ALWAYS AS ((("team1_score" IS NOT NULL) AND ("team2_score" IS NOT NULL))) STORED,
    "winner_team_id" "uuid",
    "loser_team_id" "uuid",
    "is_tie" boolean DEFAULT false,
    "point_differential" numeric(10,2) DEFAULT 0,
    "is_blowout" boolean DEFAULT false,
    "is_close" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "slot" integer,
    "is_upset" boolean DEFAULT false,
    "espn_matchup_id" integer,
    "espn_scoring_period_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "games_different_teams" CHECK (("team1_id" <> "team2_id")),
    CONSTRAINT "games_slot_range_check" CHECK ((("slot" IS NULL) OR (("slot" >= 0) AND ("slot" <= 3)))),
    CONSTRAINT "games_type_check" CHECK (("type" = ANY (ARRAY['regular'::"text", 'playoff'::"text", 'playoff_championship'::"text", 'playoff_semifinals'::"text", 'playoff_quarterfinals'::"text", 'playoff_first_round'::"text", 'playoff_consolation_championship'::"text", 'playoff_consolation_semifinals'::"text", 'playoff_consolation_quarterfinals'::"text", 'bye'::"text"]))),
    CONSTRAINT "games_week_check" CHECK (("week" > 0))
);


ALTER TABLE "public"."games" OWNER TO "postgres";


COMMENT ON COLUMN "public"."games"."slot" IS 'Slot position (0-3) for consolation bracket matchups in week 15. 
Slot 0 = highest seeds, Slot 3 = lowest seeds. 
Used to determine ladder positioning in subsequent rounds.';



CREATE OR REPLACE FUNCTION "public"."update_game_result"("game_id" "uuid", "team1_score" numeric, "team2_score" numeric) RETURNS "public"."games"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    game_record games%ROWTYPE;
    point_diff DECIMAL(10,2);
begin
    if not public.can_write_league() then
      raise exception 'admin only' using errcode = '42501';
    end if;

    update games
    set
        team1_score = update_game_result.team1_score,
        team2_score = update_game_result.team2_score,
        completed_at = NOW()
    where id = game_id
    returning * into game_record;

    point_diff := ABS(team1_score - team2_score);

    update games
    set
        point_differential = point_diff,
        is_blowout = point_diff >= 30,
        is_close = point_diff <= 5,
        is_tie = team1_score = team2_score,
        winner_team_id = case
            when team1_score > team2_score then team1_id
            when team2_score > team1_score then team2_id
            else NULL
        end,
        loser_team_id = case
            when team1_score < team2_score then team1_id
            when team2_score < team1_score then team2_id
            else NULL
        end
    where id = game_id
    returning * into game_record;

    perform refresh_team_stats(game_record.team1_id);
    perform refresh_team_stats(game_record.team2_id);

    return game_record;
end;
$$;


ALTER FUNCTION "public"."update_game_result"("game_id" "uuid", "team1_score" numeric, "team2_score" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_player_averages"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Calculate averages when stats are updated
    NEW.average_points_per_game = CASE 
        WHEN NEW.games_played > 0 THEN NEW.season_actual_points / NEW.games_played
        ELSE 0
    END;
    
    NEW.projected_average = CASE 
        WHEN NEW.season_projected_points > 0 THEN NEW.season_projected_points / 17  -- Assuming 17-week season
        ELSE 0
    END;
    
    NEW.updated_at = NOW();
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_player_averages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_playoff_pick_results"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.winner_team_id is not null
     and (old.winner_team_id is null or old.winner_team_id != new.winner_team_id) then
    update public.playoff_picks
    set
      actual_winner_team_id = new.winner_team_id,
      is_correct = (predicted_winner_team_id = new.winner_team_id),
      points_earned = case when predicted_winner_team_id = new.winner_team_id then 1 else 0 end,
      updated_at = now()
    where game_id = new.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."update_playoff_pick_results"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_season_pick_em_standings"("p_season_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_season RECORD;
    v_rank INTEGER := 1;
BEGIN
    -- Calculate season totals for each user
    FOR v_user_season IN
        SELECT
            pws.user_id,
            COUNT(DISTINCT pws.pick_em_week_id) AS total_weeks_participated,
            SUM(pws.total_picks) AS total_picks,
            SUM(pws.correct_picks) AS total_correct_picks,
            SUM(pws.total_points) AS total_points,
            ROUND(
                (SUM(pws.correct_picks) * 100.0) / NULLIF(SUM(pws.total_picks), 0),
                2
            ) AS overall_accuracy_percentage,
            COUNT(CASE WHEN pws.accuracy_percentage = 100 THEN 1 END) AS perfect_weeks
        FROM pick_em_weekly_scores pws
        JOIN pick_em_weeks pew ON pws.pick_em_week_id = pew.id
        WHERE pew.season_id = p_season_id
        GROUP BY pws.user_id
        ORDER BY total_points DESC, overall_accuracy_percentage DESC, total_correct_picks DESC
    LOOP
        INSERT INTO pick_em_season_standings (
            season_id,
            user_id,
            total_weeks_participated,
            total_picks,
            total_correct_picks,
            total_points,
            overall_accuracy_percentage,
            perfect_weeks,
            season_rank
        )
        VALUES (
            p_season_id,
            v_user_season.user_id,
            v_user_season.total_weeks_participated,
            v_user_season.total_picks,
            v_user_season.total_correct_picks,
            v_user_season.total_points,
            v_user_season.overall_accuracy_percentage,
            v_user_season.perfect_weeks,
            v_rank
        )
        ON CONFLICT (user_id, season_id)
        DO UPDATE SET
            total_weeks_participated = EXCLUDED.total_weeks_participated,
            total_picks = EXCLUDED.total_picks,
            total_correct_picks = EXCLUDED.total_correct_picks,
            total_points = EXCLUDED.total_points,
            overall_accuracy_percentage = EXCLUDED.overall_accuracy_percentage,
            perfect_weeks = EXCLUDED.perfect_weeks,
            season_rank = EXCLUDED.season_rank,
            last_updated = NOW();

        v_rank := v_rank + 1;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."update_season_pick_em_standings"("p_season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_transactions_2025_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_transactions_2025_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_nfl_calendar"("season_year" integer DEFAULT 2025) RETURNS TABLE("validation_passed" boolean, "issues_found" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    issues TEXT[] := ARRAY[]::TEXT[];
    week_count INTEGER;
    gap_found BOOLEAN := false;
    overlap_found BOOLEAN := false;
BEGIN
    -- Check if we have all weeks
    SELECT COUNT(*) INTO week_count
    FROM nfl_week_calendar
    WHERE season_year = validate_nfl_calendar.season_year;
    
    IF week_count < 18 THEN
        issues := array_append(issues, 'Missing regular season weeks (found ' || week_count || ', expected at least 18)');
    END IF;
    
    -- Check for gaps in week sequence
    IF EXISTS (
        SELECT 1 FROM (
            SELECT week_number,
                   LAG(week_number) OVER (ORDER BY week_number) as prev_week
            FROM nfl_week_calendar
            WHERE season_year = validate_nfl_calendar.season_year
        ) t
        WHERE prev_week IS NOT NULL AND week_number != prev_week + 1
    ) THEN
        issues := array_append(issues, 'Gaps found in week sequence');
    END IF;
    
    -- Check for date overlaps
    IF EXISTS (
        SELECT 1 FROM (
            SELECT week_number,
                   week_end_date,
                   LEAD(week_start_date) OVER (ORDER BY week_number) as next_start
            FROM nfl_week_calendar
            WHERE season_year = validate_nfl_calendar.season_year
        ) t
        WHERE next_start IS NOT NULL AND week_end_date >= next_start
    ) THEN
        issues := array_append(issues, 'Date overlaps found between weeks');
    END IF;
    
    -- Check trigger times
    IF EXISTS (
        SELECT 1 FROM nfl_week_calendar
        WHERE season_year = validate_nfl_calendar.season_year
          AND snapshot_trigger_time::date <= week_end_date
    ) THEN
        issues := array_append(issues, 'Snapshot trigger times occur before week end dates');
    END IF;
    
    RETURN QUERY SELECT (array_length(issues, 1) IS NULL), issues;
END;
$$;


ALTER FUNCTION "public"."validate_nfl_calendar"("season_year" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."award_votes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "award_id" "uuid",
    "user_id" "uuid",
    "vote_value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."award_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."awards" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "season_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "icon" "text",
    "category" "text",
    "winner_id" "text",
    "winner_info" "text",
    "voting_options" "jsonb",
    "display_order" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source" "text" DEFAULT 'ballot'::"text" NOT NULL,
    "award_type" "text",
    "winner_franchise_id" "uuid",
    "winner_team_id" "uuid",
    "value" numeric,
    "value_label" "text",
    "awarded_at" timestamp with time zone,
    CONSTRAINT "awards_category_check" CHECK ((("category" IS NULL) OR ("category" = ANY (ARRAY['voted'::"text", 'non-voted'::"text", 'standard'::"text", 'regular_season'::"text", 'dubious'::"text", 'advanced'::"text"])))),
    CONSTRAINT "awards_source_check" CHECK (("source" = ANY (ARRAY['ballot'::"text", 'computed'::"text"])))
);


ALTER TABLE "public"."awards" OWNER TO "postgres";


COMMENT ON COLUMN "public"."awards"."winner_id" IS 'Legacy free-text winner (an owner name). Prefer winner_franchise_id / winner_team_id.';



COMMENT ON COLUMN "public"."awards"."source" IS 'ballot = a league voting award (the old awards_2025 rows); computed = derived from game data by scripts/calculateSeasonAwards.js (the old season_awards rows).';



CREATE OR REPLACE VIEW "public"."awards_2025" WITH ("security_invoker"='true') AS
 SELECT "id",
    "season_id",
    "title",
    "description",
    "icon",
    "category",
    "winner_id",
    "winner_info",
    "voting_options",
    "display_order",
    "created_at",
    "updated_at"
   FROM "public"."awards"
  WHERE ("source" = 'ballot'::"text");


ALTER VIEW "public"."awards_2025" OWNER TO "postgres";


COMMENT ON VIEW "public"."awards_2025" IS 'DEPRECATED compat shim over public.awards (source = ballot). Repoint callers to awards and drop this.';



CREATE TABLE IF NOT EXISTS "public"."awards_metadata" (
    "season_id" "uuid" NOT NULL,
    "results_released" boolean DEFAULT false,
    "deadline" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "voting_open_to_all" boolean DEFAULT false
);


ALTER TABLE "public"."awards_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."divisions" (
    "id" integer NOT NULL,
    "season_id" "uuid",
    "name" character varying(100) DEFAULT 'Division'::character varying NOT NULL,
    "display_order" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."divisions" OWNER TO "postgres";


COMMENT ON TABLE "public"."divisions" IS 'Stores division configuration for seasons';



CREATE SEQUENCE IF NOT EXISTS "public"."divisions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."divisions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."divisions_id_seq" OWNED BY "public"."divisions"."id";



CREATE TABLE IF NOT EXISTS "public"."espn_matchups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT COALESCE("auth"."uid"(), '00000000-0000-0000-0000-000000000001'::"uuid"),
    "import_id" "uuid" NOT NULL,
    "espn_matchup_id" integer NOT NULL,
    "week" integer NOT NULL,
    "scoring_period_id" integer,
    "home_team_id" "uuid",
    "home_espn_team_id" integer NOT NULL,
    "home_team_name" "text" NOT NULL,
    "home_owner_id" "text",
    "home_owner_name" "text",
    "home_score" numeric(10,2) DEFAULT 0,
    "home_projected_score" numeric(10,2) DEFAULT 0,
    "away_team_id" "uuid",
    "away_espn_team_id" integer NOT NULL,
    "away_team_name" "text" NOT NULL,
    "away_owner_id" "text",
    "away_owner_name" "text",
    "away_score" numeric(10,2) DEFAULT 0,
    "away_projected_score" numeric(10,2) DEFAULT 0,
    "winner" "text" DEFAULT 'TIE'::"text",
    "status" "text" DEFAULT 'SCHEDULED'::"text",
    "is_playoff" boolean DEFAULT false,
    "playoff_tier_type" "text",
    "playoff_round" "text",
    "tiebreaker" "jsonb",
    "espn_raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "espn_matchups_status_check" CHECK (("status" = ANY (ARRAY['SCHEDULED'::"text", 'IN_PROGRESS'::"text", 'COMPLETED'::"text"]))),
    CONSTRAINT "espn_matchups_week_check" CHECK (("week" > 0)),
    CONSTRAINT "espn_matchups_winner_check" CHECK (("winner" = ANY (ARRAY['HOME'::"text", 'AWAY'::"text", 'TIE'::"text"])))
);


ALTER TABLE "public"."espn_matchups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."espn_schedule_imports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT COALESCE("auth"."uid"(), '00000000-0000-0000-0000-000000000001'::"uuid"),
    "espn_league_id" "text" NOT NULL,
    "season_year" integer NOT NULL,
    "league_name" "text",
    "team_count" integer,
    "total_matchups" integer,
    "regular_season_matchups" integer,
    "playoff_matchups" integer,
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "import_source" "text" DEFAULT 'espn_api'::"text",
    "raw_data" "jsonb",
    "assigned_season_id" "uuid",
    "assignment_status" "text" DEFAULT 'PENDING'::"text",
    "assigned_at" timestamp with time zone,
    "assigned_by" "uuid",
    "assignment_notes" "text",
    CONSTRAINT "espn_schedule_imports_assignment_status_check" CHECK (("assignment_status" = ANY (ARRAY['PENDING'::"text", 'ASSIGNED'::"text", 'REJECTED'::"text"])))
);


ALTER TABLE "public"."espn_schedule_imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."espn_teams" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT COALESCE("auth"."uid"(), '00000000-0000-0000-0000-000000000001'::"uuid"),
    "import_id" "uuid" NOT NULL,
    "espn_team_id" integer NOT NULL,
    "team_name" "text" NOT NULL,
    "abbreviation" "text",
    "location" "text",
    "nickname" "text",
    "owners" "jsonb" DEFAULT '[]'::"jsonb",
    "owner_id" "text",
    "owner_name" "text",
    "record" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."espn_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."franchise_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "franchise_id" "uuid" NOT NULL,
    "record_type" "text" NOT NULL,
    "record_category" "text" NOT NULL,
    "record_name" "text" NOT NULL,
    "value" numeric(12,2) NOT NULL,
    "value_label" "text",
    "season_id" "uuid",
    "week" integer,
    "game_id" "uuid",
    "set_date" timestamp with time zone NOT NULL,
    "previous_record_value" numeric(12,2),
    "previous_record_holder_id" "uuid",
    "is_current_record" boolean DEFAULT true,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."franchise_records" OWNER TO "postgres";


COMMENT ON TABLE "public"."franchise_records" IS 'Record book tracking single-game, single-season, career, and streak records for franchises.';



CREATE TABLE IF NOT EXISTS "public"."head_to_head_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "franchise1_id" "uuid" NOT NULL,
    "franchise2_id" "uuid" NOT NULL,
    "total_matchups" integer DEFAULT 0,
    "franchise1_wins" integer DEFAULT 0,
    "franchise2_wins" integer DEFAULT 0,
    "ties" integer DEFAULT 0,
    "regular_season_matchups" integer DEFAULT 0,
    "regular_season_franchise1_wins" integer DEFAULT 0,
    "regular_season_franchise2_wins" integer DEFAULT 0,
    "playoff_matchups" integer DEFAULT 0,
    "playoff_franchise1_wins" integer DEFAULT 0,
    "playoff_franchise2_wins" integer DEFAULT 0,
    "franchise1_total_points" numeric(12,2) DEFAULT 0,
    "franchise2_total_points" numeric(12,2) DEFAULT 0,
    "franchise1_avg_points" numeric(8,2),
    "franchise2_avg_points" numeric(8,2),
    "highest_scoring_game_id" "uuid",
    "largest_margin_game_id" "uuid",
    "current_streak_franchise_id" "uuid",
    "current_streak_length" integer DEFAULT 0,
    "longest_streak_franchise_id" "uuid",
    "longest_streak_length" integer DEFAULT 0,
    "last_calculated" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "head_to_head_records_check" CHECK (("franchise1_id" < "franchise2_id"))
);


ALTER TABLE "public"."head_to_head_records" OWNER TO "postgres";


COMMENT ON TABLE "public"."head_to_head_records" IS 'All-time head-to-head records between franchises across all seasons.';



CREATE TABLE IF NOT EXISTS "public"."historical_games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "week" integer NOT NULL,
    "team1_id" "uuid" NOT NULL,
    "team2_id" "uuid" NOT NULL,
    "team1_score" numeric(10,2),
    "team2_score" numeric(10,2),
    "type" "text" DEFAULT 'regular'::"text",
    "is_completed" boolean DEFAULT false,
    "winner_team_id" "uuid",
    "loser_team_id" "uuid",
    "is_tie" boolean DEFAULT false,
    "point_differential" numeric(10,2),
    "is_blowout" boolean DEFAULT false,
    "is_close" boolean DEFAULT false,
    "is_upset" boolean DEFAULT false,
    "espn_matchup_id" integer,
    "espn_scoring_period_id" integer,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "historical_games_check" CHECK (("team1_id" <> "team2_id"))
);


ALTER TABLE "public"."historical_games" OWNER TO "postgres";


COMMENT ON TABLE "public"."historical_games" IS 'Complete matchup history for all archived seasons.';



CREATE TABLE IF NOT EXISTS "public"."historical_rosters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "player_name" "text" NOT NULL,
    "espn_player_id" integer,
    "position" "text",
    "pro_team" "text",
    "acquisition_type" "text",
    "acquisition_week" integer,
    "acquisition_cost" numeric(10,2),
    "draft_round" integer,
    "draft_pick" integer,
    "added_date" timestamp with time zone,
    "dropped_date" timestamp with time zone,
    "is_keeper" boolean DEFAULT false,
    "total_points" numeric(10,2),
    "games_started" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."historical_rosters" OWNER TO "postgres";


COMMENT ON TABLE "public"."historical_rosters" IS 'Tracks roster moves, waiver acquisitions, draft picks across all seasons.';



CREATE TABLE IF NOT EXISTS "public"."historical_seasons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "name" "text" NOT NULL,
    "league_size" integer DEFAULT 14 NOT NULL,
    "regular_season_weeks" integer DEFAULT 14 NOT NULL,
    "playoff_weeks" integer DEFAULT 3 NOT NULL,
    "espn_league_id" "text",
    "scoring_type" "text",
    "stats" "jsonb" DEFAULT '{}'::"jsonb",
    "playoff_bracket" "jsonb",
    "imported_from_espn" boolean DEFAULT false,
    "espn_import_date" timestamp with time zone,
    "data_quality_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."historical_seasons" OWNER TO "postgres";


COMMENT ON TABLE "public"."historical_seasons" IS 'Archive of past fantasy seasons (2020-2024) separate from current live season.';



CREATE TABLE IF NOT EXISTS "public"."historical_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "franchise_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "team_name" "text" NOT NULL,
    "espn_team_id" integer,
    "division_name" "text",
    "regular_season_wins" integer DEFAULT 0,
    "regular_season_losses" integer DEFAULT 0,
    "regular_season_ties" integer DEFAULT 0,
    "regular_season_win_percentage" numeric(5,4),
    "made_playoffs" boolean DEFAULT false,
    "playoff_seed" integer,
    "playoff_wins" integer DEFAULT 0,
    "playoff_losses" integer DEFAULT 0,
    "playoff_finish" "text",
    "points_for" numeric(10,2) DEFAULT 0,
    "points_against" numeric(10,2) DEFAULT 0,
    "point_differential" numeric(10,2),
    "average_points_per_game" numeric(8,2),
    "strength_of_schedule" numeric(5,4),
    "power_rating" numeric(8,2),
    "final_rank" integer,
    "season_stats" "jsonb" DEFAULT '{}'::"jsonb",
    "draft_picks" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."historical_teams" OWNER TO "postgres";


COMMENT ON TABLE "public"."historical_teams" IS 'Team data for each franchise per season. Links franchises to their season-specific performance.';



CREATE TABLE IF NOT EXISTS "public"."league_franchises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_name" "text" NOT NULL,
    "display_name" "text",
    "email" "text",
    "joined_year" integer NOT NULL,
    "left_year" integer,
    "is_active" boolean DEFAULT true,
    "total_seasons" integer DEFAULT 0,
    "total_championships" integer DEFAULT 0,
    "total_playoff_appearances" integer DEFAULT 0,
    "total_regular_season_wins" integer DEFAULT 0,
    "total_regular_season_losses" integer DEFAULT 0,
    "total_points_for" numeric(10,2) DEFAULT 0,
    "total_points_against" numeric(10,2) DEFAULT 0,
    "career_win_percentage" numeric(5,4),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."league_franchises" OWNER TO "postgres";


COMMENT ON TABLE "public"."league_franchises" IS 'Tracks fantasy football owners/franchises across multiple seasons. Owner names are the stable identifier.';



CREATE MATERIALIZED VIEW "public"."mv_franchise_career_stats" AS
 SELECT "f"."id" AS "franchise_id",
    "f"."owner_name",
    "f"."display_name",
    "count"(DISTINCT "ht"."season_id") AS "seasons_played",
    "sum"("ht"."regular_season_wins") AS "total_wins",
    "sum"("ht"."regular_season_losses") AS "total_losses",
    "sum"("ht"."regular_season_ties") AS "total_ties",
    "round"("avg"("ht"."regular_season_win_percentage"), 4) AS "avg_win_percentage",
    "count"(*) FILTER (WHERE ("ht"."made_playoffs" = true)) AS "playoff_appearances",
    "count"(*) FILTER (WHERE ("ht"."playoff_finish" = 'champion'::"text")) AS "championships",
    "count"(*) FILTER (WHERE ("ht"."playoff_finish" = '2nd'::"text")) AS "runner_ups",
    "sum"("ht"."points_for") AS "career_points_for",
    "sum"("ht"."points_against") AS "career_points_against",
    "sum"("ht"."point_differential") AS "career_point_differential",
    "round"("avg"("ht"."average_points_per_game"), 2) AS "avg_points_per_game",
    "round"("avg"("ht"."final_rank"), 2) AS "avg_final_rank",
    "min"("ht"."final_rank") AS "best_finish",
    "max"("ht"."final_rank") AS "worst_finish",
    "now"() AS "calculated_at"
   FROM ("public"."league_franchises" "f"
     LEFT JOIN "public"."historical_teams" "ht" ON (("f"."id" = "ht"."franchise_id")))
  GROUP BY "f"."id", "f"."owner_name", "f"."display_name"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."mv_franchise_career_stats" OWNER TO "postgres";


COMMENT ON MATERIALIZED VIEW "public"."mv_franchise_career_stats" IS 'Pre-calculated career statistics for each franchise. Refresh with refresh_league_history_views().';



CREATE MATERIALIZED VIEW "public"."mv_season_leaderboards" AS
 SELECT "id" AS "season_id",
    "year",
    ( SELECT "jsonb_build_object"('franchise_id', "ht"."franchise_id", 'team_name', "ht"."team_name", 'wins', "ht"."regular_season_wins", 'losses', "ht"."regular_season_losses") AS "jsonb_build_object"
           FROM "public"."historical_teams" "ht"
          WHERE ("ht"."season_id" = "hs"."id")
          ORDER BY "ht"."regular_season_wins" DESC, "ht"."points_for" DESC
         LIMIT 1) AS "best_record",
    ( SELECT "jsonb_build_object"('franchise_id', "ht"."franchise_id", 'team_name', "ht"."team_name", 'points', "ht"."points_for") AS "jsonb_build_object"
           FROM "public"."historical_teams" "ht"
          WHERE ("ht"."season_id" = "hs"."id")
          ORDER BY "ht"."points_for" DESC
         LIMIT 1) AS "highest_scorer",
    ( SELECT "jsonb_build_object"('franchise_id', "ht"."franchise_id", 'team_name', "ht"."team_name", 'seed', "ht"."playoff_seed") AS "jsonb_build_object"
           FROM "public"."historical_teams" "ht"
          WHERE (("ht"."season_id" = "hs"."id") AND ("ht"."playoff_finish" = 'champion'::"text"))
         LIMIT 1) AS "champion",
    "now"() AS "calculated_at"
   FROM "public"."historical_seasons" "hs"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."mv_season_leaderboards" OWNER TO "postgres";


COMMENT ON MATERIALIZED VIEW "public"."mv_season_leaderboards" IS 'Pre-calculated leaderboards for each historical season. Refresh with refresh_league_history_views().';



CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "franchise_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "owner_name" "text" NOT NULL,
    "espn_team_id" integer,
    "free_agent_adds" integer DEFAULT 0,
    "waiver_claims" integer DEFAULT 0,
    "trades" integer DEFAULT 0,
    "drops" integer DEFAULT 0,
    "faab_spent" numeric(10,2) DEFAULT 0,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "total_transactions" integer GENERATED ALWAYS AS ((((COALESCE("free_agent_adds", 0) + COALESCE("waiver_claims", 0)) + COALESCE("trades", 0)) + COALESCE("drops", 0))) STORED
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."transactions" IS 'Tracks aggregate transaction counts (waivers, trades, FA pickups, drops) per team per season from ESPN API.';



COMMENT ON COLUMN "public"."transactions"."free_agent_adds" IS 'Number of free agent acquisitions (FREEAGENT type from ESPN)';



COMMENT ON COLUMN "public"."transactions"."waiver_claims" IS 'Number of waiver claims (WAIVER type from ESPN)';



COMMENT ON COLUMN "public"."transactions"."trades" IS 'Number of completed trades (TRADE_ACCEPT type from ESPN)';



COMMENT ON COLUMN "public"."transactions"."drops" IS 'Number of player drops (DROP type from ESPN)';



COMMENT ON COLUMN "public"."transactions"."faab_spent" IS 'Total Free Agent Acquisition Budget spent on waiver claims';



CREATE MATERIALIZED VIEW "public"."mv_transaction_leaderboards" AS
 SELECT "tt"."franchise_id",
    "lf"."owner_name",
    "lf"."display_name",
    "sum"("tt"."free_agent_adds") AS "total_free_agent_adds",
    "sum"("tt"."waiver_claims") AS "total_waiver_claims",
    "sum"("tt"."trades") AS "total_trades",
    "sum"("tt"."drops") AS "total_drops",
    "sum"("tt"."total_transactions") AS "total_all_transactions",
    "sum"("tt"."faab_spent") AS "total_faab_spent",
    "round"("avg"("tt"."total_transactions"), 1) AS "avg_transactions_per_season",
    "round"("avg"("tt"."waiver_claims"), 1) AS "avg_waivers_per_season",
    "count"("tt"."season_id") AS "seasons_tracked",
    "max"("tt"."total_transactions") AS "most_active_season_transactions",
    "min"("tt"."total_transactions") AS "least_active_season_transactions",
    "now"() AS "calculated_at"
   FROM ("public"."transactions" "tt"
     JOIN "public"."league_franchises" "lf" ON (("tt"."franchise_id" = "lf"."id")))
  GROUP BY "tt"."franchise_id", "lf"."owner_name", "lf"."display_name"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."mv_transaction_leaderboards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nfl_week_calendar" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "season_year" integer NOT NULL,
    "week_number" integer NOT NULL,
    "week_start_date" "date" NOT NULL,
    "week_end_date" "date" NOT NULL,
    "snapshot_trigger_time" timestamp with time zone NOT NULL,
    "is_playoff_week" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nfl_week_calendar" OWNER TO "postgres";


COMMENT ON TABLE "public"."nfl_week_calendar" IS 'NFL week calendar defining when power rankings snapshots should be automatically triggered';



CREATE TABLE IF NOT EXISTS "public"."pick_em_results" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "pick_em_week_id" "uuid" NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "is_correct" boolean NOT NULL,
    "points_earned" integer DEFAULT 0,
    "actual_winner_team_id" "uuid",
    "calculated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pick_em_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pick_em_season_standings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "total_weeks_participated" integer DEFAULT 0,
    "total_picks" integer DEFAULT 0,
    "total_correct_picks" integer DEFAULT 0,
    "total_points" integer DEFAULT 0,
    "overall_accuracy_percentage" numeric(5,2) DEFAULT 0,
    "season_rank" integer,
    "current_streak" integer DEFAULT 0,
    "longest_streak" integer DEFAULT 0,
    "perfect_weeks" integer DEFAULT 0,
    "last_updated" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pick_em_season_standings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pick_em_submissions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "pick_em_week_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "predicted_winner_team_id" "uuid" NOT NULL,
    "confidence_level" integer DEFAULT 1,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pick_em_submissions_confidence_level_check" CHECK ((("confidence_level" >= 1) AND ("confidence_level" <= 10)))
);


ALTER TABLE "public"."pick_em_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pick_em_submissions_backup" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pick_em_week_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "predicted_winner_team_id" "uuid" NOT NULL,
    "confidence_level" integer DEFAULT 1,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "backup_created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "operation_type" "text" DEFAULT 'INSERT'::"text" NOT NULL,
    "original_record_id" "uuid",
    "backup_metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."pick_em_submissions_backup" OWNER TO "postgres";


COMMENT ON TABLE "public"."pick_em_submissions_backup" IS 'Automatic backup of all pick_em_submissions operations. This table has no foreign key constraints and will preserve data even if original records are deleted.';



CREATE TABLE IF NOT EXISTS "public"."pick_em_weekly_scores" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "pick_em_week_id" "uuid" NOT NULL,
    "total_picks" integer DEFAULT 0,
    "correct_picks" integer DEFAULT 0,
    "total_points" integer DEFAULT 0,
    "accuracy_percentage" numeric(5,2) DEFAULT 0,
    "weekly_rank" integer,
    "calculated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pick_em_weekly_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pick_em_weeks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "submission_opens_at" timestamp with time zone NOT NULL,
    "submission_closes_at" timestamp with time zone NOT NULL,
    "results_reveal_at" timestamp with time zone NOT NULL,
    "is_active" boolean DEFAULT false,
    "is_closed" boolean DEFAULT false,
    "is_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pick_em_weeks_valid_reveal" CHECK (("submission_closes_at" < "results_reveal_at")),
    CONSTRAINT "pick_em_weeks_valid_window" CHECK (("submission_opens_at" < "submission_closes_at")),
    CONSTRAINT "pick_em_weeks_week_number_check" CHECK (("week_number" > 0))
);


ALTER TABLE "public"."pick_em_weeks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "espn_player_id" integer,
    "name" "text" NOT NULL,
    "position" "text" NOT NULL,
    "team_abbreviation" "text",
    "jersey_number" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "espn_data" "jsonb" DEFAULT '{}'::"jsonb",
    "projected_points" numeric(10,2) DEFAULT 0,
    "actual_points" numeric(10,2) DEFAULT 0,
    "season_projected_points" numeric(10,2) DEFAULT 0,
    "season_actual_points" numeric(10,2) DEFAULT 0,
    "games_played" integer DEFAULT 0,
    "average_points_per_game" numeric(8,2) DEFAULT 0,
    "projected_average" numeric(8,2) DEFAULT 0,
    "injury_status" "text" DEFAULT 'ACTIVE'::"text",
    "percent_owned" numeric(5,2) DEFAULT 0,
    "percent_started" numeric(5,2) DEFAULT 0,
    "pro_team_id" integer,
    "pro_team_name" "text",
    "last_stats_sync" timestamp with time zone,
    "espn_last_updated" timestamp with time zone,
    "ffanalytics_player_id" character varying(100),
    "ffanalytics_last_sync" timestamp with time zone,
    "weekly_rank" integer,
    "position_rank" integer,
    "trend_score" numeric(5,2) DEFAULT 0,
    "consistency_rating" numeric(3,2) DEFAULT 0,
    "ceiling_score" numeric(6,2) DEFAULT 0,
    "floor_score" numeric(6,2) DEFAULT 0,
    "ffanalytics_data" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "players_consistency_rating_range" CHECK ((("consistency_rating" >= (0)::numeric) AND ("consistency_rating" <= (1)::numeric))),
    CONSTRAINT "players_injury_status_check" CHECK (("injury_status" = ANY (ARRAY['ACTIVE'::"text", 'QUESTIONABLE'::"text", 'DOUBTFUL'::"text", 'OUT'::"text", 'IR'::"text", 'SUSPENDED'::"text", 'PUP'::"text"]))),
    CONSTRAINT "players_name_check" CHECK (("length"("name") > 0)),
    CONSTRAINT "players_position_check" CHECK (("position" = ANY (ARRAY['QB'::"text", 'RB'::"text", 'WR'::"text", 'TE'::"text", 'K'::"text", 'D/ST'::"text", 'DL'::"text", 'LB'::"text", 'DB'::"text"]))),
    CONSTRAINT "players_position_rank_positive" CHECK (("position_rank" > 0)),
    CONSTRAINT "players_trend_score_range" CHECK ((("trend_score" >= ('-100'::integer)::numeric) AND ("trend_score" <= (100)::numeric))),
    CONSTRAINT "players_weekly_rank_positive" CHECK (("weekly_rank" > 0))
);


ALTER TABLE "public"."players" OWNER TO "postgres";


COMMENT ON COLUMN "public"."players"."season_projected_points" IS 'Total projected fantasy points for player this season';



COMMENT ON COLUMN "public"."players"."season_actual_points" IS 'Total fantasy points scored by player this season';



COMMENT ON COLUMN "public"."players"."ffanalytics_player_id" IS 'Unique identifier from ffanalytics package for player matching';



COMMENT ON COLUMN "public"."players"."ffanalytics_last_sync" IS 'Timestamp of last successful sync with ffanalytics data';



COMMENT ON COLUMN "public"."players"."weekly_rank" IS 'Current week overall fantasy ranking from ffanalytics';



COMMENT ON COLUMN "public"."players"."position_rank" IS 'Current week position-specific ranking from ffanalytics';



COMMENT ON COLUMN "public"."players"."trend_score" IS 'Player performance trend score (-100 to 100, higher is better)';



COMMENT ON COLUMN "public"."players"."consistency_rating" IS 'Player consistency rating (0 to 1, higher is more consistent)';



COMMENT ON COLUMN "public"."players"."ceiling_score" IS 'Player projected ceiling score from ffanalytics';



COMMENT ON COLUMN "public"."players"."floor_score" IS 'Player projected floor score from ffanalytics';



COMMENT ON COLUMN "public"."players"."ffanalytics_data" IS 'Raw ffanalytics data in JSON format for additional metrics';



CREATE TABLE IF NOT EXISTS "public"."playoff_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "submission_deadline" timestamp with time zone DEFAULT '2025-12-13 01:15:00+00'::timestamp with time zone NOT NULL,
    "results_released" boolean DEFAULT false,
    "bracket_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."playoff_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."playoff_picks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "matchup_id" "text" NOT NULL,
    "game_id" "uuid",
    "predicted_winner_team_id" "uuid" NOT NULL,
    "actual_winner_team_id" "uuid",
    "is_correct" boolean,
    "points_earned" integer DEFAULT 0,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "championship_point_total" double precision
);


ALTER TABLE "public"."playoff_picks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."playoff_picks"."championship_point_total" IS 'Championship combined point total prediction (3 bonus points for closest prediction)';



CREATE OR REPLACE VIEW "public"."playoffs_2025" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "season_id",
    "matchup_id",
    "game_id",
    "predicted_winner_team_id",
    "actual_winner_team_id",
    "is_correct",
    "points_earned",
    "submitted_at",
    "updated_at",
    "championship_point_total"
   FROM "public"."playoff_picks";


ALTER VIEW "public"."playoffs_2025" OWNER TO "postgres";


COMMENT ON VIEW "public"."playoffs_2025" IS 'DEPRECATED compat shim over public.playoff_picks.';



CREATE OR REPLACE VIEW "public"."playoffs_2025_config" WITH ("security_invoker"='true') AS
 SELECT "id",
    "season_id",
    "submission_deadline",
    "results_released",
    "bracket_data",
    "created_at",
    "updated_at"
   FROM "public"."playoff_config";


ALTER VIEW "public"."playoffs_2025_config" OWNER TO "postgres";


COMMENT ON VIEW "public"."playoffs_2025_config" IS 'DEPRECATED compat shim over public.playoff_config.';



CREATE TABLE IF NOT EXISTS "public"."power_rankings_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "season_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "team_id" "uuid" NOT NULL,
    "rank" integer NOT NULL,
    "power_rating" numeric(10,4) NOT NULL,
    "performance_score" numeric(10,4),
    "team_strength" numeric(10,4),
    "strength_of_schedule" numeric(10,4),
    "momentum_score" numeric(10,4),
    "consistency_score" numeric(10,4),
    "injury_score" numeric(10,4),
    "clutch_score" numeric(10,4),
    "all_play_win_pct" numeric(10,4),
    "wins" integer DEFAULT 0,
    "losses" integer DEFAULT 0,
    "ties" integer DEFAULT 0,
    "points_for" numeric(10,2) DEFAULT 0,
    "points_against" numeric(10,2) DEFAULT 0,
    "win_percentage" numeric(5,4) DEFAULT 0,
    "point_differential" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "snapshot_type" "text" DEFAULT 'weekly'::"text",
    CONSTRAINT "power_rankings_history_snapshot_type_check" CHECK (("snapshot_type" = ANY (ARRAY['weekly'::"text", 'manual'::"text", 'season_end'::"text"])))
);


ALTER TABLE "public"."power_rankings_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."power_rankings_history" IS 'Stores historical snapshots of power rankings for each week, including all component scores and team stats at the time of snapshot';



CREATE TABLE IF NOT EXISTS "public"."roster_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "transaction_week" integer NOT NULL,
    "transaction_date" timestamp with time zone DEFAULT "now"(),
    "trade_partner_team_id" "uuid",
    "trade_id" "uuid",
    "waiver_priority" integer,
    "faab_bid" integer,
    "notes" "text",
    "espn_transaction_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "roster_history_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['add'::"text", 'drop'::"text", 'trade'::"text", 'draft'::"text", 'waiver_claim'::"text", 'free_agent_pickup'::"text"])))
);


ALTER TABLE "public"."roster_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rosters" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "roster_slot" "text",
    "added_date" timestamp with time zone DEFAULT "now"(),
    "is_keeper" boolean DEFAULT false,
    "keeper_round" integer,
    "acquisition_type" "text" DEFAULT 'draft'::"text",
    "acquisition_week" integer,
    "cost" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "points_when_rostered" numeric(10,2) DEFAULT 0,
    "projected_when_rostered" numeric(10,2) DEFAULT 0,
    CONSTRAINT "rosters_acquisition_type_check" CHECK (("acquisition_type" = ANY (ARRAY['draft'::"text", 'waiver'::"text", 'trade'::"text", 'free_agent'::"text", 'keeper'::"text"]))),
    CONSTRAINT "rosters_roster_slot_check" CHECK (("roster_slot" = ANY (ARRAY['QB'::"text", 'RB'::"text", 'WR'::"text", 'TE'::"text", 'FLEX'::"text", 'K'::"text", 'D/ST'::"text", 'BE'::"text", 'IR'::"text", 'TAXI'::"text"])))
);


ALTER TABLE "public"."rosters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "season_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "owner" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "wins" integer DEFAULT 0,
    "losses" integer DEFAULT 0,
    "ties" integer DEFAULT 0,
    "points_for" numeric(10,2) DEFAULT 0,
    "points_against" numeric(10,2) DEFAULT 0,
    "win_percentage" numeric(5,4) DEFAULT 0,
    "point_differential" numeric(10,2) DEFAULT 0,
    "average_points_for" numeric(10,2) DEFAULT 0,
    "average_points_against" numeric(10,2) DEFAULT 0,
    "strength_of_schedule" numeric(5,4) DEFAULT 0,
    "opponent_win_percentage" numeric(5,4) DEFAULT 0,
    "quality_wins" integer DEFAULT 0,
    "bad_losses" integer DEFAULT 0,
    "blowout_wins" integer DEFAULT 0,
    "close_wins" integer DEFAULT 0,
    "close_losses" integer DEFAULT 0,
    "recent_form" numeric(5,2) DEFAULT 0,
    "current_streak" "jsonb" DEFAULT '{"type": "none", "length": 0}'::"jsonb",
    "power_rating" numeric(10,4) DEFAULT 0,
    "previous_rank" integer,
    "rank_change" integer DEFAULT 0,
    "espn_team_id" integer,
    "last_roster_sync" timestamp with time zone,
    "roster" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "roster_total_projected_points" numeric(12,2) DEFAULT 0,
    "roster_total_actual_points" numeric(12,2) DEFAULT 0,
    "starter_projected_points" numeric(12,2) DEFAULT 0,
    "starter_actual_points" numeric(12,2) DEFAULT 0,
    "bench_projected_points" numeric(12,2) DEFAULT 0,
    "bench_actual_points" numeric(12,2) DEFAULT 0,
    "position_strengths" "jsonb" DEFAULT '{"K": {"rank": 0, "actual": 0, "projected": 0}, "QB": {"rank": 0, "actual": 0, "projected": 0}, "RB": {"rank": 0, "actual": 0, "projected": 0}, "TE": {"rank": 0, "actual": 0, "projected": 0}, "WR": {"rank": 0, "actual": 0, "projected": 0}, "D/ST": {"rank": 0, "actual": 0, "projected": 0}}'::"jsonb",
    "division_id" integer,
    "franchise_id" "uuid",
    "made_playoffs" boolean,
    "playoff_seed" integer,
    "playoff_wins" integer,
    "playoff_losses" integer,
    "playoff_finish" "text",
    "final_rank" integer,
    "season_stats" "jsonb",
    "draft_picks" "jsonb",
    CONSTRAINT "teams_name_check" CHECK (("length"("name") > 0))
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


COMMENT ON COLUMN "public"."teams"."espn_team_id" IS 'ESPN team ID used for roster synchronization with ESPN API';



COMMENT ON COLUMN "public"."teams"."last_roster_sync" IS 'Timestamp of the last roster synchronization with ESPN API';



COMMENT ON COLUMN "public"."teams"."roster" IS 'Current roster data stored as JSON from ESPN API';



COMMENT ON COLUMN "public"."teams"."updated_at" IS 'Timestamp when the team record was last updated';



COMMENT ON COLUMN "public"."teams"."position_strengths" IS 'JSONB object tracking projected/actual points and league rank by position group';



COMMENT ON COLUMN "public"."teams"."division_id" IS 'Reference to the division this team belongs to';



CREATE OR REPLACE VIEW "public"."roster_stats" WITH ("security_invoker"='true') AS
 SELECT "t"."season_id",
    "t"."id" AS "team_id",
    "t"."name" AS "team_name",
    "count"("r"."id") AS "total_players",
    "count"(
        CASE
            WHEN (("r"."roster_slot" <> 'BE'::"text") AND ("r"."roster_slot" <> 'IR'::"text")) THEN 1
            ELSE NULL::integer
        END) AS "starting_players",
    "count"(
        CASE
            WHEN ("r"."roster_slot" = 'BE'::"text") THEN 1
            ELSE NULL::integer
        END) AS "bench_players",
    "count"(
        CASE
            WHEN ("r"."roster_slot" = 'IR'::"text") THEN 1
            ELSE NULL::integer
        END) AS "ir_players",
    "max"("r"."added_date") AS "last_roster_move"
   FROM ("public"."teams" "t"
     LEFT JOIN "public"."rosters" "r" ON (("t"."id" = "r"."team_id")))
  GROUP BY "t"."season_id", "t"."id", "t"."name";


ALTER VIEW "public"."roster_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."season_awards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "franchise_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "award_category" "text" NOT NULL,
    "award_type" "text" NOT NULL,
    "award_name" "text" NOT NULL,
    "value" numeric(12,2),
    "value_label" "text",
    "description" "text",
    "notes" "text",
    "awarded_date" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."season_awards" OWNER TO "postgres";


COMMENT ON TABLE "public"."season_awards" IS 'Championships, achievements, and honors awarded each season (standard, regular season, dubious, advanced).';



CREATE TABLE IF NOT EXISTS "public"."seasons" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "year" integer NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "league_size" integer DEFAULT 14 NOT NULL,
    "regular_season_weeks" integer DEFAULT 14 NOT NULL,
    "playoff_weeks" integer DEFAULT 3 NOT NULL,
    "total_weeks" integer GENERATED ALWAYS AS (("regular_season_weeks" + "playoff_weeks")) STORED,
    "is_active" boolean DEFAULT false NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "stats" "jsonb" DEFAULT '{}'::"jsonb",
    "playoff_bracket" "jsonb",
    "start_date" "date",
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "espn_league_id" "text",
    "espn_season_year" integer,
    "awards_release_at" timestamp with time zone,
    "pickem_open_offset_days" integer DEFAULT 0 NOT NULL,
    "pickem_open_time" time without time zone DEFAULT '04:00:00'::time without time zone NOT NULL,
    "pickem_close_offset_days" integer DEFAULT 2 NOT NULL,
    "pickem_close_time" time without time zone DEFAULT '20:00:00'::time without time zone NOT NULL,
    "pickem_reveal_offset_days" integer DEFAULT 7 NOT NULL,
    "pickem_reveal_time" time without time zone DEFAULT '12:00:00'::time without time zone NOT NULL,
    "status" "text" GENERATED ALWAYS AS (
CASE
    WHEN COALESCE("is_completed", false) THEN 'archived'::"text"
    WHEN COALESCE("is_active", false) THEN 'active'::"text"
    ELSE 'upcoming'::"text"
END) STORED,
    "scoring_type" "text",
    CONSTRAINT "seasons_league_size_check" CHECK (("league_size" >= 4)),
    CONSTRAINT "seasons_playoff_weeks_check" CHECK (("playoff_weeks" >= 0)),
    CONSTRAINT "seasons_regular_season_weeks_check" CHECK (("regular_season_weeks" > 0))
);


ALTER TABLE "public"."seasons" OWNER TO "postgres";


COMMENT ON COLUMN "public"."seasons"."start_date" IS 'First day of fantasy week 1 (a Tuesday). Sole source for all week math.';



COMMENT ON COLUMN "public"."seasons"."timezone" IS 'IANA zone that all season-relative wall-clock times resolve in.';



COMMENT ON COLUMN "public"."seasons"."pickem_close_offset_days" IS 'Days after the week start that pick''ems close. 2 = Thursday.';



COMMENT ON COLUMN "public"."seasons"."status" IS 'archived | active | upcoming. Derived from is_completed/is_active; use this instead of comparing season.year to a literal.';



CREATE TABLE IF NOT EXISTS "public"."sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "trigger" "text" DEFAULT 'cron'::"text" NOT NULL,
    "steps" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "duration_ms" integer GENERATED ALWAYS AS (
CASE
    WHEN ("finished_at" IS NULL) THEN NULL::integer
    ELSE ((EXTRACT(epoch FROM ("finished_at" - "started_at")) * (1000)::numeric))::integer
END) STORED,
    CONSTRAINT "sync_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'success'::"text", 'failed'::"text"]))),
    CONSTRAINT "sync_runs_trigger_check" CHECK (("trigger" = ANY (ARRAY['cron'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."sync_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."sync_runs" IS 'One row per weekly ESPN sync run. Written only by scripts/sync-week.js.';



CREATE OR REPLACE VIEW "public"."team_transactions" WITH ("security_invoker"='true') AS
 SELECT "id",
    "franchise_id",
    "season_id",
    "owner_name",
    "espn_team_id",
    "free_agent_adds",
    "waiver_claims",
    "trades",
    "drops",
    "total_transactions",
    "faab_spent",
    "last_synced_at",
    "created_at",
    "updated_at"
   FROM "public"."transactions";


ALTER VIEW "public"."team_transactions" OWNER TO "postgres";


COMMENT ON VIEW "public"."team_transactions" IS 'DEPRECATED compat shim over public.transactions.';



CREATE OR REPLACE VIEW "public"."transactions_2025" WITH ("security_invoker"='true') AS
 SELECT "t"."id",
    "t"."team_id",
    "t"."owner_name",
    "t"."espn_team_id",
    "t"."free_agent_adds",
    "t"."waiver_claims",
    "t"."trades",
    "t"."drops",
    "t"."faab_spent",
    "t"."last_synced_at",
    "t"."created_at",
    "t"."updated_at"
   FROM ("public"."transactions" "t"
     JOIN "public"."seasons" "s" ON (("s"."id" = "t"."season_id")))
  WHERE "s"."is_active";


ALTER VIEW "public"."transactions_2025" OWNER TO "postgres";


COMMENT ON VIEW "public"."transactions_2025" IS 'DEPRECATED compat shim: transactions for whichever season is active. Read-only.';



CREATE TABLE IF NOT EXISTS "public"."transactions_2025_legacy" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "owner_name" "text" NOT NULL,
    "espn_team_id" integer,
    "free_agent_adds" integer DEFAULT 0,
    "waiver_claims" integer DEFAULT 0,
    "trades" integer DEFAULT 0,
    "drops" integer DEFAULT 0,
    "faab_spent" numeric(10,2) DEFAULT 0,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."transactions_2025_legacy" OWNER TO "postgres";


COMMENT ON TABLE "public"."transactions_2025_legacy" IS 'Transaction counts for the 2025 current season, updated weekly via weeklyUpdate.js';



CREATE OR REPLACE VIEW "public"."v_active_season" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "year",
    "name",
    "league_size",
    "regular_season_weeks",
    "playoff_weeks",
    "total_weeks",
    "is_active",
    "is_completed",
    "created_at",
    "completed_at",
    "stats",
    "playoff_bracket",
    "start_date",
    "timezone",
    "espn_league_id",
    "espn_season_year",
    "awards_release_at",
    "pickem_open_offset_days",
    "pickem_open_time",
    "pickem_close_offset_days",
    "pickem_close_time",
    "pickem_reveal_offset_days",
    "pickem_reveal_time",
    "status",
    COALESCE("total_weeks", ("regular_season_weeks" + "playoff_weeks")) AS "week_count",
    ("regular_season_weeks" + 1) AS "playoff_start_week",
    "public"."season_current_week"("id") AS "current_week"
   FROM "public"."seasons" "s"
  WHERE "is_active";


ALTER VIEW "public"."v_active_season" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_active_season" IS 'The active season plus derived week bounds. Single source for client-side season config.';



CREATE OR REPLACE VIEW "public"."v_game_results" WITH ("security_invoker"='true') AS
 SELECT "g"."id" AS "game_id",
    "g"."season_id",
    "g"."week",
    "g"."type",
    "g"."completed_at",
    ("g"."type" = 'regular'::"text") AS "is_regular",
    ("g"."type" ~~ 'playoff%'::"text") AS "is_playoff",
    "g"."team1_id" AS "team_id",
    "g"."team2_id" AS "opponent_id",
    "g"."team1_score" AS "points_for",
    "g"."team2_score" AS "points_against",
        CASE
            WHEN ("g"."team1_score" > "g"."team2_score") THEN 'W'::"text"
            WHEN ("g"."team1_score" < "g"."team2_score") THEN 'L'::"text"
            ELSE 'T'::"text"
        END AS "result"
   FROM "public"."games" "g"
  WHERE (("g"."team2_id" IS NOT NULL) AND ("g"."team1_score" IS NOT NULL) AND ("g"."team2_score" IS NOT NULL))
UNION ALL
 SELECT "g"."id" AS "game_id",
    "g"."season_id",
    "g"."week",
    "g"."type",
    "g"."completed_at",
    ("g"."type" = 'regular'::"text") AS "is_regular",
    ("g"."type" ~~ 'playoff%'::"text") AS "is_playoff",
    "g"."team2_id" AS "team_id",
    "g"."team1_id" AS "opponent_id",
    "g"."team2_score" AS "points_for",
    "g"."team1_score" AS "points_against",
        CASE
            WHEN ("g"."team2_score" > "g"."team1_score") THEN 'W'::"text"
            WHEN ("g"."team2_score" < "g"."team1_score") THEN 'L'::"text"
            ELSE 'T'::"text"
        END AS "result"
   FROM "public"."games" "g"
  WHERE (("g"."team2_id" IS NOT NULL) AND ("g"."team1_score" IS NOT NULL) AND ("g"."team2_score" IS NOT NULL));


ALTER VIEW "public"."v_game_results" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_game_results" IS 'One row per (completed game, team). Base for every standings/career/H2H view.';



CREATE OR REPLACE VIEW "public"."v_team_standings" WITH ("security_invoker"='true') AS
 SELECT "t"."id" AS "team_id",
    "t"."season_id",
    "s"."year" AS "season_year",
    "s"."status" AS "season_status",
    "t"."franchise_id",
    "t"."name" AS "team_name",
    "t"."owner" AS "owner_name",
    "t"."division_id",
    "count"(*) FILTER (WHERE "r"."is_regular") AS "games_played",
    "count"(*) FILTER (WHERE ("r"."is_regular" AND ("r"."result" = 'W'::"text"))) AS "wins",
    "count"(*) FILTER (WHERE ("r"."is_regular" AND ("r"."result" = 'L'::"text"))) AS "losses",
    "count"(*) FILTER (WHERE ("r"."is_regular" AND ("r"."result" = 'T'::"text"))) AS "ties",
    "round"(((("count"(*) FILTER (WHERE ("r"."is_regular" AND ("r"."result" = 'W'::"text"))))::numeric + (0.5 * ("count"(*) FILTER (WHERE ("r"."is_regular" AND ("r"."result" = 'T'::"text"))))::numeric)) / (NULLIF("count"(*) FILTER (WHERE "r"."is_regular"), 0))::numeric), 4) AS "win_percentage",
    COALESCE("sum"("r"."points_for") FILTER (WHERE "r"."is_regular"), (0)::numeric) AS "points_for",
    COALESCE("sum"("r"."points_against") FILTER (WHERE "r"."is_regular"), (0)::numeric) AS "points_against",
    (COALESCE("sum"("r"."points_for") FILTER (WHERE "r"."is_regular"), (0)::numeric) - COALESCE("sum"("r"."points_against") FILTER (WHERE "r"."is_regular"), (0)::numeric)) AS "point_differential",
    "round"("avg"("r"."points_for") FILTER (WHERE "r"."is_regular"), 2) AS "average_points_for",
    "round"("avg"("r"."points_against") FILTER (WHERE "r"."is_regular"), 2) AS "average_points_against",
    "max"("r"."points_for") FILTER (WHERE "r"."is_regular") AS "best_week",
    "min"("r"."points_for") FILTER (WHERE "r"."is_regular") AS "worst_week",
    "count"(*) FILTER (WHERE ("r"."is_playoff" AND ("r"."result" = 'W'::"text"))) AS "playoff_wins_played",
    "count"(*) FILTER (WHERE ("r"."is_playoff" AND ("r"."result" = 'L'::"text"))) AS "playoff_losses_played",
    "t"."made_playoffs",
    "t"."playoff_seed",
    "t"."playoff_finish",
    "t"."final_rank",
    COALESCE("streak"."result", 'none'::"text") AS "streak_type",
    COALESCE("streak"."len", (0)::bigint) AS "streak_length"
   FROM ((("public"."teams" "t"
     JOIN "public"."seasons" "s" ON (("s"."id" = "t"."season_id")))
     LEFT JOIN "public"."v_game_results" "r" ON (("r"."team_id" = "t"."id")))
     LEFT JOIN LATERAL ( SELECT "run"."result",
            "count"(*) AS "len"
           FROM ( SELECT "r2"."result",
                    ("row_number"() OVER (ORDER BY "r2"."week" DESC) - "row_number"() OVER (PARTITION BY "r2"."result" ORDER BY "r2"."week" DESC)) AS "grp"
                   FROM "public"."v_game_results" "r2"
                  WHERE (("r2"."team_id" = "t"."id") AND "r2"."is_regular")) "run"
          WHERE ("run"."grp" = 0)
          GROUP BY "run"."result") "streak" ON (true))
  GROUP BY "t"."id", "t"."season_id", "s"."year", "s"."status", "t"."franchise_id", "t"."name", "t"."owner", "t"."division_id", "t"."made_playoffs", "t"."playoff_seed", "t"."playoff_finish", "t"."final_rank", "streak"."result", "streak"."len";


ALTER VIEW "public"."v_team_standings" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_team_standings" IS 'Standings per (team, season) computed from games. Replaces teams.wins/losses/points_for/... and refresh_team_stats().';



CREATE OR REPLACE VIEW "public"."v_franchise_career" WITH ("security_invoker"='true') AS
 SELECT "f"."id" AS "franchise_id",
    "f"."owner_name",
    "f"."display_name",
    "f"."is_active",
    "count"("st"."team_id") AS "seasons_played",
    "min"("st"."season_year") AS "first_season",
    "max"("st"."season_year") AS "last_season",
    COALESCE("sum"("st"."wins"), (0)::numeric) AS "total_wins",
    COALESCE("sum"("st"."losses"), (0)::numeric) AS "total_losses",
    COALESCE("sum"("st"."ties"), (0)::numeric) AS "total_ties",
    "round"(((COALESCE("sum"("st"."wins"), (0)::numeric) + (0.5 * COALESCE("sum"("st"."ties"), (0)::numeric))) / NULLIF(COALESCE("sum"("st"."games_played"), (0)::numeric), (0)::numeric)), 4) AS "career_win_percentage",
    "count"(*) FILTER (WHERE "st"."made_playoffs") AS "playoff_appearances",
    "count"(*) FILTER (WHERE ("st"."playoff_finish" = 'champion'::"text")) AS "championships",
    "count"(*) FILTER (WHERE ("st"."playoff_finish" = '2nd'::"text")) AS "runner_ups",
    COALESCE("sum"("st"."points_for"), (0)::numeric) AS "career_points_for",
    COALESCE("sum"("st"."points_against"), (0)::numeric) AS "career_points_against",
    COALESCE("sum"("st"."point_differential"), (0)::numeric) AS "career_point_differential",
    "round"("avg"("st"."average_points_for"), 2) AS "avg_points_per_game",
    "round"("avg"("st"."final_rank"), 2) AS "avg_final_rank",
    "min"("st"."final_rank") AS "best_finish",
    "max"("st"."final_rank") AS "worst_finish"
   FROM ("public"."league_franchises" "f"
     LEFT JOIN "public"."v_team_standings" "st" ON (("st"."franchise_id" = "f"."id")))
  GROUP BY "f"."id", "f"."owner_name", "f"."display_name", "f"."is_active";


ALTER VIEW "public"."v_franchise_career" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_franchise_career" IS 'All-time franchise totals across every season, current one included. Replaces mv_franchise_career_stats plus the current-season merge in leagueHistoryManager.js.';



CREATE OR REPLACE VIEW "public"."v_head_to_head" WITH ("security_invoker"='true') AS
 SELECT "t"."franchise_id",
    "o"."franchise_id" AS "opponent_franchise_id",
    "count"(*) AS "total_matchups",
    "count"(*) FILTER (WHERE ("r"."result" = 'W'::"text")) AS "wins",
    "count"(*) FILTER (WHERE ("r"."result" = 'L'::"text")) AS "losses",
    "count"(*) FILTER (WHERE ("r"."result" = 'T'::"text")) AS "ties",
    "count"(*) FILTER (WHERE "r"."is_regular") AS "regular_season_matchups",
    "count"(*) FILTER (WHERE ("r"."is_regular" AND ("r"."result" = 'W'::"text"))) AS "regular_season_wins",
    "count"(*) FILTER (WHERE "r"."is_playoff") AS "playoff_matchups",
    "count"(*) FILTER (WHERE ("r"."is_playoff" AND ("r"."result" = 'W'::"text"))) AS "playoff_wins",
    "sum"("r"."points_for") AS "total_points_for",
    "sum"("r"."points_against") AS "total_points_against",
    "round"("avg"("r"."points_for"), 2) AS "avg_points_for",
    "round"("avg"("r"."points_against"), 2) AS "avg_points_against",
    "max"("r"."points_for") AS "highest_score",
    "max"(("r"."points_for" - "r"."points_against")) AS "largest_margin"
   FROM (("public"."v_game_results" "r"
     JOIN "public"."teams" "t" ON (("t"."id" = "r"."team_id")))
     JOIN "public"."teams" "o" ON (("o"."id" = "r"."opponent_id")))
  WHERE (("t"."franchise_id" IS NOT NULL) AND ("o"."franchise_id" IS NOT NULL))
  GROUP BY "t"."franchise_id", "o"."franchise_id";


ALTER VIEW "public"."v_head_to_head" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_head_to_head" IS 'All-time head-to-head per ordered franchise pair. Replaces head_to_head_records and scripts/calculateHeadToHeadHistory.js.';



CREATE OR REPLACE VIEW "public"."v_record_book" WITH ("security_invoker"='true') AS
 SELECT 'highest_single_game'::"text" AS "record_type",
    'game'::"text" AS "scope",
    "t"."franchise_id",
    "t"."owner" AS "owner_name",
    "r"."points_for" AS "value",
    (("round"("r"."points_for", 2))::"text" || ' pts'::"text") AS "value_label",
    "r"."season_id",
    "s"."year" AS "season_year",
    "r"."week",
    "r"."game_id"
   FROM (("public"."v_game_results" "r"
     JOIN "public"."teams" "t" ON (("t"."id" = "r"."team_id")))
     JOIN "public"."seasons" "s" ON (("s"."id" = "r"."season_id")))
  WHERE ("r"."points_for" = ( SELECT "max"("x"."points_for") AS "max"
           FROM "public"."v_game_results" "x"))
UNION ALL
 SELECT 'lowest_single_game'::"text" AS "record_type",
    'game'::"text" AS "scope",
    "t"."franchise_id",
    "t"."owner" AS "owner_name",
    "r"."points_for" AS "value",
    (("round"("r"."points_for", 2))::"text" || ' pts'::"text") AS "value_label",
    "r"."season_id",
    "s"."year" AS "season_year",
    "r"."week",
    "r"."game_id"
   FROM (("public"."v_game_results" "r"
     JOIN "public"."teams" "t" ON (("t"."id" = "r"."team_id")))
     JOIN "public"."seasons" "s" ON (("s"."id" = "r"."season_id")))
  WHERE ("r"."points_for" = ( SELECT "min"("x"."points_for") AS "min"
           FROM "public"."v_game_results" "x"))
UNION ALL
 SELECT 'largest_margin'::"text" AS "record_type",
    'game'::"text" AS "scope",
    "t"."franchise_id",
    "t"."owner" AS "owner_name",
    ("r"."points_for" - "r"."points_against") AS "value",
    (("round"(("r"."points_for" - "r"."points_against"), 2))::"text" || ' pt margin'::"text") AS "value_label",
    "r"."season_id",
    "s"."year" AS "season_year",
    "r"."week",
    "r"."game_id"
   FROM (("public"."v_game_results" "r"
     JOIN "public"."teams" "t" ON (("t"."id" = "r"."team_id")))
     JOIN "public"."seasons" "s" ON (("s"."id" = "r"."season_id")))
  WHERE (("r"."points_for" - "r"."points_against") = ( SELECT "max"(("x"."points_for" - "x"."points_against")) AS "max"
           FROM "public"."v_game_results" "x"))
UNION ALL
 SELECT 'most_points_season'::"text" AS "record_type",
    'season'::"text" AS "scope",
    "st"."franchise_id",
    "st"."owner_name",
    "st"."points_for" AS "value",
    (("round"("st"."points_for", 2))::"text" || ' pts'::"text") AS "value_label",
    "st"."season_id",
    "st"."season_year",
    NULL::integer AS "week",
    NULL::"uuid" AS "game_id"
   FROM "public"."v_team_standings" "st"
  WHERE ("st"."points_for" = ( SELECT "max"("x"."points_for") AS "max"
           FROM "public"."v_team_standings" "x"))
UNION ALL
 SELECT 'fewest_points_season'::"text" AS "record_type",
    'season'::"text" AS "scope",
    "st"."franchise_id",
    "st"."owner_name",
    "st"."points_for" AS "value",
    (("round"("st"."points_for", 2))::"text" || ' pts'::"text") AS "value_label",
    "st"."season_id",
    "st"."season_year",
    NULL::integer AS "week",
    NULL::"uuid" AS "game_id"
   FROM "public"."v_team_standings" "st"
  WHERE (("st"."games_played" > 0) AND ("st"."points_for" = ( SELECT "min"("x"."points_for") AS "min"
           FROM "public"."v_team_standings" "x"
          WHERE ("x"."games_played" > 0))))
UNION ALL
 SELECT 'best_record_season'::"text" AS "record_type",
    'season'::"text" AS "scope",
    "st"."franchise_id",
    "st"."owner_name",
    "st"."win_percentage" AS "value",
    (((("st"."wins")::"text" || '-'::"text") || ("st"."losses")::"text") ||
        CASE
            WHEN ("st"."ties" > 0) THEN ('-'::"text" || ("st"."ties")::"text")
            ELSE ''::"text"
        END) AS "value_label",
    "st"."season_id",
    "st"."season_year",
    NULL::integer AS "week",
    NULL::"uuid" AS "game_id"
   FROM "public"."v_team_standings" "st"
  WHERE (("st"."games_played" > 0) AND ("st"."win_percentage" = ( SELECT "max"("x"."win_percentage") AS "max"
           FROM "public"."v_team_standings" "x"
          WHERE ("x"."games_played" > 0))));


ALTER VIEW "public"."v_record_book" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_record_book" IS 'League record book computed from games. Replaces the never-populated franchise_records table.';



CREATE TABLE IF NOT EXISTS "public"."weekly_lineups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "week" integer NOT NULL,
    "qb_id" "uuid",
    "rb1_id" "uuid",
    "rb2_id" "uuid",
    "wr1_id" "uuid",
    "wr2_id" "uuid",
    "te_id" "uuid",
    "flex_id" "uuid",
    "k_id" "uuid",
    "dst_id" "uuid",
    "lineup_json" "jsonb",
    "total_points" numeric(10,2) DEFAULT 0,
    "projected_points" numeric(10,2) DEFAULT 0,
    "is_optimal" boolean DEFAULT false,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "weekly_lineups_week_check" CHECK (("week" > 0))
);


ALTER TABLE "public"."weekly_lineups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weeks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "season_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "is_completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "power_rankings" "jsonb" DEFAULT '[]'::"jsonb",
    "weekly_stats" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "weeks_week_number_check" CHECK (("week_number" > 0))
);


ALTER TABLE "public"."weeks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."divisions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."divisions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."award_votes"
    ADD CONSTRAINT "award_votes_award_id_user_id_key" UNIQUE ("award_id", "user_id");



ALTER TABLE ONLY "public"."award_votes"
    ADD CONSTRAINT "award_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."awards"
    ADD CONSTRAINT "awards_2025_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."awards_metadata"
    ADD CONSTRAINT "awards_metadata_pkey" PRIMARY KEY ("season_id");



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_season_id_display_order_key" UNIQUE ("season_id", "display_order");



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_season_id_name_key" UNIQUE ("season_id", "name");



ALTER TABLE ONLY "public"."espn_schedule_imports"
    ADD CONSTRAINT "espn_imports_league_season_unique" UNIQUE ("user_id", "espn_league_id", "season_year");



ALTER TABLE ONLY "public"."espn_matchups"
    ADD CONSTRAINT "espn_matchups_import_matchup_unique" UNIQUE ("import_id", "espn_matchup_id");



ALTER TABLE ONLY "public"."espn_matchups"
    ADD CONSTRAINT "espn_matchups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."espn_schedule_imports"
    ADD CONSTRAINT "espn_schedule_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."espn_teams"
    ADD CONSTRAINT "espn_teams_import_team_unique" UNIQUE ("import_id", "espn_team_id");



ALTER TABLE ONLY "public"."espn_teams"
    ADD CONSTRAINT "espn_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."franchise_records"
    ADD CONSTRAINT "franchise_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_week_teams_unique" UNIQUE ("season_id", "week", "team1_id", "team2_id");



ALTER TABLE ONLY "public"."head_to_head_records"
    ADD CONSTRAINT "head_to_head_records_franchise1_id_franchise2_id_key" UNIQUE ("franchise1_id", "franchise2_id");



ALTER TABLE ONLY "public"."head_to_head_records"
    ADD CONSTRAINT "head_to_head_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historical_games"
    ADD CONSTRAINT "historical_games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historical_games"
    ADD CONSTRAINT "historical_games_season_id_week_team1_id_team2_id_key" UNIQUE ("season_id", "week", "team1_id", "team2_id");



ALTER TABLE ONLY "public"."historical_rosters"
    ADD CONSTRAINT "historical_rosters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historical_seasons"
    ADD CONSTRAINT "historical_seasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historical_seasons"
    ADD CONSTRAINT "historical_seasons_year_key" UNIQUE ("year");



ALTER TABLE ONLY "public"."historical_teams"
    ADD CONSTRAINT "historical_teams_franchise_id_season_id_key" UNIQUE ("franchise_id", "season_id");



ALTER TABLE ONLY "public"."historical_teams"
    ADD CONSTRAINT "historical_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historical_teams"
    ADD CONSTRAINT "historical_teams_season_id_espn_team_id_key" UNIQUE ("season_id", "espn_team_id");



ALTER TABLE ONLY "public"."league_franchises"
    ADD CONSTRAINT "league_franchises_owner_name_key" UNIQUE ("owner_name");



ALTER TABLE ONLY "public"."league_franchises"
    ADD CONSTRAINT "league_franchises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nfl_week_calendar"
    ADD CONSTRAINT "nfl_week_calendar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nfl_week_calendar"
    ADD CONSTRAINT "nfl_week_calendar_unique" UNIQUE ("season_year", "week_number");



ALTER TABLE ONLY "public"."pick_em_results"
    ADD CONSTRAINT "pick_em_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pick_em_results"
    ADD CONSTRAINT "pick_em_results_submission_unique" UNIQUE ("submission_id");



ALTER TABLE ONLY "public"."pick_em_season_standings"
    ADD CONSTRAINT "pick_em_season_standings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pick_em_season_standings"
    ADD CONSTRAINT "pick_em_season_standings_user_season_unique" UNIQUE ("user_id", "season_id");



ALTER TABLE ONLY "public"."pick_em_submissions_backup"
    ADD CONSTRAINT "pick_em_submissions_backup_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pick_em_submissions"
    ADD CONSTRAINT "pick_em_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pick_em_submissions"
    ADD CONSTRAINT "pick_em_submissions_user_game_unique" UNIQUE ("user_id", "pick_em_week_id", "game_id");



ALTER TABLE ONLY "public"."pick_em_weekly_scores"
    ADD CONSTRAINT "pick_em_weekly_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pick_em_weekly_scores"
    ADD CONSTRAINT "pick_em_weekly_scores_user_week_unique" UNIQUE ("user_id", "pick_em_week_id");



ALTER TABLE ONLY "public"."pick_em_weeks"
    ADD CONSTRAINT "pick_em_weeks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pick_em_weeks"
    ADD CONSTRAINT "pick_em_weeks_season_week_unique" UNIQUE ("season_id", "week_number");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_espn_id_unique" UNIQUE ("espn_player_id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playoff_picks"
    ADD CONSTRAINT "playoff_picks_season_user_matchup_key" UNIQUE ("season_id", "user_id", "matchup_id");



ALTER TABLE ONLY "public"."playoff_config"
    ADD CONSTRAINT "playoffs_2025_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playoff_config"
    ADD CONSTRAINT "playoffs_2025_config_season_unique" UNIQUE ("season_id");



ALTER TABLE ONLY "public"."playoff_picks"
    ADD CONSTRAINT "playoffs_2025_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."power_rankings_history"
    ADD CONSTRAINT "power_rankings_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."power_rankings_history"
    ADD CONSTRAINT "rankings_week_team_unique" UNIQUE ("season_id", "week_number", "team_id");



ALTER TABLE ONLY "public"."roster_history"
    ADD CONSTRAINT "roster_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rosters"
    ADD CONSTRAINT "rosters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rosters"
    ADD CONSTRAINT "rosters_team_player_unique" UNIQUE ("team_id", "player_id");



ALTER TABLE ONLY "public"."season_awards"
    ADD CONSTRAINT "season_awards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_runs"
    ADD CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "team_transactions_franchise_id_season_id_key" UNIQUE ("franchise_id", "season_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "team_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_name_season_unique" UNIQUE ("season_id", "name");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions_2025_legacy"
    ADD CONSTRAINT "transactions_2025_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions_2025_legacy"
    ADD CONSTRAINT "transactions_2025_team_id_key" UNIQUE ("team_id");



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_team_week_unique" UNIQUE ("team_id", "week");



ALTER TABLE ONLY "public"."weeks"
    ADD CONSTRAINT "weeks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weeks"
    ADD CONSTRAINT "weeks_season_number_unique" UNIQUE ("season_id", "week_number");



CREATE INDEX "awards_season_source_idx" ON "public"."awards" USING "btree" ("season_id", "source");



CREATE INDEX "games_season_week_idx" ON "public"."games" USING "btree" ("season_id", "week");



CREATE INDEX "games_team1_idx" ON "public"."games" USING "btree" ("team1_id");



CREATE INDEX "games_team2_idx" ON "public"."games" USING "btree" ("team2_id");



CREATE INDEX "idx_awards_category" ON "public"."season_awards" USING "btree" ("award_category");



CREATE INDEX "idx_awards_franchise" ON "public"."season_awards" USING "btree" ("franchise_id");



CREATE INDEX "idx_awards_season" ON "public"."season_awards" USING "btree" ("season_id");



CREATE INDEX "idx_awards_type" ON "public"."season_awards" USING "btree" ("award_type");



CREATE INDEX "idx_divisions_season_id" ON "public"."divisions" USING "btree" ("season_id");



CREATE INDEX "idx_espn_imports_league_season" ON "public"."espn_schedule_imports" USING "btree" ("user_id", "espn_league_id", "season_year");



CREATE INDEX "idx_espn_matchups_import_week" ON "public"."espn_matchups" USING "btree" ("import_id", "week");



CREATE INDEX "idx_espn_matchups_playoff" ON "public"."espn_matchups" USING "btree" ("is_playoff", "playoff_round") WHERE ("is_playoff" = true);



CREATE INDEX "idx_espn_matchups_teams" ON "public"."espn_matchups" USING "btree" ("home_espn_team_id", "away_espn_team_id");



CREATE INDEX "idx_espn_teams_import" ON "public"."espn_teams" USING "btree" ("import_id", "espn_team_id");



CREATE INDEX "idx_franchises_active" ON "public"."league_franchises" USING "btree" ("is_active");



CREATE INDEX "idx_franchises_owner_name" ON "public"."league_franchises" USING "btree" ("owner_name");



CREATE INDEX "idx_games_season_week" ON "public"."games" USING "btree" ("season_id", "week");



CREATE UNIQUE INDEX "idx_games_season_week_slot_unique" ON "public"."games" USING "btree" ("season_id", "week", "slot") WHERE (("type" = 'playoff_consolation_quarterfinals'::"text") AND ("week" = 15) AND ("slot" IS NOT NULL));



CREATE INDEX "idx_games_slot" ON "public"."games" USING "btree" ("slot") WHERE ("slot" IS NOT NULL);



CREATE INDEX "idx_games_teams" ON "public"."games" USING "btree" ("team1_id", "team2_id");



CREATE INDEX "idx_h2h_franchise1" ON "public"."head_to_head_records" USING "btree" ("franchise1_id");



CREATE INDEX "idx_h2h_franchise2" ON "public"."head_to_head_records" USING "btree" ("franchise2_id");



CREATE INDEX "idx_historical_games_playoff" ON "public"."historical_games" USING "btree" ("type") WHERE ("type" = ANY (ARRAY['playoff'::"text", 'championship'::"text"]));



CREATE INDEX "idx_historical_games_season" ON "public"."historical_games" USING "btree" ("season_id");



CREATE INDEX "idx_historical_games_team1" ON "public"."historical_games" USING "btree" ("team1_id");



CREATE INDEX "idx_historical_games_team2" ON "public"."historical_games" USING "btree" ("team2_id");



CREATE INDEX "idx_historical_games_type" ON "public"."historical_games" USING "btree" ("type");



CREATE INDEX "idx_historical_games_week" ON "public"."historical_games" USING "btree" ("week");



CREATE INDEX "idx_historical_rosters_acquisition" ON "public"."historical_rosters" USING "btree" ("acquisition_type");



CREATE INDEX "idx_historical_rosters_player" ON "public"."historical_rosters" USING "btree" ("espn_player_id");



CREATE INDEX "idx_historical_rosters_season" ON "public"."historical_rosters" USING "btree" ("season_id");



CREATE INDEX "idx_historical_rosters_team" ON "public"."historical_rosters" USING "btree" ("team_id");



CREATE INDEX "idx_historical_seasons_year" ON "public"."historical_seasons" USING "btree" ("year");



CREATE INDEX "idx_historical_teams_finish" ON "public"."historical_teams" USING "btree" ("playoff_finish");



CREATE INDEX "idx_historical_teams_franchise" ON "public"."historical_teams" USING "btree" ("franchise_id");



CREATE INDEX "idx_historical_teams_playoffs" ON "public"."historical_teams" USING "btree" ("made_playoffs");



CREATE INDEX "idx_historical_teams_season" ON "public"."historical_teams" USING "btree" ("season_id");



CREATE INDEX "idx_lineups_season_week" ON "public"."weekly_lineups" USING "btree" ("season_id", "week");



CREATE INDEX "idx_lineups_team_week" ON "public"."weekly_lineups" USING "btree" ("team_id", "week");



CREATE UNIQUE INDEX "idx_mv_franchise_career_stats_id" ON "public"."mv_franchise_career_stats" USING "btree" ("franchise_id");



CREATE UNIQUE INDEX "idx_mv_season_leaderboards_id" ON "public"."mv_season_leaderboards" USING "btree" ("season_id");



CREATE INDEX "idx_nfl_calendar_season_week" ON "public"."nfl_week_calendar" USING "btree" ("season_year", "week_number");



CREATE INDEX "idx_nfl_calendar_trigger_time" ON "public"."nfl_week_calendar" USING "btree" ("snapshot_trigger_time");



CREATE INDEX "idx_pick_em_results_week" ON "public"."pick_em_results" USING "btree" ("pick_em_week_id");



CREATE INDEX "idx_pick_em_season_standings_season" ON "public"."pick_em_season_standings" USING "btree" ("season_id", "season_rank");



CREATE INDEX "idx_pick_em_submissions_backup_created_at" ON "public"."pick_em_submissions_backup" USING "btree" ("backup_created_at");



CREATE INDEX "idx_pick_em_submissions_backup_game_id" ON "public"."pick_em_submissions_backup" USING "btree" ("game_id");



CREATE INDEX "idx_pick_em_submissions_backup_operation" ON "public"."pick_em_submissions_backup" USING "btree" ("operation_type");



CREATE INDEX "idx_pick_em_submissions_backup_original_id" ON "public"."pick_em_submissions_backup" USING "btree" ("original_record_id");



CREATE INDEX "idx_pick_em_submissions_backup_user_id" ON "public"."pick_em_submissions_backup" USING "btree" ("user_id");



CREATE INDEX "idx_pick_em_submissions_backup_week_id" ON "public"."pick_em_submissions_backup" USING "btree" ("pick_em_week_id");



CREATE INDEX "idx_pick_em_submissions_game" ON "public"."pick_em_submissions" USING "btree" ("game_id");



CREATE INDEX "idx_pick_em_submissions_user_week" ON "public"."pick_em_submissions" USING "btree" ("user_id", "pick_em_week_id");



CREATE INDEX "idx_pick_em_weekly_scores_week" ON "public"."pick_em_weekly_scores" USING "btree" ("pick_em_week_id", "weekly_rank");



CREATE INDEX "idx_pick_em_weeks_season" ON "public"."pick_em_weeks" USING "btree" ("season_id", "week_number");



CREATE INDEX "idx_pick_em_weeks_status" ON "public"."pick_em_weeks" USING "btree" ("is_active", "is_closed", "is_completed");



CREATE INDEX "idx_players_active" ON "public"."players" USING "btree" ("is_active");



CREATE INDEX "idx_players_ceiling_score" ON "public"."players" USING "btree" ("ceiling_score" DESC);



CREATE INDEX "idx_players_consistency_rating" ON "public"."players" USING "btree" ("consistency_rating" DESC);



CREATE INDEX "idx_players_espn_id" ON "public"."players" USING "btree" ("espn_player_id");



CREATE INDEX "idx_players_ffanalytics_id" ON "public"."players" USING "btree" ("ffanalytics_player_id");



CREATE INDEX "idx_players_ffanalytics_sync" ON "public"."players" USING "btree" ("ffanalytics_last_sync");



CREATE INDEX "idx_players_floor_score" ON "public"."players" USING "btree" ("floor_score" DESC);



CREATE INDEX "idx_players_injury_status" ON "public"."players" USING "btree" ("injury_status");



CREATE INDEX "idx_players_ownership" ON "public"."players" USING "btree" ("percent_owned" DESC);



CREATE INDEX "idx_players_points" ON "public"."players" USING "btree" ("season_actual_points" DESC);



CREATE INDEX "idx_players_position" ON "public"."players" USING "btree" ("position");



CREATE INDEX "idx_players_position_points" ON "public"."players" USING "btree" ("position", "season_actual_points" DESC);



CREATE INDEX "idx_players_position_rank" ON "public"."players" USING "btree" ("position", "position_rank");



CREATE INDEX "idx_players_projected" ON "public"."players" USING "btree" ("season_projected_points" DESC);



CREATE INDEX "idx_players_team" ON "public"."players" USING "btree" ("team_abbreviation");



CREATE INDEX "idx_players_trend_score" ON "public"."players" USING "btree" ("trend_score" DESC);



CREATE INDEX "idx_players_weekly_rank" ON "public"."players" USING "btree" ("weekly_rank");



CREATE INDEX "idx_playoffs_2025_config_season_id" ON "public"."playoff_config" USING "btree" ("season_id");



CREATE INDEX "idx_playoffs_2025_game" ON "public"."playoff_picks" USING "btree" ("game_id");



CREATE INDEX "idx_playoffs_2025_matchup" ON "public"."playoff_picks" USING "btree" ("matchup_id");



CREATE INDEX "idx_playoffs_2025_season" ON "public"."playoff_picks" USING "btree" ("season_id");



CREATE INDEX "idx_playoffs_2025_user" ON "public"."playoff_picks" USING "btree" ("user_id");



CREATE INDEX "idx_power_rankings_created_at" ON "public"."power_rankings_history" USING "btree" ("created_at");



CREATE INDEX "idx_power_rankings_season_week" ON "public"."power_rankings_history" USING "btree" ("season_id", "week_number");



CREATE INDEX "idx_power_rankings_team_chronological" ON "public"."power_rankings_history" USING "btree" ("team_id", "season_id", "week_number");



CREATE INDEX "idx_power_rankings_week_rank" ON "public"."power_rankings_history" USING "btree" ("season_id", "week_number", "rank");



CREATE INDEX "idx_records_category" ON "public"."franchise_records" USING "btree" ("record_category");



CREATE INDEX "idx_records_current" ON "public"."franchise_records" USING "btree" ("is_current_record");



CREATE INDEX "idx_records_franchise" ON "public"."franchise_records" USING "btree" ("franchise_id");



CREATE INDEX "idx_records_season" ON "public"."franchise_records" USING "btree" ("season_id");



CREATE INDEX "idx_records_type" ON "public"."franchise_records" USING "btree" ("record_type");



CREATE INDEX "idx_roster_history_season" ON "public"."roster_history" USING "btree" ("season_id");



CREATE INDEX "idx_roster_history_trade" ON "public"."roster_history" USING "btree" ("trade_id") WHERE ("trade_id" IS NOT NULL);



CREATE INDEX "idx_roster_history_type" ON "public"."roster_history" USING "btree" ("transaction_type");



CREATE INDEX "idx_rosters_acquisition" ON "public"."rosters" USING "btree" ("acquisition_type", "acquisition_week");



CREATE INDEX "idx_rosters_player" ON "public"."rosters" USING "btree" ("player_id");



CREATE INDEX "idx_rosters_slot" ON "public"."rosters" USING "btree" ("roster_slot");



CREATE INDEX "idx_rosters_team" ON "public"."rosters" USING "btree" ("team_id");



CREATE INDEX "idx_seasons_user_year" ON "public"."seasons" USING "btree" ("user_id", "year");



CREATE INDEX "idx_team_transactions_franchise" ON "public"."transactions" USING "btree" ("franchise_id");



CREATE INDEX "idx_team_transactions_owner" ON "public"."transactions" USING "btree" ("owner_name");



CREATE INDEX "idx_team_transactions_season" ON "public"."transactions" USING "btree" ("season_id");



CREATE INDEX "idx_teams_division_id" ON "public"."teams" USING "btree" ("division_id");



CREATE INDEX "idx_teams_espn_team_id" ON "public"."teams" USING "btree" ("espn_team_id");



CREATE INDEX "idx_teams_last_roster_sync" ON "public"."teams" USING "btree" ("last_roster_sync");



CREATE INDEX "idx_teams_roster_gin" ON "public"."teams" USING "gin" ("roster");



CREATE INDEX "idx_teams_season" ON "public"."teams" USING "btree" ("season_id");



CREATE INDEX "idx_teams_updated_at" ON "public"."teams" USING "btree" ("updated_at");



CREATE INDEX "idx_transactions_2025_owner_name" ON "public"."transactions_2025_legacy" USING "btree" ("owner_name");



CREATE INDEX "idx_transactions_2025_team_id" ON "public"."transactions_2025_legacy" USING "btree" ("team_id");



CREATE INDEX "idx_weeks_season" ON "public"."weeks" USING "btree" ("season_id", "week_number");



CREATE UNIQUE INDEX "seasons_one_active_idx" ON "public"."seasons" USING "btree" ("is_active") WHERE "is_active";



CREATE UNIQUE INDEX "seasons_year_key" ON "public"."seasons" USING "btree" ("year");



CREATE INDEX "sync_runs_season_started_idx" ON "public"."sync_runs" USING "btree" ("season_id", "started_at" DESC);



CREATE INDEX "teams_franchise_id_idx" ON "public"."teams" USING "btree" ("franchise_id");



CREATE INDEX "teams_season_id_idx" ON "public"."teams" USING "btree" ("season_id");



CREATE INDEX "transactions_season_id_idx" ON "public"."transactions" USING "btree" ("season_id");



CREATE OR REPLACE TRIGGER "after_game_completion" AFTER INSERT OR UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."after_game_completion"();



CREATE OR REPLACE TRIGGER "before_game_update" BEFORE INSERT OR UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_team_stats"();



CREATE OR REPLACE TRIGGER "calculate_player_averages" BEFORE UPDATE OF "season_actual_points", "season_projected_points", "games_played" ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."update_player_averages"();



CREATE OR REPLACE TRIGGER "calculate_team_transaction_totals" BEFORE INSERT OR UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_total_transactions"();



CREATE OR REPLACE TRIGGER "set_espn_imports_user_id" BEFORE INSERT ON "public"."espn_schedule_imports" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_espn_matchups_user_id" BEFORE INSERT ON "public"."espn_matchups" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_espn_teams_user_id" BEFORE INSERT ON "public"."espn_teams" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_games_user_id" BEFORE INSERT ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_pick_em_results_user_id" BEFORE INSERT ON "public"."pick_em_results" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_pick_em_season_standings_user_id" BEFORE INSERT ON "public"."pick_em_season_standings" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_pick_em_submissions_user_id" BEFORE INSERT ON "public"."pick_em_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_pick_em_weekly_scores_user_id" BEFORE INSERT ON "public"."pick_em_weekly_scores" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_pick_em_weeks_user_id" BEFORE INSERT ON "public"."pick_em_weeks" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_playoffs_2025_user_id" BEFORE INSERT ON "public"."playoff_picks" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_power_rankings_user_id" BEFORE INSERT ON "public"."power_rankings_history" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_roster_history_user_id" BEFORE INSERT ON "public"."roster_history" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_rosters_user_id" BEFORE INSERT ON "public"."rosters" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_seasons_user_id" BEFORE INSERT ON "public"."seasons" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_teams_user_id" BEFORE INSERT ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_weekly_lineups_user_id" BEFORE INSERT ON "public"."weekly_lineups" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "set_weeks_user_id" BEFORE INSERT ON "public"."weeks" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();



CREATE OR REPLACE TRIGGER "trigger_auto_save_weekly_snapshot" AFTER UPDATE ON "public"."weeks" FOR EACH ROW EXECUTE FUNCTION "public"."auto_save_weekly_snapshot"();



CREATE OR REPLACE TRIGGER "trigger_backup_pick_em_submissions" AFTER INSERT OR DELETE OR UPDATE ON "public"."pick_em_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."backup_pick_em_submissions"();



CREATE OR REPLACE TRIGGER "trigger_create_default_divisions" AFTER INSERT ON "public"."seasons" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_divisions"();



CREATE OR REPLACE TRIGGER "trigger_transactions_2025_updated_at" BEFORE UPDATE ON "public"."transactions_2025_legacy" FOR EACH ROW EXECUTE FUNCTION "public"."update_transactions_2025_updated_at"();



CREATE OR REPLACE TRIGGER "update_divisions_updated_at" BEFORE UPDATE ON "public"."divisions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_historical_seasons_updated_at" BEFORE UPDATE ON "public"."historical_seasons" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_historical_teams_updated_at" BEFORE UPDATE ON "public"."historical_teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_league_franchises_updated_at" BEFORE UPDATE ON "public"."league_franchises" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lineups_updated_at" BEFORE UPDATE ON "public"."weekly_lineups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_pick_em_submissions_updated_at" BEFORE UPDATE ON "public"."pick_em_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_pick_em_weeks_updated_at" BEFORE UPDATE ON "public"."pick_em_weeks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_players_updated_at" BEFORE UPDATE ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_playoff_results_on_game_complete" AFTER UPDATE ON "public"."games" FOR EACH ROW WHEN ((("new"."type" ~~ 'playoff%'::"text") OR ("new"."type" ~~ 'consolation%'::"text"))) EXECUTE FUNCTION "public"."update_playoff_pick_results"();



CREATE OR REPLACE TRIGGER "update_playoffs_2025_config_updated_at" BEFORE UPDATE ON "public"."playoff_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_playoffs_2025_updated_at" BEFORE UPDATE ON "public"."playoff_picks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_rosters_updated_at" BEFORE UPDATE ON "public"."rosters" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_team_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."award_votes"
    ADD CONSTRAINT "award_votes_award_id_fkey" FOREIGN KEY ("award_id") REFERENCES "public"."awards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."award_votes"
    ADD CONSTRAINT "award_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."awards"
    ADD CONSTRAINT "awards_2025_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."awards_metadata"
    ADD CONSTRAINT "awards_metadata_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."awards"
    ADD CONSTRAINT "awards_winner_franchise_id_fkey" FOREIGN KEY ("winner_franchise_id") REFERENCES "public"."league_franchises"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."awards"
    ADD CONSTRAINT "awards_winner_team_id_fkey" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espn_matchups"
    ADD CONSTRAINT "espn_matchups_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "public"."espn_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espn_matchups"
    ADD CONSTRAINT "espn_matchups_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "public"."espn_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espn_matchups"
    ADD CONSTRAINT "espn_matchups_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."espn_schedule_imports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espn_schedule_imports"
    ADD CONSTRAINT "espn_schedule_imports_assigned_season_id_fkey" FOREIGN KEY ("assigned_season_id") REFERENCES "public"."seasons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."espn_teams"
    ADD CONSTRAINT "espn_teams_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."espn_schedule_imports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."franchise_records"
    ADD CONSTRAINT "franchise_records_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "public"."league_franchises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."franchise_records"
    ADD CONSTRAINT "franchise_records_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."historical_games"("id");



ALTER TABLE ONLY "public"."franchise_records"
    ADD CONSTRAINT "franchise_records_previous_record_holder_id_fkey" FOREIGN KEY ("previous_record_holder_id") REFERENCES "public"."league_franchises"("id");



ALTER TABLE ONLY "public"."franchise_records"
    ADD CONSTRAINT "franchise_records_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."historical_seasons"("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_loser_team_id_fkey" FOREIGN KEY ("loser_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_team1_id_fkey" FOREIGN KEY ("team1_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_team2_id_fkey" FOREIGN KEY ("team2_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_winner_team_id_fkey" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."head_to_head_records"
    ADD CONSTRAINT "head_to_head_records_current_streak_franchise_id_fkey" FOREIGN KEY ("current_streak_franchise_id") REFERENCES "public"."league_franchises"("id");



ALTER TABLE ONLY "public"."head_to_head_records"
    ADD CONSTRAINT "head_to_head_records_franchise1_id_fkey" FOREIGN KEY ("franchise1_id") REFERENCES "public"."league_franchises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."head_to_head_records"
    ADD CONSTRAINT "head_to_head_records_franchise2_id_fkey" FOREIGN KEY ("franchise2_id") REFERENCES "public"."league_franchises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."head_to_head_records"
    ADD CONSTRAINT "head_to_head_records_highest_scoring_game_id_fkey" FOREIGN KEY ("highest_scoring_game_id") REFERENCES "public"."historical_games"("id");



ALTER TABLE ONLY "public"."head_to_head_records"
    ADD CONSTRAINT "head_to_head_records_largest_margin_game_id_fkey" FOREIGN KEY ("largest_margin_game_id") REFERENCES "public"."historical_games"("id");



ALTER TABLE ONLY "public"."head_to_head_records"
    ADD CONSTRAINT "head_to_head_records_longest_streak_franchise_id_fkey" FOREIGN KEY ("longest_streak_franchise_id") REFERENCES "public"."league_franchises"("id");



ALTER TABLE ONLY "public"."historical_games"
    ADD CONSTRAINT "historical_games_loser_team_id_fkey" FOREIGN KEY ("loser_team_id") REFERENCES "public"."historical_teams"("id");



ALTER TABLE ONLY "public"."historical_games"
    ADD CONSTRAINT "historical_games_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."historical_seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historical_games"
    ADD CONSTRAINT "historical_games_team1_id_fkey" FOREIGN KEY ("team1_id") REFERENCES "public"."historical_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historical_games"
    ADD CONSTRAINT "historical_games_team2_id_fkey" FOREIGN KEY ("team2_id") REFERENCES "public"."historical_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historical_games"
    ADD CONSTRAINT "historical_games_winner_team_id_fkey" FOREIGN KEY ("winner_team_id") REFERENCES "public"."historical_teams"("id");



ALTER TABLE ONLY "public"."historical_rosters"
    ADD CONSTRAINT "historical_rosters_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."historical_seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historical_rosters"
    ADD CONSTRAINT "historical_rosters_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."historical_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historical_teams"
    ADD CONSTRAINT "historical_teams_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "public"."league_franchises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historical_teams"
    ADD CONSTRAINT "historical_teams_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."historical_seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pick_em_results"
    ADD CONSTRAINT "pick_em_results_actual_winner_team_id_fkey" FOREIGN KEY ("actual_winner_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."pick_em_results"
    ADD CONSTRAINT "pick_em_results_pick_em_week_id_fkey" FOREIGN KEY ("pick_em_week_id") REFERENCES "public"."pick_em_weeks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pick_em_results"
    ADD CONSTRAINT "pick_em_results_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."pick_em_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pick_em_season_standings"
    ADD CONSTRAINT "pick_em_season_standings_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pick_em_submissions"
    ADD CONSTRAINT "pick_em_submissions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pick_em_submissions"
    ADD CONSTRAINT "pick_em_submissions_pick_em_week_id_fkey" FOREIGN KEY ("pick_em_week_id") REFERENCES "public"."pick_em_weeks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pick_em_submissions"
    ADD CONSTRAINT "pick_em_submissions_predicted_winner_team_id_fkey" FOREIGN KEY ("predicted_winner_team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pick_em_weekly_scores"
    ADD CONSTRAINT "pick_em_weekly_scores_pick_em_week_id_fkey" FOREIGN KEY ("pick_em_week_id") REFERENCES "public"."pick_em_weeks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pick_em_weeks"
    ADD CONSTRAINT "pick_em_weeks_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."playoff_picks"
    ADD CONSTRAINT "playoffs_2025_actual_winner_fkey" FOREIGN KEY ("actual_winner_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."playoff_config"
    ADD CONSTRAINT "playoffs_2025_config_season_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."playoff_picks"
    ADD CONSTRAINT "playoffs_2025_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."playoff_picks"
    ADD CONSTRAINT "playoffs_2025_predicted_winner_fkey" FOREIGN KEY ("predicted_winner_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."playoff_picks"
    ADD CONSTRAINT "playoffs_2025_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."power_rankings_history"
    ADD CONSTRAINT "power_rankings_history_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."power_rankings_history"
    ADD CONSTRAINT "power_rankings_history_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster_history"
    ADD CONSTRAINT "roster_history_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster_history"
    ADD CONSTRAINT "roster_history_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster_history"
    ADD CONSTRAINT "roster_history_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster_history"
    ADD CONSTRAINT "roster_history_trade_partner_team_id_fkey" FOREIGN KEY ("trade_partner_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."rosters"
    ADD CONSTRAINT "rosters_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rosters"
    ADD CONSTRAINT "rosters_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."season_awards"
    ADD CONSTRAINT "season_awards_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "public"."league_franchises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."season_awards"
    ADD CONSTRAINT "season_awards_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."historical_seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."season_awards"
    ADD CONSTRAINT "season_awards_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."historical_teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sync_runs"
    ADD CONSTRAINT "sync_runs_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "team_transactions_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "public"."league_franchises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "public"."league_franchises"("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions_2025_legacy"
    ADD CONSTRAINT "transactions_2025_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_dst_id_fkey" FOREIGN KEY ("dst_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_flex_id_fkey" FOREIGN KEY ("flex_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_k_id_fkey" FOREIGN KEY ("k_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_qb_id_fkey" FOREIGN KEY ("qb_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_rb1_id_fkey" FOREIGN KEY ("rb1_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_rb2_id_fkey" FOREIGN KEY ("rb2_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_te_id_fkey" FOREIGN KEY ("te_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_wr1_id_fkey" FOREIGN KEY ("wr1_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."weekly_lineups"
    ADD CONSTRAINT "weekly_lineups_wr2_id_fkey" FOREIGN KEY ("wr2_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."weeks"
    ADD CONSTRAINT "weeks_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



CREATE POLICY "Admin write access" ON "public"."franchise_records" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("auth"."uid"() = "users"."id") AND (("users"."raw_user_meta_data" ->> 'is_admin'::"text") = 'true'::"text")))));



CREATE POLICY "Admin write access" ON "public"."head_to_head_records" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("auth"."uid"() = "users"."id") AND (("users"."raw_user_meta_data" ->> 'is_admin'::"text") = 'true'::"text")))));



CREATE POLICY "Admin write access" ON "public"."historical_games" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("auth"."uid"() = "users"."id") AND (("users"."raw_user_meta_data" ->> 'is_admin'::"text") = 'true'::"text")))));



CREATE POLICY "Admin write access" ON "public"."historical_rosters" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("auth"."uid"() = "users"."id") AND (("users"."raw_user_meta_data" ->> 'is_admin'::"text") = 'true'::"text")))));



CREATE POLICY "Admin write access" ON "public"."historical_seasons" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("auth"."uid"() = "users"."id") AND (("users"."raw_user_meta_data" ->> 'is_admin'::"text") = 'true'::"text")))));



CREATE POLICY "Admin write access" ON "public"."historical_teams" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("auth"."uid"() = "users"."id") AND (("users"."raw_user_meta_data" ->> 'is_admin'::"text") = 'true'::"text")))));



CREATE POLICY "Admin write access" ON "public"."league_franchises" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("auth"."uid"() = "users"."id") AND (("users"."raw_user_meta_data" ->> 'is_admin'::"text") = 'true'::"text")))));



CREATE POLICY "Admin write access" ON "public"."season_awards" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("auth"."uid"() = "users"."id") AND (("users"."raw_user_meta_data" ->> 'is_admin'::"text") = 'true'::"text")))));



CREATE POLICY "Admin write access" ON "public"."transactions" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("auth"."uid"() = "users"."id") AND (("users"."raw_user_meta_data" ->> 'is_admin'::"text") = 'true'::"text")))));



CREATE POLICY "Allow authenticated read access to power rankings history" ON "public"."power_rankings_history" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read divisions" ON "public"."divisions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow public read access to divisions" ON "public"."divisions" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow public read access to pick_em_submissions" ON "public"."pick_em_submissions" FOR SELECT USING (true);



CREATE POLICY "Allow public read access to pick_em_weeks" ON "public"."pick_em_weeks" FOR SELECT USING (true);



CREATE POLICY "Allow public read access to power rankings history" ON "public"."power_rankings_history" FOR SELECT USING (true);



CREATE POLICY "Allow public read access to transactions_2025" ON "public"."transactions_2025_legacy" FOR SELECT USING (true);



CREATE POLICY "Allow read access to backup submissions" ON "public"."pick_em_submissions_backup" FOR SELECT USING (true);



CREATE POLICY "Anyone can view playoff config" ON "public"."playoff_config" FOR SELECT USING (true);



CREATE POLICY "Awards are viewable by everyone" ON "public"."awards" FOR SELECT USING (true);



CREATE POLICY "Metadata is viewable by everyone" ON "public"."awards_metadata" FOR SELECT USING (true);



CREATE POLICY "Players are readable by all" ON "public"."players" FOR SELECT USING (true);



CREATE POLICY "Public can view playoff config" ON "public"."playoff_config" FOR SELECT USING (true);



CREATE POLICY "Public can view playoff picks" ON "public"."playoff_picks" FOR SELECT USING (true);



CREATE POLICY "Public read ESPN imports" ON "public"."espn_schedule_imports" FOR SELECT USING (true);



CREATE POLICY "Public read ESPN matchups" ON "public"."espn_matchups" FOR SELECT USING (true);



CREATE POLICY "Public read ESPN teams" ON "public"."espn_teams" FOR SELECT USING (true);



CREATE POLICY "Public read NFL calendar" ON "public"."nfl_week_calendar" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."franchise_records" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."head_to_head_records" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."historical_games" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."historical_rosters" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."historical_seasons" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."historical_teams" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."league_franchises" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."season_awards" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."transactions" FOR SELECT USING (true);



CREATE POLICY "Public read games" ON "public"."games" FOR SELECT USING (true);



CREATE POLICY "Public read power rankings history" ON "public"."power_rankings_history" FOR SELECT USING (true);



CREATE POLICY "Public read roster history" ON "public"."roster_history" FOR SELECT USING (true);



CREATE POLICY "Public read rosters" ON "public"."rosters" FOR SELECT USING (true);



CREATE POLICY "Public read seasons" ON "public"."seasons" FOR SELECT USING (true);



CREATE POLICY "Public read teams" ON "public"."teams" FOR SELECT USING (true);



CREATE POLICY "Public read weekly lineups" ON "public"."weekly_lineups" FOR SELECT USING (true);



CREATE POLICY "Public read weeks" ON "public"."weeks" FOR SELECT USING (true);



CREATE POLICY "Users can insert own picks" ON "public"."playoff_picks" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("now"() < COALESCE(( SELECT "c"."submission_deadline"
   FROM "public"."playoff_config" "c"
  WHERE ("c"."season_id" = "playoff_picks"."season_id")), 'infinity'::timestamp with time zone))));



CREATE POLICY "Users can insert votes" ON "public"."award_votes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own submissions" ON "public"."pick_em_submissions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own picks" ON "public"."playoff_picks" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND ("now"() < COALESCE(( SELECT "c"."submission_deadline"
   FROM "public"."playoff_config" "c"
  WHERE ("c"."season_id" = "playoff_picks"."season_id")), 'infinity'::timestamp with time zone))));



CREATE POLICY "Users can update own submissions" ON "public"."pick_em_submissions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own votes" ON "public"."award_votes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view all season standings" ON "public"."pick_em_season_standings" FOR SELECT USING (true);



CREATE POLICY "Users can view all submissions after reveal" ON "public"."pick_em_submissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pick_em_weeks" "pew"
  WHERE (("pew"."id" = "pick_em_submissions"."pick_em_week_id") AND ("pew"."is_completed" = true)))));



CREATE POLICY "Users can view own submissions" ON "public"."pick_em_submissions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view results after completion" ON "public"."pick_em_results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pick_em_weeks" "pew"
  WHERE (("pew"."id" = "pick_em_results"."pick_em_week_id") AND ("pew"."is_completed" = true)))));



CREATE POLICY "Users can view weekly scores after completion" ON "public"."pick_em_weekly_scores" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pick_em_weeks" "pew"
  WHERE (("pew"."id" = "pick_em_weekly_scores"."pick_em_week_id") AND ("pew"."is_completed" = true)))));



CREATE POLICY "Votes are viewable by everyone" ON "public"."award_votes" FOR SELECT USING (true);



ALTER TABLE "public"."award_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "award_votes admin write" ON "public"."award_votes" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."awards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "awards admin write" ON "public"."awards" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."awards_metadata" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "awards_metadata admin write" ON "public"."awards_metadata" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."divisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "divisions admin write" ON "public"."divisions" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."espn_matchups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "espn_matchups admin write" ON "public"."espn_matchups" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."espn_schedule_imports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "espn_schedule_imports admin write" ON "public"."espn_schedule_imports" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."espn_teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "espn_teams admin write" ON "public"."espn_teams" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."franchise_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "games admin write" ON "public"."games" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."head_to_head_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historical_games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historical_rosters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historical_seasons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historical_teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."league_franchises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nfl_week_calendar" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nfl_week_calendar admin write" ON "public"."nfl_week_calendar" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."pick_em_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pick_em_season_standings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pick_em_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pick_em_submissions admin write" ON "public"."pick_em_submissions" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."pick_em_submissions_backup" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pick_em_submissions_backup admin write" ON "public"."pick_em_submissions_backup" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."pick_em_weekly_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pick_em_weeks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pick_em_weeks admin write" ON "public"."pick_em_weeks" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "players admin write" ON "public"."players" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."playoff_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "playoff_config admin write" ON "public"."playoff_config" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."playoff_picks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "playoff_picks admin write" ON "public"."playoff_picks" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."power_rankings_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "power_rankings_history admin write" ON "public"."power_rankings_history" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."roster_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roster_history admin write" ON "public"."roster_history" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."rosters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rosters admin write" ON "public"."rosters" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."season_awards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seasons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seasons admin write" ON "public"."seasons" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."sync_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sync_runs admin write" ON "public"."sync_runs" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "sync_runs public read" ON "public"."sync_runs" FOR SELECT USING (true);



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams admin write" ON "public"."teams" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transactions admin write" ON "public"."transactions" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."transactions_2025_legacy" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transactions_2025_legacy admin write" ON "public"."transactions_2025_legacy" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."weekly_lineups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weekly_lineups admin write" ON "public"."weekly_lineups" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."weeks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weeks admin write" ON "public"."weeks" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."add_player_to_roster"("p_team_id" "uuid", "p_player_id" "uuid", "p_roster_slot" "text", "p_acquisition_type" "text", "p_acquisition_week" integer, "p_cost" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_player_to_roster"("p_team_id" "uuid", "p_player_id" "uuid", "p_roster_slot" "text", "p_acquisition_type" "text", "p_acquisition_week" integer, "p_cost" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."after_game_completion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."after_game_completion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_schedule_to_season"("p_import_id" "uuid", "p_season_id" "uuid", "p_assigned_by" "uuid", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_schedule_to_season"("p_import_id" "uuid", "p_season_id" "uuid", "p_assigned_by" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_schedule_to_season"("p_import_id" "uuid", "p_season_id" "uuid", "p_assigned_by" "uuid", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."auto_save_weekly_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_save_weekly_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."backup_pick_em_submissions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backup_pick_em_submissions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_pick_em_results"("p_pick_em_week_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_pick_em_results"("p_pick_em_week_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_power_rankings"("season_id" "uuid", "week_number" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_power_rankings"("season_id" "uuid", "week_number" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_team_roster_analytics"("team_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_team_roster_analytics"("team_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_total_transactions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_total_transactions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_weekly_pick_em_scores"("p_pick_em_week_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_weekly_pick_em_scores"("p_pick_em_week_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_write_league"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_write_league"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_write_league"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_write_league"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_awards_unlock_status"("season_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_awards_unlock_status"("season_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_awards_unlock_status"("season_id_param" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_old_espn_imports"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_old_espn_imports"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_old_power_rankings_snapshots"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_old_power_rankings_snapshots"() TO "service_role";



GRANT ALL ON FUNCTION "public"."compare_rankings_between_weeks"("season_id" "uuid", "week1" integer, "week2" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."compare_rankings_between_weeks"("season_id" "uuid", "week1" integer, "week2" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."compare_rankings_between_weeks"("season_id" "uuid", "week1" integer, "week2" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_default_divisions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_default_divisions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_pick_em_week"("p_season_id" "uuid", "p_week_number" integer, "p_submission_opens_at" timestamp with time zone, "p_submission_closes_at" timestamp with time zone, "p_results_reveal_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_pick_em_week"("p_season_id" "uuid", "p_week_number" integer, "p_submission_opens_at" timestamp with time zone, "p_submission_closes_at" timestamp with time zone, "p_results_reveal_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_pick_em_week"("p_season_id" "uuid", "p_week_number" integer, "p_submission_opens_at" timestamp with time zone, "p_submission_closes_at" timestamp with time zone, "p_results_reveal_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."debug_refresh_season_data"("season_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."debug_refresh_season_data"("season_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."direct_match_test"("p_import_id" "uuid", "p_season_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."direct_match_test"("p_import_id" "uuid", "p_season_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."disable_roster_trigger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."disable_roster_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."disable_roster_trigger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."drop_player_from_roster"("p_team_id" "uuid", "p_player_id" "uuid", "p_transaction_week" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."drop_player_from_roster"("p_team_id" "uuid", "p_player_id" "uuid", "p_transaction_week" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."enable_roster_trigger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enable_roster_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enable_roster_trigger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_trade"("p_season_id" "uuid", "p_team1_id" "uuid", "p_team2_id" "uuid", "p_team1_players" "uuid"[], "p_team2_players" "uuid"[], "p_transaction_week" integer, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_trade"("p_season_id" "uuid", "p_team1_id" "uuid", "p_team2_id" "uuid", "p_team1_players" "uuid"[], "p_team2_players" "uuid"[], "p_transaction_week" integer, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_weekly_snapshot_if_needed"("season_year" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_weekly_snapshot_if_needed"("season_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_players"("p_season_id" "uuid", "p_position" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_players"("p_season_id" "uuid", "p_position" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_players"("p_season_id" "uuid", "p_position" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_snapshot_weeks"("season_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_snapshot_weeks"("season_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_snapshot_weeks"("season_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_nfl_week"("season_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_nfl_week"("season_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_nfl_week"("season_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_franchise_awards"("p_franchise_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_franchise_awards"("p_franchise_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_franchise_awards"("p_franchise_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_franchise_career_stats"("p_franchise_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_franchise_career_stats"("p_franchise_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_franchise_career_stats"("p_franchise_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_franchise_transaction_history"("p_franchise_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_franchise_transaction_history"("p_franchise_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_franchise_transaction_history"("p_franchise_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_franchise_transaction_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_franchise_transaction_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_franchise_transaction_totals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_h2h_record"("p_franchise1_id" "uuid", "p_franchise2_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_h2h_record"("p_franchise1_id" "uuid", "p_franchise2_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_h2h_record"("p_franchise1_id" "uuid", "p_franchise2_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pending_schedule_imports"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_schedule_imports"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_schedule_imports"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pick_em_status"("p_season_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pick_em_status"("p_season_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pick_em_status"("p_season_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_power_rankings_for_week"("season_id" "uuid", "week_number" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_power_rankings_for_week"("season_id" "uuid", "week_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_power_rankings_for_week"("season_id" "uuid", "week_number" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_roster_transaction_history"("p_team_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_roster_transaction_history"("p_team_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_roster_transaction_history"("p_team_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_season_summary"("season_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_season_summary"("season_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_season_summary"("season_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_snapshot_execution_history"("season_id" "uuid", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_snapshot_execution_history"("season_id" "uuid", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_snapshot_execution_history"("season_id" "uuid", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_standings_by_division"("season_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_standings_by_division"("season_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_standings_by_division"("season_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_team_roster"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_team_roster"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_roster"("p_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_display_names"("user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_display_names"("user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_display_names"("user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_picks_for_week"("p_pick_em_week_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_picks_for_week"("p_pick_em_week_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_picks_for_week"("p_pick_em_week_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_users_for_admin"("user_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_users_for_admin"("user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_for_admin"("user_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."manual_weekly_snapshot_check"("season_year" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manual_weekly_snapshot_check"("season_year" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_league_history_views"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_league_history_views"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_season_stats"("season_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_season_stats"("season_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_team_stats"("team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_team_stats"("team_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_transaction_views"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_transaction_views"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_enhanced_power_rankings_snapshot"("season_id" "uuid", "week_number" integer, "snapshot_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_enhanced_power_rankings_snapshot"("season_id" "uuid", "week_number" integer, "snapshot_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_power_rankings_snapshot"("season_id" "uuid", "week_number" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_power_rankings_snapshot"("season_id" "uuid", "week_number" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_weekly_power_rankings_snapshot"("p_season_id" "uuid", "p_week_number" integer, "p_snapshot_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_weekly_power_rankings_snapshot"("p_season_id" "uuid", "p_week_number" integer, "p_snapshot_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."season_current_week"("p_season_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."season_current_week"("p_season_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."season_current_week"("p_season_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."season_week_start"("p_season_id" "uuid", "p_week" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."season_week_start"("p_season_id" "uuid", "p_week" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."season_week_start"("p_season_id" "uuid", "p_week" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_user_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."should_trigger_weekly_snapshot"("season_year" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."should_trigger_weekly_snapshot"("season_year" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_pick_em_picks"("p_pick_em_week_id" "uuid", "p_picks" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_pick_em_picks"("p_pick_em_week_id" "uuid", "p_picks" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_pick_em_picks"("p_pick_em_week_id" "uuid", "p_picks" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_playoff_picks"("p_season_id" "uuid", "p_picks" "jsonb", "p_championship_point_total" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_playoff_picks"("p_season_id" "uuid", "p_picks" "jsonb", "p_championship_point_total" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_playoff_picks"("p_season_id" "uuid", "p_picks" "jsonb", "p_championship_point_total" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_espn_player_stats"("espn_id" integer, "projected_pts" numeric, "actual_pts" numeric, "season_projected_pts" numeric, "season_actual_pts" numeric, "games" integer, "injury" "text", "owned_pct" numeric, "started_pct" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_espn_player_stats"("espn_id" integer, "projected_pts" numeric, "actual_pts" numeric, "season_projected_pts" numeric, "season_actual_pts" numeric, "games" integer, "injury" "text", "owned_pct" numeric, "started_pct" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_player_from_espn"("p_espn_player_id" integer, "p_name" "text", "p_position" "text", "p_team_abbreviation" "text", "p_jersey_number" integer, "p_espn_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_player_from_espn"("p_espn_player_id" integer, "p_name" "text", "p_position" "text", "p_team_abbreviation" "text", "p_jersey_number" integer, "p_espn_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_team_roster_from_espn"("p_team_id" "uuid", "p_roster_data" "jsonb", "p_current_week" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_team_roster_from_espn"("p_team_id" "uuid", "p_roster_data" "jsonb", "p_current_week" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."team_standings_as_of"("p_season_id" "uuid", "p_through_week" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."team_standings_as_of"("p_season_id" "uuid", "p_through_week" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."team_standings_as_of"("p_season_id" "uuid", "p_through_week" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."test_owner_matching"("p_import_id" "uuid", "p_season_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."test_owner_matching"("p_import_id" "uuid", "p_season_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_update_team_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_update_team_stats"() TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_game_result"("game_id" "uuid", "team1_score" numeric, "team2_score" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_game_result"("game_id" "uuid", "team1_score" numeric, "team2_score" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_game_result"("game_id" "uuid", "team1_score" numeric, "team2_score" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_player_averages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_player_averages"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_playoff_pick_results"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_playoff_pick_results"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_season_pick_em_standings"("p_season_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_season_pick_em_standings"("p_season_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_transactions_2025_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_transactions_2025_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_nfl_calendar"("season_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."validate_nfl_calendar"("season_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_nfl_calendar"("season_year" integer) TO "service_role";


















GRANT ALL ON TABLE "public"."award_votes" TO "anon";
GRANT ALL ON TABLE "public"."award_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."award_votes" TO "service_role";



GRANT ALL ON TABLE "public"."awards" TO "anon";
GRANT ALL ON TABLE "public"."awards" TO "authenticated";
GRANT ALL ON TABLE "public"."awards" TO "service_role";



GRANT ALL ON TABLE "public"."awards_2025" TO "anon";
GRANT ALL ON TABLE "public"."awards_2025" TO "authenticated";
GRANT ALL ON TABLE "public"."awards_2025" TO "service_role";



GRANT ALL ON TABLE "public"."awards_metadata" TO "anon";
GRANT ALL ON TABLE "public"."awards_metadata" TO "authenticated";
GRANT ALL ON TABLE "public"."awards_metadata" TO "service_role";



GRANT ALL ON TABLE "public"."divisions" TO "anon";
GRANT ALL ON TABLE "public"."divisions" TO "authenticated";
GRANT ALL ON TABLE "public"."divisions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."divisions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."divisions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."divisions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."espn_matchups" TO "anon";
GRANT ALL ON TABLE "public"."espn_matchups" TO "authenticated";
GRANT ALL ON TABLE "public"."espn_matchups" TO "service_role";



GRANT ALL ON TABLE "public"."espn_schedule_imports" TO "anon";
GRANT ALL ON TABLE "public"."espn_schedule_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."espn_schedule_imports" TO "service_role";



GRANT ALL ON TABLE "public"."espn_teams" TO "anon";
GRANT ALL ON TABLE "public"."espn_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."espn_teams" TO "service_role";



GRANT ALL ON TABLE "public"."franchise_records" TO "anon";
GRANT ALL ON TABLE "public"."franchise_records" TO "authenticated";
GRANT ALL ON TABLE "public"."franchise_records" TO "service_role";



GRANT ALL ON TABLE "public"."head_to_head_records" TO "anon";
GRANT ALL ON TABLE "public"."head_to_head_records" TO "authenticated";
GRANT ALL ON TABLE "public"."head_to_head_records" TO "service_role";



GRANT ALL ON TABLE "public"."historical_games" TO "anon";
GRANT ALL ON TABLE "public"."historical_games" TO "authenticated";
GRANT ALL ON TABLE "public"."historical_games" TO "service_role";



GRANT ALL ON TABLE "public"."historical_rosters" TO "anon";
GRANT ALL ON TABLE "public"."historical_rosters" TO "authenticated";
GRANT ALL ON TABLE "public"."historical_rosters" TO "service_role";



GRANT ALL ON TABLE "public"."historical_seasons" TO "anon";
GRANT ALL ON TABLE "public"."historical_seasons" TO "authenticated";
GRANT ALL ON TABLE "public"."historical_seasons" TO "service_role";



GRANT ALL ON TABLE "public"."historical_teams" TO "anon";
GRANT ALL ON TABLE "public"."historical_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."historical_teams" TO "service_role";



GRANT ALL ON TABLE "public"."league_franchises" TO "anon";
GRANT ALL ON TABLE "public"."league_franchises" TO "authenticated";
GRANT ALL ON TABLE "public"."league_franchises" TO "service_role";



GRANT ALL ON TABLE "public"."mv_franchise_career_stats" TO "anon";
GRANT ALL ON TABLE "public"."mv_franchise_career_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_franchise_career_stats" TO "service_role";



GRANT ALL ON TABLE "public"."mv_season_leaderboards" TO "anon";
GRANT ALL ON TABLE "public"."mv_season_leaderboards" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_season_leaderboards" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."mv_transaction_leaderboards" TO "anon";
GRANT ALL ON TABLE "public"."mv_transaction_leaderboards" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_transaction_leaderboards" TO "service_role";



GRANT ALL ON TABLE "public"."nfl_week_calendar" TO "anon";
GRANT ALL ON TABLE "public"."nfl_week_calendar" TO "authenticated";
GRANT ALL ON TABLE "public"."nfl_week_calendar" TO "service_role";



GRANT ALL ON TABLE "public"."pick_em_results" TO "anon";
GRANT ALL ON TABLE "public"."pick_em_results" TO "authenticated";
GRANT ALL ON TABLE "public"."pick_em_results" TO "service_role";



GRANT ALL ON TABLE "public"."pick_em_season_standings" TO "anon";
GRANT ALL ON TABLE "public"."pick_em_season_standings" TO "authenticated";
GRANT ALL ON TABLE "public"."pick_em_season_standings" TO "service_role";



GRANT ALL ON TABLE "public"."pick_em_submissions" TO "anon";
GRANT ALL ON TABLE "public"."pick_em_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."pick_em_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."pick_em_submissions_backup" TO "anon";
GRANT ALL ON TABLE "public"."pick_em_submissions_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."pick_em_submissions_backup" TO "service_role";



GRANT ALL ON TABLE "public"."pick_em_weekly_scores" TO "anon";
GRANT ALL ON TABLE "public"."pick_em_weekly_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."pick_em_weekly_scores" TO "service_role";



GRANT ALL ON TABLE "public"."pick_em_weeks" TO "anon";
GRANT ALL ON TABLE "public"."pick_em_weeks" TO "authenticated";
GRANT ALL ON TABLE "public"."pick_em_weeks" TO "service_role";



GRANT ALL ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON TABLE "public"."playoff_config" TO "anon";
GRANT ALL ON TABLE "public"."playoff_config" TO "authenticated";
GRANT ALL ON TABLE "public"."playoff_config" TO "service_role";



GRANT ALL ON TABLE "public"."playoff_picks" TO "anon";
GRANT ALL ON TABLE "public"."playoff_picks" TO "authenticated";
GRANT ALL ON TABLE "public"."playoff_picks" TO "service_role";



GRANT ALL ON TABLE "public"."playoffs_2025" TO "anon";
GRANT ALL ON TABLE "public"."playoffs_2025" TO "authenticated";
GRANT ALL ON TABLE "public"."playoffs_2025" TO "service_role";



GRANT ALL ON TABLE "public"."playoffs_2025_config" TO "anon";
GRANT ALL ON TABLE "public"."playoffs_2025_config" TO "authenticated";
GRANT ALL ON TABLE "public"."playoffs_2025_config" TO "service_role";



GRANT ALL ON TABLE "public"."power_rankings_history" TO "anon";
GRANT ALL ON TABLE "public"."power_rankings_history" TO "authenticated";
GRANT ALL ON TABLE "public"."power_rankings_history" TO "service_role";



GRANT ALL ON TABLE "public"."roster_history" TO "anon";
GRANT ALL ON TABLE "public"."roster_history" TO "authenticated";
GRANT ALL ON TABLE "public"."roster_history" TO "service_role";



GRANT ALL ON TABLE "public"."rosters" TO "anon";
GRANT ALL ON TABLE "public"."rosters" TO "authenticated";
GRANT ALL ON TABLE "public"."rosters" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."roster_stats" TO "anon";
GRANT ALL ON TABLE "public"."roster_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."roster_stats" TO "service_role";



GRANT ALL ON TABLE "public"."season_awards" TO "anon";
GRANT ALL ON TABLE "public"."season_awards" TO "authenticated";
GRANT ALL ON TABLE "public"."season_awards" TO "service_role";



GRANT ALL ON TABLE "public"."seasons" TO "anon";
GRANT ALL ON TABLE "public"."seasons" TO "authenticated";
GRANT ALL ON TABLE "public"."seasons" TO "service_role";



GRANT ALL ON TABLE "public"."sync_runs" TO "anon";
GRANT ALL ON TABLE "public"."sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_runs" TO "service_role";



GRANT ALL ON TABLE "public"."team_transactions" TO "anon";
GRANT ALL ON TABLE "public"."team_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."team_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."transactions_2025" TO "anon";
GRANT ALL ON TABLE "public"."transactions_2025" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions_2025" TO "service_role";



GRANT ALL ON TABLE "public"."transactions_2025_legacy" TO "anon";
GRANT ALL ON TABLE "public"."transactions_2025_legacy" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions_2025_legacy" TO "service_role";



GRANT ALL ON TABLE "public"."v_active_season" TO "anon";
GRANT ALL ON TABLE "public"."v_active_season" TO "authenticated";
GRANT ALL ON TABLE "public"."v_active_season" TO "service_role";



GRANT ALL ON TABLE "public"."v_game_results" TO "anon";
GRANT ALL ON TABLE "public"."v_game_results" TO "authenticated";
GRANT ALL ON TABLE "public"."v_game_results" TO "service_role";



GRANT ALL ON TABLE "public"."v_team_standings" TO "anon";
GRANT ALL ON TABLE "public"."v_team_standings" TO "authenticated";
GRANT ALL ON TABLE "public"."v_team_standings" TO "service_role";



GRANT ALL ON TABLE "public"."v_franchise_career" TO "anon";
GRANT ALL ON TABLE "public"."v_franchise_career" TO "authenticated";
GRANT ALL ON TABLE "public"."v_franchise_career" TO "service_role";



GRANT ALL ON TABLE "public"."v_head_to_head" TO "anon";
GRANT ALL ON TABLE "public"."v_head_to_head" TO "authenticated";
GRANT ALL ON TABLE "public"."v_head_to_head" TO "service_role";



GRANT ALL ON TABLE "public"."v_record_book" TO "anon";
GRANT ALL ON TABLE "public"."v_record_book" TO "authenticated";
GRANT ALL ON TABLE "public"."v_record_book" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_lineups" TO "anon";
GRANT ALL ON TABLE "public"."weekly_lineups" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_lineups" TO "service_role";



GRANT ALL ON TABLE "public"."weeks" TO "anon";
GRANT ALL ON TABLE "public"."weeks" TO "authenticated";
GRANT ALL ON TABLE "public"."weeks" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































