-- Debug script to check RLS policies and admin status

-- 1. Check if the RLS policies exist
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'awards_2025';

-- 2. Check your admin status (run this while logged in)
SELECT
    auth.uid() as current_user_id,
    is_admin() as am_i_admin,
    (SELECT raw_user_meta_data->>'isAdmin' FROM auth.users WHERE id = auth.uid()) as admin_flag;

-- 3. Try a simple update test (replace the UUID with your award ID)
-- UPDATE awards_2025
-- SET title = title
-- WHERE id = '313ff952-1f4c-48ea-93b9-18f149c82bb5'
-- RETURNING *;
