# Authentication Setup Guide

This guide will help you set up Supabase authentication for your Movie Tracker application.

## Prerequisites

1. A Supabase account and project
2. Your Supabase project URL and anon key

## Setup Steps

### 1. Configure Environment Variables

Make sure your `.env` file contains the following variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

You can find these values in your Supabase project dashboard:
- Go to Settings → API
- Copy the "Project URL" and "anon public" key

### 2. Enable Authentication in Supabase

1. Go to your Supabase project dashboard
2. Navigate to Authentication → Settings
3. Configure the following settings:

#### Site URL
Set your site URL to match your application:
- Development: `http://localhost:5173`
- Production: Your deployed app URL

#### Email Templates (Optional)
You can customize the email templates for:
- Confirm signup
- Reset password
- Magic link

#### Providers (Optional)
Enable additional authentication providers if needed:
- Google
- GitHub
- Discord
- etc.

### 3. Configure Email Settings

For password reset functionality to work properly:

1. Go to Authentication → Settings → SMTP Settings
2. Either use Supabase's built-in email service or configure your own SMTP provider
3. Test the email functionality

### 4. Database Setup (Optional)

The authentication system works out of the box, but you may want to:

1. Create user profiles table:
```sql
create table profiles (
  id uuid references auth.users on delete cascade,
  updated_at timestamp with time zone,
  username text unique,
  full_name text,
  avatar_url text,
  website text,

  primary key (id),
  constraint username_length check (char_length(username) >= 3)
);

alter table profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );
```

2. Create a function to automatically create profiles:
```sql
-- inserts a row into public.profiles
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;

-- trigger the function every time a user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## Features Included

### Authentication Context
- User state management
- Sign up, sign in, sign out functions
- Password reset functionality
- Loading and error states

### Protected Routes
- `/admin` route is protected and requires authentication
- Automatic redirect to login page for unauthenticated users
- Redirect back to intended page after login

### UI Components
- Login/Signup page with email/password authentication
- Password reset page
- Admin dashboard placeholder
- Navigation updates based on authentication state

### Security Features
- Email verification (configurable)
- Password strength requirements
- Secure session management
- Automatic token refresh

## Usage

### Accessing the Admin Area

1. Navigate to `/login` or click the "Login" link in the navigation
2. Create an account or sign in with existing credentials
3. Once authenticated, you'll be redirected to the admin dashboard
4. The navigation will show "Admin" instead of "Login"

### Future Development

The admin page is currently a placeholder. You can extend it to include:
- Database management forms
- User management
- Content moderation tools
- Analytics and reporting
- System configuration

### Testing

To test the authentication system:

1. Start your development server: `npm run dev`
2. Navigate to `http://localhost:5173/login`
3. Create a test account
4. Verify the email confirmation process (if enabled)
5. Test login/logout functionality
6. Try accessing `/admin` without authentication
7. Test password reset functionality

## Troubleshooting

### Common Issues

1. **"Supabase not configured" warning**
   - Check your environment variables
   - Ensure `.env` file is in the project root
   - Restart your development server

2. **Email not sending**
   - Check SMTP configuration in Supabase
   - Verify email templates are enabled
   - Check spam folder

3. **Redirect issues**
   - Verify Site URL in Supabase settings
   - Check redirect URLs in authentication settings

4. **CORS errors**
   - Add your domain to allowed origins in Supabase

### Support

For additional help:
- Check the [Supabase documentation](https://supabase.com/docs/guides/auth)
- Review the [React Auth guide](https://supabase.com/docs/guides/auth/auth-helpers/auth-ui)
- Check the browser console for detailed error messages 