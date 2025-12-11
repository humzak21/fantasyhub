-- =============================================
-- PLAYOFFS 2025 BRACKET CHALLENGE SCHEMA
-- =============================================
-- Submission Deadline: December 12th, 2025 at 8:15 PM EST
-- Structure: 6-team playoff bracket + 8-team consolation bracket
-- =============================================

-- Playoff bracket picks table
create table public.playoffs_2025 (
  id uuid not null default extensions.uuid_generate_v4(),
  user_id uuid not null default auth.uid(),
  season_id uuid not null,
  -- matchup_id identifies the bracket slot:
  -- Playoffs: "div1_r1" (Div 1 Round 1), "div2_r1", "div1_semi", "div2_semi", "championship"
  -- Consolation: "con_r1_1", "con_r1_2", etc., "con_semi_1", "con_semi_2", "con_finals"
  matchup_id text not null,
  -- The game this matchup corresponds to (for result checking)
  game_id uuid null,
  predicted_winner_team_id uuid not null,
  actual_winner_team_id uuid null,
  is_correct boolean null,
  points_earned integer null default 0,
  submitted_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  constraint playoffs_2025_pkey primary key (id),
  constraint playoffs_2025_user_matchup_unique unique (user_id, matchup_id),
  constraint playoffs_2025_season_id_fkey foreign key (season_id) references seasons(id) on delete cascade,
  constraint playoffs_2025_game_id_fkey foreign key (game_id) references games(id) on delete set null,
  constraint playoffs_2025_predicted_winner_fkey foreign key (predicted_winner_team_id) references teams(id),
  constraint playoffs_2025_actual_winner_fkey foreign key (actual_winner_team_id) references teams(id)
) tablespace pg_default;

-- Indexes for efficient queries
create index if not exists idx_playoffs_2025_user on public.playoffs_2025 using btree (user_id) tablespace pg_default;
create index if not exists idx_playoffs_2025_season on public.playoffs_2025 using btree (season_id) tablespace pg_default;
create index if not exists idx_playoffs_2025_matchup on public.playoffs_2025 using btree (matchup_id) tablespace pg_default;
create index if not exists idx_playoffs_2025_game on public.playoffs_2025 using btree (game_id) tablespace pg_default;

-- Triggers for timestamps
create trigger set_playoffs_2025_user_id before insert on playoffs_2025 
  for each row execute function set_user_id();

create trigger update_playoffs_2025_updated_at before update on playoffs_2025 
  for each row execute function update_updated_at_column();

-- =============================================
-- CONFIGURATION TABLE
-- =============================================
create table public.playoffs_2025_config (
  id uuid not null default extensions.uuid_generate_v4(),
  season_id uuid not null,
  submission_deadline timestamp with time zone not null default '2025-12-12 20:15:00-05'::timestamptz,
  results_released boolean default false,
  -- bracket_data stores the seeding structure:
  -- { "playoffs": { "div1": [team_ids], "div2": [team_ids] }, 
  --   "consolation": [team_ids sorted by record] }
  bracket_data jsonb null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  constraint playoffs_2025_config_pkey primary key (id),
  constraint playoffs_2025_config_season_unique unique (season_id),
  constraint playoffs_2025_config_season_fkey foreign key (season_id) references seasons(id) on delete cascade
) tablespace pg_default;

create trigger update_playoffs_2025_config_updated_at before update on playoffs_2025_config 
  for each row execute function update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on both tables
alter table public.playoffs_2025 enable row level security;
alter table public.playoffs_2025_config enable row level security;

-- PLAYOFFS_2025 POLICIES --

-- Anyone can view picks (public read)
create policy "Public can view playoff picks"
  on public.playoffs_2025 for select
  using (true);

-- Authenticated users can insert their own picks (before deadline)
create policy "Users can insert own picks"
  on public.playoffs_2025 for insert
  with check (
    auth.uid() = user_id
    and now() < '2025-12-12 20:15:00-05'::timestamptz
  );

-- Authenticated users can update their own picks (before deadline)
create policy "Users can update own picks"
  on public.playoffs_2025 for update
  using (
    auth.uid() = user_id
    and now() < '2025-12-12 20:15:00-05'::timestamptz
  );

-- Admin can do anything (for result calculation)
create policy "Admin full access to playoff picks"
  on public.playoffs_2025 for all
  using (auth.jwt() ->> 'email' = 'humzak2001@gmail.com');

-- PLAYOFFS_2025_CONFIG POLICIES --

-- Anyone can view config
create policy "Public can view playoff config"
  on public.playoffs_2025_config for select
  using (true);

-- Only admin can modify config
create policy "Admin can manage playoff config"
  on public.playoffs_2025_config for all
  using (auth.jwt() ->> 'email' = 'humzak2001@gmail.com');

-- =============================================
-- AUTO-CALCULATE RESULTS TRIGGER
-- =============================================
-- This function updates playoff picks when a game completes

create or replace function update_playoff_pick_results()
returns trigger as $$
begin
  -- When a game is completed, update any playoff picks that reference it
  if new.winner_team_id is not null and (old.winner_team_id is null or old.winner_team_id != new.winner_team_id) then
    update playoffs_2025
    set 
      actual_winner_team_id = new.winner_team_id,
      is_correct = (predicted_winner_team_id = new.winner_team_id),
      points_earned = case when predicted_winner_team_id = new.winner_team_id then 1 else 0 end,
      updated_at = now()
    where game_id = new.id;
  end if;
  
  return new;
end;
$$ language plpgsql security definer;

-- Trigger on games table to auto-update playoff results
create trigger update_playoff_results_on_game_complete
  after update on games
  for each row
  when (new.type like 'playoff%' or new.type like 'consolation%')
  execute function update_playoff_pick_results();

-- =============================================
-- HELPER FUNCTION: Submit playoff picks
-- =============================================
create or replace function submit_playoff_picks(
  p_season_id uuid,
  p_picks jsonb -- Array of {matchup_id, predicted_winner_team_id, game_id?}
)
returns jsonb as $$
declare
  pick_record jsonb;
  deadline timestamptz;
  result_count int := 0;
begin
  -- Check deadline
  select submission_deadline into deadline
  from playoffs_2025_config
  where season_id = p_season_id;
  
  if deadline is null then
    deadline := '2025-12-12 20:15:00-05'::timestamptz;
  end if;
  
  if now() > deadline then
    raise exception 'Submission deadline has passed';
  end if;
  
  -- Upsert each pick
  for pick_record in select * from jsonb_array_elements(p_picks)
  loop
    insert into playoffs_2025 (
      user_id, 
      season_id, 
      matchup_id, 
      game_id,
      predicted_winner_team_id
    )
    values (
      auth.uid(),
      p_season_id,
      pick_record->>'matchup_id',
      (pick_record->>'game_id')::uuid,
      (pick_record->>'predicted_winner_team_id')::uuid
    )
    on conflict (user_id, matchup_id) 
    do update set
      predicted_winner_team_id = excluded.predicted_winner_team_id,
      game_id = excluded.game_id,
      updated_at = now();
    
    result_count := result_count + 1;
  end loop;
  
  return jsonb_build_object(
    'success', true,
    'picks_submitted', result_count
  );
end;
$$ language plpgsql security definer;
