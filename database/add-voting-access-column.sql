-- Add column to control whether voting is open to all authenticated users
ALTER TABLE awards_metadata
ADD COLUMN IF NOT EXISTS voting_open_to_all BOOLEAN DEFAULT FALSE;

-- Update the unlock status function to include this field
CREATE OR REPLACE FUNCTION check_awards_unlock_status(season_id_param UUID)
RETURNS JSONB AS $$
DECLARE
    unique_voters INTEGER;
    metadata_record RECORD;
    is_released BOOLEAN := FALSE;
    voting_open BOOLEAN := FALSE;
    metadata_deadline TIMESTAMPTZ := NULL;
BEGIN
    -- Get unique voters count
    SELECT COUNT(DISTINCT user_id) INTO unique_voters
    FROM award_votes av
    JOIN awards_2025 a ON av.award_id = a.id
    WHERE a.season_id = season_id_param;

    -- Get metadata (may not exist yet)
    SELECT * INTO metadata_record FROM awards_metadata WHERE season_id = season_id_param;

    -- Check if metadata record exists before accessing fields
    IF metadata_record IS NOT NULL THEN
        IF metadata_record.results_released IS NOT NULL AND metadata_record.results_released THEN
            is_released := TRUE;
        END IF;

        IF metadata_record.voting_open_to_all IS NOT NULL AND metadata_record.voting_open_to_all THEN
            voting_open := TRUE;
        END IF;

        metadata_deadline := metadata_record.deadline;
    END IF;

    RETURN jsonb_build_object(
        'unique_voters', unique_voters,
        'required_voters', 14,
        'results_released', is_released,
        'voting_open_to_all', voting_open,
        'deadline', metadata_deadline
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
