create table public.divisions (
  id serial not null,
  season_id uuid null,
  name character varying(100) not null default 'Division'::character varying,
  display_order integer not null default 1,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint divisions_pkey primary key (id),
  constraint divisions_season_id_display_order_key unique (season_id, display_order),
  constraint divisions_season_id_name_key unique (season_id, name),
  constraint divisions_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_divisions_season_id on public.divisions using btree (season_id) TABLESPACE pg_default;

create trigger update_divisions_updated_at BEFORE
update on divisions for EACH row
execute FUNCTION update_updated_at_column ();