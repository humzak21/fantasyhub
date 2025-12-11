create table public.games (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null default auth.uid (),
  season_id uuid not null,
  week integer not null,
  team1_id uuid not null,
  team2_id uuid null,
  team1_score numeric(10, 2) null,
  team2_score numeric(10, 2) null,
  type text null default 'regular'::text,
  is_completed boolean GENERATED ALWAYS as (
    (
      (team1_score is not null)
      and (team2_score is not null)
    )
  ) STORED null,
  winner_team_id uuid null,
  loser_team_id uuid null,
  is_tie boolean null default false,
  point_differential numeric(10, 2) null default 0,
  is_blowout boolean null default false,
  is_close boolean null default false,
  completed_at timestamp with time zone null,
  slot integer null,
  constraint games_pkey primary key (id),

  constraint games_week_teams_unique unique (season_id, week, team1_id, team2_id),
  constraint games_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint games_team1_id_fkey foreign KEY (team1_id) references teams (id) on delete CASCADE,
  constraint games_team2_id_fkey foreign KEY (team2_id) references teams (id) on delete CASCADE,
  constraint games_winner_team_id_fkey foreign KEY (winner_team_id) references teams (id),
  constraint games_loser_team_id_fkey foreign KEY (loser_team_id) references teams (id),
  constraint games_week_check check ((week > 0)),
  constraint games_type_check check (
    (
      type = any (
        array[
          'regular'::text,
          'playoff'::text,
          'playoff_championship'::text,
          'playoff_semifinals'::text,
          'playoff_quarterfinals'::text,
          'playoff_first_round'::text,
          'playoff_consolation_championship'::text,
          'playoff_consolation_semifinals'::text,
          'bye'::text
        ]
      )
    )
  ),
  constraint games_different_teams check ((team1_id <> team2_id))
) TABLESPACE pg_default;

create index IF not exists idx_games_season_week on public.games using btree (season_id, week) TABLESPACE pg_default;

create index IF not exists idx_games_teams on public.games using btree (team1_id, team2_id) TABLESPACE pg_default;

create trigger after_game_completion
after INSERT
or
update on games for EACH row
execute FUNCTION after_game_completion ();

create trigger before_game_update BEFORE INSERT
or
update on games for EACH row
execute FUNCTION trigger_update_team_stats ();

create trigger set_games_user_id BEFORE INSERT on games for EACH row
execute FUNCTION set_user_id ();