-- Matchup facts: what `20261008120000_matchup_facts.sql` makes true.
--
--   * the matchup_facts topic is accepted alone, and is in the default;
--   * the clock dispatches notify-matchups.yml at 16:00 and 17:00 UTC daily,
--     one of which is noon Eastern whatever the season.
--
-- Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'rival@example.com');

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

reset role;

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
