-- Apply the new machinery to the two seasons that need it.
--
-- 2025 is over — every game complete, the playoff rounds hand-typed — but
-- nothing ever said so, so it was `status = 'upcoming'` and absent from League
-- History. 2026 was created by `carryTeamsForward`, which copies team identity
-- and nothing else: it has fourteen teams and no start date, no ESPN league and
-- no ESPN season year, which is enough to make the weekly sync fail and
-- `season_current_week()` report week 17 in August.

-- 2025: derive the placements, then the awards that depend on them.
select public.finalize_season(id) from public.seasons where year = 2025;
select public.compute_season_awards(id) from public.seasons where year = 2025;

-- 2026: the configuration the copy left behind.
--
-- `awards_release_at` stays NULL deliberately — releasing the awards is an
-- admin act at the end of the season, not something a season inherits.
update public.seasons s
   set start_date              = date '2026-09-08',
       espn_league_id          = '67674700',
       espn_season_year        = 2026,
       timezone                = prev.timezone,
       pickem_open_offset_days = prev.pickem_open_offset_days,
       pickem_open_time        = prev.pickem_open_time,
       pickem_close_offset_days = prev.pickem_close_offset_days,
       pickem_close_time       = prev.pickem_close_time,
       pickem_reveal_offset_days = prev.pickem_reveal_offset_days,
       pickem_reveal_time      = prev.pickem_reveal_time
  from public.seasons prev
 where s.year = 2026 and prev.year = 2025;
