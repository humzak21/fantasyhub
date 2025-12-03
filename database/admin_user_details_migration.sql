-- Migration to create get_users_for_admin RPC function
-- This function allows admin users to retrieve user details for pick'em submissions
-- Admin email: humzak2001@gmail.com

-- Create the RPC function to get user details for admin
-- SECURITY DEFINER allows the function to access auth.users table
CREATE OR REPLACE FUNCTION get_users_for_admin(user_ids UUID[])
RETURNS TABLE (
    id UUID,
    email TEXT,
    display_name TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Check if the current user is an admin
  -- Using email-based check to match the pattern used in awards RLS policies
  IF (auth.jwt() ->> 'email'::text) != 'humzak2001@gmail.com'::text THEN
    RAISE EXCEPTION 'Admin access required. Unauthorized access to user details is not permitted.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Return user details for the specified user IDs
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'display_name', u.email) as display_name,
    u.created_at
  FROM auth.users u
  WHERE u.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_users_for_admin(UUID[]) TO authenticated;

-- Grant execute permission to anon users (for public viewing of submissions)
GRANT EXECUTE ON FUNCTION get_users_for_admin(UUID[]) TO anon;
