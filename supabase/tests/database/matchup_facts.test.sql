-- Matchup facts: what `20261009120000_matchup_facts.sql` makes true.
--
--   * the matchup_facts topic is accepted alone, and is in the default;
--   * a member reads their own matchup_fact_log rows and cannot write any;
--   * the clock dispatches notify-matchups.yml at 16:00 and 17:00 UTC daily,
--     one of which is noon Eastern whatever the season.
--
-- Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'rival@example.com'),
       ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'other@example.com');

insert into public.seasons (id, year, start_date, timezone)
values ('11111111-1111-4111-8111-111111111111', 1906, date '2026-09-08', 'America/New_York');

insert into public.matchup_fact_log (user_id, season_id, week, day, subject, family, fact)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 5, 'tue', 'self', 'self:luck', 'mine'),
       ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 5, 'tue', 'opponent', 'opponent:titles', 'theirs');

insert into public.member_approvals (user_id, status)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'approved')
on conflict (user_id) do update set status = excluded.status;

set local request.jwt.claims to
  '{"role":"authenticated","sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","email":"rival@example.com"}';
set local role authenticated;

select is(
  public.save_push_subscription('https://web.push.apple.com/rival', 'key', 'secret', array['matchup_facts']),
  array['matchup_facts']::text[],
  'a member can ask for matchup facts alone'
);

select ok(
  'matchup_facts' = any (public.save_push_subscription('https://web.push.apple.com/rival-2', 'key', 'secret')),
  'a device saved with the default topics gets matchup facts'
);

select is(
  (select array_agg(fact) from public.matchup_fact_log),
  array['mine']::text[],
  'a member reads only their own matchup facts'
);

select throws_ok(
  $$ insert into public.matchup_fact_log (user_id, season_id, week, day, subject, family, fact)
     values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 5, 'wed', 'self', 'self:luck', 'forged') $$,
  '42501',
  null,
  'and cannot write one'
);

reset role;

select throws_ok(
  $$ insert into public.matchup_fact_log (user_id, season_id, week, day, subject, family, fact)
     values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 5, 'tue', 'self', 'self:luck', 'again') $$,
  '23505',
  null,
  'a member is told one fact per day'
);

select is(
  (select schedule from cron.job where jobname = 'notify-matchup-facts'),
  '0 16,17 * * *',
  'the matchup-fact slots are 16:00 and 17:00 UTC every day'
);

select ok(
  (select command from cron.job where jobname = 'notify-matchup-facts') like '%notify-matchups.yml%',
  'and they dispatch notify-matchups.yml'
);

select * from finish();

rollback;
