-- 2024 week 1: the league's own record of a week ESPN no longer has.
--
-- The league was wiped and restarted on ESPN in 2024 after week 1 had already
-- been played, so the restarted league has no week-1 matchups and never will.
-- These seven results were imported by hand in November 2025 and confirmed by
-- the league admin on 2026-09-15. This file is the durable copy: re-applying it
-- restores the scores if anything ever changes them.
--
--   Arya Shah           91.26 – 138.36  Pranesh Anand
--   Harshil Pareek     121.42 – 129.64  Anand Kanumuru
--   Sai Rav             88.18 –  76.82  Aaron Wadhwa
--   Aashish Gatamaneni  92.80 – 134.46  Aditya Penmesta
--   Rohit Ramki        128.34 – 117.48  Pranav Simha
--   Eshan Kaul          84.52 – 118.58  Rohith Mahesh
--   Humza Khalil       103.76 – 107.28  Nikhil Sharma
--
-- Team names in effect that week (before the restart), for the record:
-- Lightskin Empire (Humza), Sugma (Nikhil), Comeback season (Arya), Adi is mean
-- (Pranesh), This Year Killas (Harshil), Back 2 Back (Anand), Ginders (Aashish),
-- Chip or bust (Aditya), Glizzy Galaxy (Aaron), GrandPinto (Rohit), P33N Time
-- (Pranav), U dont have horse 🍆 (Eshan), Dirty Dahmers (Rohith), Team Honka (Sai).
--
-- `games.hand_entered` marks a row as the league's own result. The ESPN
-- planner (`services/espnGameMapper.js::planGameWrites`) leaves such a row
-- exactly as it is — no score, pairing, week or ESPN id is patched — because
-- ESPN has nothing true to correct it with. There are no player lineups for
-- the week for the same reason, so the lineup records do not include it.
--
-- Scores only move if they differ, and a regular-season score update fires no
-- trigger with a side effect: `before_game_update` recomputes the derived
-- columns identically and keeps `completed_at`.

alter table public.games
  add column if not exists hand_entered boolean not null default false;

comment on column public.games.hand_entered is
  'The league''s own result for a game ESPN does not have (2024 week 1, played before the league was restarted). The ESPN sync never patches a hand-entered row.';

with results (owner1, score1, owner2, score2) as (
  values
    ('Arya Shah',           91.26, 'Pranesh Anand',   138.36),
    ('Harshil Pareek',     121.42, 'Anand Kanumuru',  129.64),
    ('Sai Rav',             88.18, 'Aaron Wadhwa',     76.82),
    ('Aashish Gatamaneni',  92.80, 'Aditya Penmesta', 134.46),
    ('Rohit Ramki',        128.34, 'Pranav Simha',    117.48),
    ('Eshan Kaul',          84.52, 'Rohith Mahesh',   118.58),
    ('Humza Khalil',       103.76, 'Nikhil Sharma',   107.28)
)
update public.games g
   set team1_score  = case when t1.owner = r.owner1 then r.score1 else r.score2 end,
       team2_score  = case when t1.owner = r.owner1 then r.score2 else r.score1 end,
       hand_entered = true
  from results r, public.teams t1, public.teams t2, public.seasons s
 where s.year = 2024
   and g.season_id = s.id
   and g.week = 1
   and t1.id = g.team1_id
   and t2.id = g.team2_id
   and ((t1.owner = r.owner1 and t2.owner = r.owner2)
     or (t1.owner = r.owner2 and t2.owner = r.owner1));

do $$
declare
  confirmed integer;
begin
  select count(*) into confirmed
    from public.games g
    join public.seasons s on s.id = g.season_id
   where s.year = 2024 and g.week = 1 and g.hand_entered
     and g.type = 'regular'
     and g.team1_score is not null and g.team2_score is not null;

  if confirmed <> 7 then
    raise exception '2024 week 1: expected 7 hand-entered results, found %', confirmed;
  end if;
end
$$;
