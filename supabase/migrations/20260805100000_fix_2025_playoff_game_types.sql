-- Fix the mistyped 2025 postseason games, and the function that made the
-- mistyping invisible.
--
-- The 2025 season is 14 regular-season weeks + 3 playoff weeks (15-17). Week 15
-- was typed correctly, but every game in weeks 16 and 17 was left as
-- type = 'regular'. Two separate defects fell out of that:
--
--   1. Postseason games counted toward regular-season records, so 2025 used a
--      different definition of "record" than 2020-2024 (which store
--      regular-season splits). Stored 2025 records covered 16 games.
--   2. refresh_team_stats() has no `type` filter at all, so it would have
--      re-introduced the same corruption on the next score edit even after the
--      types were corrected.
--
-- All three parts below are needed for the fix to hold.
--
-- The bracket is not guessed: it is derived from week 15, whose types are
-- correct, and cross-checked against the matchup_id vocabulary already in
-- playoff_picks (div1_r1/div2_r1, div1_semi/div2_semi, championship,
-- third_place, fifth_place_wk16/wk17, con_r1_*/con_r2_*/con_r3_*).
--
-- Note the consolation bracket is a full 8-team placement ladder -- four games
-- in every round, all eight teams playing every week -- not a knockout, which
-- is why round 2 pairs some week-15 winners against week-15 losers.

-- ---------------------------------------------------------------------------
-- 0. Repoint a trigger left pointing at a deprecated compat view
-- ---------------------------------------------------------------------------
-- Renaming playoffs_2025 -> playoff_picks left this function writing through
-- the shim. It still worked (the view is auto-updatable) but it should target
-- the table directly.

create or replace function public.update_playoff_pick_results()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- When a game is completed, update any playoff picks that reference it
  if new.winner_team_id is not null
     and (old.winner_team_id is null or old.winner_team_id != new.winner_team_id) then
    update public.playoff_picks
    set
      actual_winner_team_id = new.winner_team_id,
      is_correct = (predicted_winner_team_id = new.winner_team_id),
      points_earned = case when predicted_winner_team_id = new.winner_team_id then 1 else 0 end,
      updated_at = now()
    where game_id = new.id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Retype weeks 16 and 17
-- ---------------------------------------------------------------------------

do $$
declare
  v_season_id uuid;
begin
  select id into v_season_id from public.seasons where year = 2025;
  if v_season_id is null then
    raise exception '2025 season not found';
  end if;

  -- Bracket membership, read off the correctly-typed week 15.
  create temp table _consolation_teams on commit drop as
    select team1_id as team_id from public.games
      where season_id = v_season_id and week = 15
        and type = 'playoff_consolation_quarterfinals'
    union
    select team2_id from public.games
      where season_id = v_season_id and week = 15
        and type = 'playoff_consolation_quarterfinals';

  create temp table _bye_teams on commit drop as
    select team1_id as team_id from public.games
      where season_id = v_season_id and week = 15 and type = 'bye';

  -- Week 16 --------------------------------------------------------------
  -- Consolation round 2 (con_r2_*): all eight consolation teams.
  update public.games g
  set type = 'playoff_consolation_semifinals'
  where g.season_id = v_season_id and g.week = 16
    and g.team1_id in (select team_id from _consolation_teams);

  -- Semifinals (div1_semi / div2_semi): a bye team meets a first-round winner.
  update public.games g
  set type = 'playoff_semifinals'
  where g.season_id = v_season_id and g.week = 16
    and g.type = 'regular'
    and (g.team1_id in (select team_id from _bye_teams)
      or g.team2_id in (select team_id from _bye_teams));

  -- Fifth-place game (fifth_place_wk16): the two first-round losers. There is
  -- no dedicated placement type in games_type_check, so it stays generic.
  update public.games g
  set type = 'playoff'
  where g.season_id = v_season_id and g.week = 16 and g.type = 'regular';

  -- Week 17 --------------------------------------------------------------
  -- Consolation round 3 (con_r3_*).
  update public.games g
  set type = 'playoff_consolation_championship'
  where g.season_id = v_season_id and g.week = 17
    and g.team1_id in (select team_id from _consolation_teams);

  -- Championship: the two semifinal winners.
  update public.games g
  set type = 'playoff_championship'
  where g.season_id = v_season_id and g.week = 17
    and g.type = 'regular'
    and g.team1_id in (select winner_team_id from public.games
                        where season_id = v_season_id and week = 16
                          and type = 'playoff_semifinals')
    and g.team2_id in (select winner_team_id from public.games
                        where season_id = v_season_id and week = 16
                          and type = 'playoff_semifinals');

  -- Third place (semifinal losers) and fifth place. Both generic, as above.
  update public.games g
  set type = 'playoff'
  where g.season_id = v_season_id and g.week = 17 and g.type = 'regular';

  -- Nothing in the postseason may still be typed 'regular'.
  if exists (
    select 1 from public.games
    where season_id = v_season_id and week > 14 and type = 'regular'
  ) then
    raise exception 'Postseason games remain typed regular after retyping';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Stop refresh_team_stats folding the postseason into the regular season
-- ---------------------------------------------------------------------------
-- Only the two `type = 'regular'` predicates and the pinned search_path are
-- new; the rest is the existing body.

create or replace function public.refresh_team_stats(team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    team_record teams%ROWTYPE;
    total_games INTEGER := 0;
    total_wins INTEGER := 0;
    total_losses INTEGER := 0;
    total_ties INTEGER := 0;
    total_points_for DECIMAL(10,2) := 0;
    total_points_against DECIMAL(10,2) := 0;
    win_pct DECIMAL(5,4) := 0;
    avg_pf DECIMAL(10,2) := 0;
    avg_pa DECIMAL(10,2) := 0;
    point_diff DECIMAL(10,2) := 0;
    blowout_win_count INTEGER := 0;
    close_win_count INTEGER := 0;
    close_loss_count INTEGER := 0;
BEGIN
    SELECT * INTO team_record FROM teams WHERE id = team_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Team not found: %', team_id;
    END IF;

    SELECT
        COALESCE(COUNT(*), 0),
        COALESCE(SUM(CASE
            WHEN (team1_id = team_id AND team1_score > team2_score) OR
                 (team2_id = team_id AND team2_score > team1_score) THEN 1
            ELSE 0
        END), 0),
        COALESCE(SUM(CASE
            WHEN (team1_id = team_id AND team1_score < team2_score) OR
                 (team2_id = team_id AND team2_score < team1_score) THEN 1
            ELSE 0
        END), 0),
        COALESCE(SUM(CASE WHEN team1_score = team2_score THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN team1_id = team_id THEN team1_score ELSE team2_score END), 0),
        COALESCE(SUM(CASE WHEN team1_id = team_id THEN team2_score ELSE team1_score END), 0)
    INTO total_games, total_wins, total_losses, total_ties, total_points_for, total_points_against
    FROM games
    WHERE (team1_id = team_id OR team2_id = team_id)
      AND is_completed = true
      AND type = 'regular'          -- regular season only; playoffs are not a record
      AND season_id = team_record.season_id;

    win_pct := CASE WHEN total_games > 0 THEN total_wins::DECIMAL / total_games ELSE 0 END;
    avg_pf := CASE WHEN total_games > 0 THEN total_points_for / total_games ELSE 0 END;
    avg_pa := CASE WHEN total_games > 0 THEN total_points_against / total_games ELSE 0 END;
    point_diff := total_points_for - total_points_against;

    SELECT
        COALESCE(SUM(CASE WHEN winner_team_id = team_id AND is_blowout THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN winner_team_id = team_id AND is_close THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN loser_team_id = team_id AND is_close THEN 1 ELSE 0 END), 0)
    INTO blowout_win_count, close_win_count, close_loss_count
    FROM games
    WHERE (team1_id = team_id OR team2_id = team_id)
      AND is_completed = true
      AND type = 'regular'
      AND season_id = team_record.season_id;

    UPDATE teams
    SET
        wins = total_wins,
        losses = total_losses,
        ties = total_ties,
        points_for = total_points_for,
        points_against = total_points_against,
        win_percentage = win_pct,
        point_differential = point_diff,
        average_points_for = avg_pf,
        average_points_against = avg_pa,
        blowout_wins = blowout_win_count,
        close_wins = close_win_count,
        close_losses = close_loss_count,
        quality_wins = COALESCE(quality_wins, 0),
        bad_losses = COALESCE(bad_losses, 0)
    WHERE id = team_id;
END;
$$;

comment on function public.refresh_team_stats(uuid) is
  'Recompute a team''s stored regular-season stats from games. Postseason games are excluded -- see public.v_team_standings for the same numbers as a view.';

-- ---------------------------------------------------------------------------
-- 3. Resync the 2025 stored stats
-- ---------------------------------------------------------------------------
-- 2020-2024 are untouched: their stored values already carry regular-season
-- splits (verified equal to v_team_standings) and re-running would be a no-op.

do $$
declare
  r record;
begin
  for r in
    select t.id from public.teams t
    join public.seasons s on s.id = t.season_id
    where s.year = 2025
  loop
    perform public.refresh_team_stats(r.id);
  end loop;
end $$;
