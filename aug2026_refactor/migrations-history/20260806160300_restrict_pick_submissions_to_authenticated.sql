-- Pick submission is for logged-in users; anon had EXECUTE on both (§2.2).
--
-- Identity itself was already correct — both functions write `auth.uid()`
-- rather than a caller-supplied user id, which is exactly what §2.2 asks for.
-- The gap was the grant: for an anonymous caller auth.uid() is NULL, so the
-- only possible outcomes were junk rows or a constraint error.
revoke execute on function public.submit_pick_em_picks(uuid, jsonb) from public, anon;
grant  execute on function public.submit_pick_em_picks(uuid, jsonb) to authenticated, service_role;

-- submit_playoff_picks also fell back to a hardcoded
-- '2025-12-12 20:15:00-05' when a season had no configured deadline — a §4
-- hardcoded-year survivor living in SQL, and one that fails *closed*: for any
-- 2026 season without a playoff_config row, `now() > deadline` is already true
-- and every submission would be rejected with "Submission deadline has passed".
--
-- 'infinity' is the neutral fallback and matches what the playoff_picks RLS
-- policy already does — COALESCE((select submission_deadline ...), 'infinity').
-- No configured deadline now means no deadline, consistently in both places.
--
-- The body still reads playoffs_2025_config and writes playoffs_2025, which are
-- the backward-compatible views over playoff_config / playoff_picks. Repointing
-- those onto the generic tables is open items §3's job, deliberately not done
-- inside a security pass.
create or replace function public.submit_playoff_picks(
  p_season_id uuid, p_picks jsonb, p_championship_point_total double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pick_record jsonb;
  deadline timestamptz;
  result_count int := 0;
begin
  select submission_deadline into deadline
  from playoffs_2025_config
  where season_id = p_season_id;

  deadline := coalesce(deadline, 'infinity'::timestamptz);

  if now() > deadline then
    raise exception 'Submission deadline has passed';
  end if;

  for pick_record in select * from jsonb_array_elements(p_picks)
  loop
    insert into playoffs_2025 (
      user_id, season_id, matchup_id, game_id,
      predicted_winner_team_id, championship_point_total
    )
    values (
      auth.uid(),
      p_season_id,
      pick_record->>'matchup_id',
      (pick_record->>'game_id')::uuid,
      (pick_record->>'predicted_winner_team_id')::uuid,
      case
        when pick_record->>'matchup_id' = 'championship'
        then coalesce((pick_record->>'championship_point_total')::float8, p_championship_point_total)
        else null
      end
    )
    on conflict (user_id, matchup_id)
    do update set
      predicted_winner_team_id = excluded.predicted_winner_team_id,
      game_id = excluded.game_id,
      championship_point_total = excluded.championship_point_total,
      updated_at = now();

    result_count := result_count + 1;
  end loop;

  return jsonb_build_object('success', true, 'picks_submitted', result_count);
end;
$function$;

revoke execute on function public.submit_playoff_picks(uuid, jsonb, double precision) from public, anon;
grant  execute on function public.submit_playoff_picks(uuid, jsonb, double precision) to authenticated, service_role;
