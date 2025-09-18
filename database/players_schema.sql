create table public.players (
  id uuid not null default extensions.uuid_generate_v4 (),
  espn_player_id integer null,
  name text not null,
  position text not null,
  team_abbreviation text null,
  jersey_number integer null,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  espn_data jsonb null default '{}'::jsonb,
  projected_points numeric(10, 2) null default 0,
  actual_points numeric(10, 2) null default 0,
  season_projected_points numeric(10, 2) null default 0,
  season_actual_points numeric(10, 2) null default 0,
  games_played integer null default 0,
  average_points_per_game numeric(8, 2) null default 0,
  projected_average numeric(8, 2) null default 0,
  injury_status text null default 'ACTIVE'::text,
  percent_owned numeric(5, 2) null default 0,
  percent_started numeric(5, 2) null default 0,
  pro_team_id integer null,
  pro_team_name text null,
  last_stats_sync timestamp with time zone null,
  espn_last_updated timestamp with time zone null,
  constraint players_pkey primary key (id),
  constraint players_espn_id_unique unique (espn_player_id),
  constraint players_injury_status_check check (
    (
      injury_status = any (
        array[
          'ACTIVE'::text,
          'QUESTIONABLE'::text,
          'DOUBTFUL'::text,
          'OUT'::text,
          'IR'::text,
          'SUSPENDED'::text,
          'PUP'::text
        ]
      )
    )
  ),
  constraint players_name_check check ((length(name) > 0)),
  constraint players_position_check check (
    (
      "position" = any (
        array[
          'QB'::text,
          'RB'::text,
          'WR'::text,
          'TE'::text,
          'K'::text,
          'D/ST'::text,
          'DL'::text,
          'LB'::text,
          'DB'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_players_espn_id on public.players using btree (espn_player_id) TABLESPACE pg_default;

create index IF not exists idx_players_position on public.players using btree ("position") TABLESPACE pg_default;

create index IF not exists idx_players_team on public.players using btree (team_abbreviation) TABLESPACE pg_default;

create index IF not exists idx_players_active on public.players using btree (is_active) TABLESPACE pg_default;

create index IF not exists idx_players_points on public.players using btree (season_actual_points desc) TABLESPACE pg_default;

create index IF not exists idx_players_projected on public.players using btree (season_projected_points desc) TABLESPACE pg_default;

create index IF not exists idx_players_position_points on public.players using btree ("position", season_actual_points desc) TABLESPACE pg_default;

create index IF not exists idx_players_injury_status on public.players using btree (injury_status) TABLESPACE pg_default;

create index IF not exists idx_players_ownership on public.players using btree (percent_owned desc) TABLESPACE pg_default;

create trigger calculate_player_averages BEFORE
update OF season_actual_points,
season_projected_points,
games_played on players for EACH row
execute FUNCTION update_player_averages ();

create trigger update_players_updated_at BEFORE
update on players for EACH row
execute FUNCTION update_updated_at_column ();

