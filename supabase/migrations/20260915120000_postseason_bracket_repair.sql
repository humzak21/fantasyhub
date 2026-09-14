-- Postseason bracket repair: type 2020-24's postseason games, fix the brackets
-- that were flagged wrong, and make `is_playoff` mean the bracket.
--
-- Until this migration every postseason game before 2025 was typed flat
-- `playoff`, so a bracket game and a consolation game were the same thing to
-- every reader: `v_game_results.is_playoff` was `type like 'playoff%'`, and a
-- team knocked out in round one that went on to beat two non-playoff teams in
-- the consolation ladder had a 2-1 playoff record. 2025 was hand-typed
-- (first round, semis, championship, consolation rounds, and flat `playoff`
-- for the placement games between bracket teams); this gives every earlier
-- season the same vocabulary, derived rather than guessed.
--
-- The derivation walks the bracket backwards from the one fact nobody has
-- disputed — who finished champion and 2nd:
--
--   finalists      playoff_finish in ('champion', '2nd')
--   semifinalists  whoever a finalist played in the week before the final
--   round-1 losers whoever a semifinalist beat two weeks before the final
--
-- which gives exactly six teams in every season 2020-2025. It also exposed
-- two seasons whose stored flags were wrong:
--
--   2021  Rohith Mahesh (semifinalist, 4th) and Aashish Gatamaneni (round-1
--         loser, 5th) were `made_playoffs = false`, finish `none`; Aaron Wadhwa
--         and Nikhil Sharma were flagged into a bracket they never played in,
--         with the out-of-vocabulary finish `playoffs`.
--   2024  Anand Kanumuru (3rd) was unflagged; Eshan Kaul was flagged.
--
-- A playoff game is a game between two bracket teams — round one, semis, the
-- final, and the 3rd/5th-place games. Everything else in the postseason is
-- consolation. `type` is written on insert and never updated by the sync
-- (`services/espnGameMapper.js`), so these types survive every run, exactly as
-- the hand-typed 2025 rows do.
--
-- A type-only update is side-effect free: `before_game_update` recomputes the
-- derived columns identically and keeps `completed_at`, `after_game_completion`
-- fires only when `is_completed` flips, and the playoff-pick trigger only when
-- `winner_team_id` changes.

-- ---------------------------------------------------------------------------
-- 1. The bracket, per completed season, from the game graph.
-- ---------------------------------------------------------------------------

create temp table _pb_games as
select g.id, g.season_id, g.week, g.team1_id, g.team2_id, g.team1_score, g.team2_score, g.type
from games g
join seasons s on s.id = g.season_id
where s.is_completed
  and g.type like 'playoff%'
  and g.team2_id is not null
  and g.team1_score is not null
  and g.team2_score is not null;

create temp table _pb_side as
select id, season_id, week, team1_id as team_id, team2_id as opp_id, team1_score > team2_score as won
from _pb_games
union all
select id, season_id, week, team2_id, team1_id, team2_score > team1_score
from _pb_games;

create temp table _pb_last as
select season_id, max(week) as final_week from _pb_games group by season_id;

create temp table _pb_role (season_id uuid, team_id uuid, role text);

insert into _pb_role
select t.season_id, t.id, 'finalist'
from teams t
where t.playoff_finish in ('champion', '2nd')
  and t.season_id in (select season_id from _pb_last);

insert into _pb_role
select distinct s.season_id, s.opp_id, 'semifinalist'
from _pb_side s
join _pb_last l on l.season_id = s.season_id
join _pb_role r on r.season_id = s.season_id and r.team_id = s.team_id and r.role = 'finalist'
where s.week = l.final_week - 1;

insert into _pb_role
select distinct s.season_id, s.opp_id, 'first_round'
from _pb_side s
join _pb_last l on l.season_id = s.season_id
join _pb_role r on r.season_id = s.season_id and r.team_id = s.team_id
                and r.role in ('finalist', 'semifinalist')
where s.week = l.final_week - 2
  and s.won;

-- ---------------------------------------------------------------------------
-- 2. Type every flat postseason game by its role in the bracket.
--
-- Only seasons whose postseason is still entirely flat `playoff`; a season
-- that already carries granular types (2025) is left exactly as it is.
-- ---------------------------------------------------------------------------

update games g
   set type = case
     when f.both_bracket then case
       when g.week = l.final_week     and f.both_finalists then 'playoff_championship'
       when g.week = l.final_week - 1 and f.has_finalist   then 'playoff_semifinals'
       when g.week = l.final_week - 2 and f.has_semi       then 'playoff_first_round'
       else 'playoff'
     end
     else case g.week - l.final_week
       when -2 then 'playoff_consolation_quarterfinals'
       when -1 then 'playoff_consolation_semifinals'
       when  0 then 'playoff_consolation_championship'
       else g.type
     end
   end
  from (
    select pg.id,
           exists (select 1 from _pb_role r where r.team_id = pg.team1_id)
             and exists (select 1 from _pb_role r where r.team_id = pg.team2_id) as both_bracket,
           exists (select 1 from _pb_role r where r.team_id = pg.team1_id and r.role = 'finalist')
             and exists (select 1 from _pb_role r where r.team_id = pg.team2_id and r.role = 'finalist') as both_finalists,
           exists (select 1 from _pb_role r
                    where r.team_id in (pg.team1_id, pg.team2_id) and r.role = 'finalist') as has_finalist,
           exists (select 1 from _pb_role r
                    where r.team_id in (pg.team1_id, pg.team2_id)
                      and r.role in ('finalist', 'semifinalist')) as has_semi
    from _pb_games pg
  ) f,
  _pb_last l
 where g.id = f.id
   and l.season_id = g.season_id
   and g.type = 'playoff'
   and not exists (
     select 1 from games x
      where x.season_id = g.season_id
        and x.type like 'playoff\_%'
   );

-- ---------------------------------------------------------------------------
-- 3. Bracket membership and placements.
--
-- Seeds are left as stored: nothing reads a pre-2026 seed, and the seeding the
-- league used in 2021 and 2024 cannot be recovered from the games.
-- ---------------------------------------------------------------------------

update teams t
   set made_playoffs = exists (select 1 from _pb_role r where r.team_id = t.id)
 where t.season_id in (select season_id from _pb_last)
   and t.made_playoffs is distinct from exists (select 1 from _pb_role r where r.team_id = t.id);

-- A bracket team whose finish is not a placement takes its final_rank's; a team
-- outside the bracket finishes `none`.
update teams t
   set playoff_finish = case
     when exists (select 1 from _pb_role r where r.team_id = t.id) then
       case t.final_rank
         when 1 then 'champion' when 2 then '2nd' when 3 then '3rd'
         when 4 then '4th'      when 5 then '5th' when 6 then '6th'
         else t.playoff_finish
       end
     else 'none'
   end
 where t.season_id in (select season_id from _pb_last)
   and (
     (exists (select 1 from _pb_role r where r.team_id = t.id)
       and t.playoff_finish not in ('champion', '2nd', '3rd', '4th', '5th', '6th'))
     or
     (not exists (select 1 from _pb_role r where r.team_id = t.id)
       and t.playoff_finish is distinct from 'none')
   );

-- ---------------------------------------------------------------------------
-- 4. `is_playoff` means the bracket; `is_consolation` is the rest.
--
-- Everything downstream — `v_team_standings.playoff_*_played`,
-- `v_head_to_head.playoff_*`, and `finalize_season`'s playoff W/L — reads
-- `is_playoff`, so all of it becomes bracket-only here. `is_consolation` is
-- appended, because `create or replace view` can only add columns at the end.
-- ---------------------------------------------------------------------------

create or replace view public.v_game_results with (security_invoker = true) as
 select g.id as game_id,
    g.season_id,
    g.week,
    g.type,
    g.completed_at,
    (g.type = 'regular'::text) as is_regular,
    (g.type ~~ 'playoff%'::text and g.type !~~ 'playoff_consolation%'::text) as is_playoff,
    g.team1_id as team_id,
    g.team2_id as opponent_id,
    g.team1_score as points_for,
    g.team2_score as points_against,
    case
      when g.team1_score > g.team2_score then 'W'::text
      when g.team1_score < g.team2_score then 'L'::text
      else 'T'::text
    end as result,
    (g.type ~~ 'playoff_consolation%'::text) as is_consolation
   from games g
  where g.team2_id is not null and g.team1_score is not null and g.team2_score is not null
union all
 select g.id as game_id,
    g.season_id,
    g.week,
    g.type,
    g.completed_at,
    (g.type = 'regular'::text) as is_regular,
    (g.type ~~ 'playoff%'::text and g.type !~~ 'playoff_consolation%'::text) as is_playoff,
    g.team2_id as team_id,
    g.team1_id as opponent_id,
    g.team2_score as points_for,
    g.team1_score as points_against,
    case
      when g.team2_score > g.team1_score then 'W'::text
      when g.team2_score < g.team1_score then 'L'::text
      else 'T'::text
    end as result,
    (g.type ~~ 'playoff_consolation%'::text) as is_consolation
   from games g
  where g.team2_id is not null and g.team1_score is not null and g.team2_score is not null;

comment on view public.v_game_results is
  'One row per (completed game, team). Base for every standings/career/H2H view. '
  'is_playoff is a bracket game (both teams in the six-team bracket, placement games included); '
  'is_consolation is every other postseason game.';

-- ---------------------------------------------------------------------------
-- 5. Playoff records, from bracket games only, for every completed season.
--
-- The same statement `finalize_season` runs, so a season finalized from here on
-- and a season repaired here agree by construction. 2025 comes out unchanged.
-- ---------------------------------------------------------------------------

update teams t
   set playoff_wins = p.w, playoff_losses = p.l
  from (
    select t2.id,
           count(r.game_id) filter (where t2.made_playoffs and r.is_playoff and r.result = 'W') as w,
           count(r.game_id) filter (where t2.made_playoffs and r.is_playoff and r.result = 'L') as l
    from teams t2
    join seasons s on s.id = t2.season_id
    left join v_game_results r on r.team_id = t2.id
    where s.is_completed
    group by t2.id
  ) p
 where t.id = p.id
   and (t.playoff_wins is distinct from p.w or t.playoff_losses is distinct from p.l);

-- ---------------------------------------------------------------------------
-- 6. Refuse to commit a bracket that is not a bracket.
-- ---------------------------------------------------------------------------

do $$
declare
  bad record;
begin
  for bad in
    select s.year, count(*) filter (where t.made_playoffs) as n
      from seasons s join teams t on t.season_id = s.id
     where s.is_completed
     group by s.year
    having count(*) filter (where t.made_playoffs) <> 6
  loop
    raise exception 'postseason repair: % has % bracket teams, expected 6', bad.year, bad.n;
  end loop;

  for bad in
    select s.year,
           count(*) filter (where g.type = 'playoff_championship') as c,
           count(*) filter (where g.type = 'playoff_semifinals') as sf,
           count(*) filter (where g.type = 'playoff_first_round') as fr
      from seasons s join games g on g.season_id = s.id
     where s.is_completed
     group by s.year
    having count(*) filter (where g.type = 'playoff_championship') <> 1
        or count(*) filter (where g.type = 'playoff_semifinals') <> 2
        or count(*) filter (where g.type = 'playoff_first_round') <> 2
  loop
    raise exception 'postseason repair: % has % championship / % semifinal / % first-round games',
      bad.year, bad.c, bad.sf, bad.fr;
  end loop;

  for bad in
    select s.year, g.week, g.type
      from games g
      join seasons s on s.id = g.season_id
      join teams a on a.id = g.team1_id
      join teams b on b.id = g.team2_id
     where s.is_completed
       and g.type like 'playoff%'
       and (g.type not like 'playoff\_consolation%') <> (a.made_playoffs and b.made_playoffs)
  loop
    raise exception 'postseason repair: % week % game typed % disagrees with the bracket',
      bad.year, bad.week, bad.type;
  end loop;

  for bad in
    select s.year, sum(t.playoff_wins) as w, sum(t.playoff_losses) as l
      from seasons s join teams t on t.season_id = s.id
     where s.is_completed
     group by s.year
    having sum(t.playoff_wins) <> sum(t.playoff_losses)
  loop
    raise exception 'postseason repair: % playoff wins (%) and losses (%) do not balance',
      bad.year, bad.w, bad.l;
  end loop;

  for bad in
    select s.year, t.owner, t.made_playoffs, t.playoff_finish
      from teams t join seasons s on s.id = t.season_id
     where s.is_completed
       and (
         (t.made_playoffs and t.playoff_finish not in ('champion', '2nd', '3rd', '4th', '5th', '6th'))
         or (not t.made_playoffs and t.playoff_finish is distinct from 'none')
       )
  loop
    raise exception 'postseason repair: % % (bracket=%) has finish %',
      bad.year, bad.owner, bad.made_playoffs, bad.playoff_finish;
  end loop;
end
$$;

drop table _pb_role;
drop table _pb_last;
drop table _pb_side;
drop table _pb_games;
