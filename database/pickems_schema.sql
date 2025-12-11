create table public.pick_em_submissions (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null default auth.uid (),
  pick_em_week_id uuid not null,
  game_id uuid not null,
  predicted_winner_team_id uuid not null,
  confidence_level integer null default 1,
  submitted_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint pick_em_submissions_pkey primary key (id),
  constraint pick_em_submissions_user_game_unique unique (user_id, pick_em_week_id, game_id),
  constraint pick_em_submissions_game_id_fkey foreign KEY (game_id) references games (id) on delete CASCADE,
  constraint pick_em_submissions_pick_em_week_id_fkey foreign KEY (pick_em_week_id) references pick_em_weeks (id) on delete CASCADE,
  constraint pick_em_submissions_predicted_winner_team_id_fkey foreign KEY (predicted_winner_team_id) references teams (id) on delete CASCADE,
  constraint pick_em_submissions_confidence_level_check check (
    (
      (confidence_level >= 1)
      and (confidence_level <= 10)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_pick_em_submissions_user_week on public.pick_em_submissions using btree (user_id, pick_em_week_id) TABLESPACE pg_default;

create index IF not exists idx_pick_em_submissions_game on public.pick_em_submissions using btree (game_id) TABLESPACE pg_default;

create trigger set_pick_em_submissions_user_id BEFORE INSERT on pick_em_submissions for EACH row
execute FUNCTION set_user_id ();

create trigger trigger_backup_pick_em_submissions
after INSERT
or DELETE
or
update on pick_em_submissions for EACH row
execute FUNCTION backup_pick_em_submissions ();

create trigger update_pick_em_submissions_updated_at BEFORE
update on pick_em_submissions for EACH row
execute FUNCTION update_updated_at_column ();

create table public.pick_em_weeks (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null default auth.uid (),
  season_id uuid not null,
  week_number integer not null,
  submission_opens_at timestamp with time zone not null,
  submission_closes_at timestamp with time zone not null,
  results_reveal_at timestamp with time zone not null,
  is_active boolean null default false,
  is_closed boolean null default false,
  is_completed boolean null default false,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint pick_em_weeks_pkey primary key (id),
  constraint pick_em_weeks_season_week_unique unique (season_id, week_number),
  constraint pick_em_weeks_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint pick_em_weeks_valid_reveal check ((submission_closes_at < results_reveal_at)),
  constraint pick_em_weeks_valid_window check ((submission_opens_at < submission_closes_at)),
  constraint pick_em_weeks_week_number_check check ((week_number > 0))
) TABLESPACE pg_default;

create index IF not exists idx_pick_em_weeks_season on public.pick_em_weeks using btree (season_id, week_number) TABLESPACE pg_default;

create index IF not exists idx_pick_em_weeks_status on public.pick_em_weeks using btree (is_active, is_closed, is_completed) TABLESPACE pg_default;

create trigger set_pick_em_weeks_user_id BEFORE INSERT on pick_em_weeks for EACH row
execute FUNCTION set_user_id ();

create trigger update_pick_em_weeks_updated_at BEFORE
update on pick_em_weeks for EACH row
execute FUNCTION update_updated_at_column ();