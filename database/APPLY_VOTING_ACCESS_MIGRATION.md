# Apply Voting Access Migration

Follow these steps to add the voting access toggle feature:

## Step 1: Apply the Database Migration

1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste the entire contents of `add-voting-access-column.sql` (shown below)
5. Click "Run" or press Cmd/Ctrl + Enter

```sql
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
```

## Step 2: Verify the Migration

After running the SQL, verify it worked:

1. In Supabase SQL Editor, run:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'awards_metadata';
```

You should see `voting_open_to_all` in the list.

## Step 3: Test the Toggle

1. Refresh your app
2. Go to the Awards section (as admin)
3. Click the Admin tab
4. Try toggling the "Awards Section Access" switch
5. Check the browser console (F12) for any errors

## Troubleshooting

If the toggle still doesn't work:

1. Check the browser console (F12) for error messages
2. Make sure you're logged in as an admin
3. Verify the column exists in the database
4. Check that there's an active season in your database
