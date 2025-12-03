-- Fix get_users_for_admin function to use email-based admin check
-- Admin email: humzak2001@gmail.com

CREATE OR REPLACE FUNCTION get_users_for_admin(user_ids UUID[])
RETURNS TABLE (
    id UUID,
    email TEXT,
    display_name TEXT
) AS $$
BEGIN
  -- Strict admin check using email (matching the pattern in awards RLS policies)
  IF (auth.jwt() ->> 'email'::text) != 'humzak2001@gmail.com'::text THEN
    RAISE EXCEPTION 'Admin access required. Unauthorized access to user details is not permitted.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Additional validation: limit the number of users that can be queried at once
  IF array_length(user_ids, 1) > 100 THEN
    RAISE EXCEPTION 'Too many user IDs requested. Maximum 100 allowed per request.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Return basic user details from auth.users with explicit casting
  RETURN QUERY
  SELECT
    au.id,
    au.email::TEXT,
    COALESCE(
      (au.raw_user_meta_data->>'full_name')::TEXT,
      (au.raw_user_meta_data->>'name')::TEXT,
      au.email::TEXT
    ) as display_name
  FROM auth.users au
  WHERE au.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION get_users_for_admin(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_users_for_admin(UUID[]) TO anon;
