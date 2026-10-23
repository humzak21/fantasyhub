-- League chat: what `20261023120000_league_chat.sql` makes true.
--
--   * the fact cards, their meta row and the question log are the service
--     role's alone: a member or a visitor reads none of them through PostgREST;
--   * there is one meta row, ever;
--   * a log row says what kind of reply went back, from a fixed list.
--
-- Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'asker@example.com');

insert into public.league_facts (generation, topic, owners, seasons, text)
values (1, 'h2h', array['anna','ben'], array[2024], 'Anna leads Ben 3-1 over 4 games.');

insert into public.league_facts_meta (id, generation) values (true, 1);

insert into public.chat_log (user_id, question, kind, answer)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Anna vs Ben?', 'answer', 'Anna leads 3-1.');

set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';
set local role authenticated;

select throws_ok(
  $$ select count(*) from public.league_facts $$,
  '42501', null,
  'a member cannot read the fact cards directly'
);

select throws_ok(
  $$ select count(*) from public.chat_log $$,
  '42501', null,
  'nor the question log, not even their own questions'
);

reset role;
set local role anon;

select throws_ok(
  $$ select count(*) from public.league_facts_meta $$,
  '42501', null,
  'and a visitor cannot read the meta row'
);

reset role;

select throws_ok(
  $$ insert into public.league_facts_meta (id, generation) values (false, 2) $$,
  '23514', null,
  'there is only ever one meta row'
);

select throws_ok(
  $$ insert into public.chat_log (user_id, question, kind) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'q', 'guess') $$,
  '23514', null,
  'a log row''s kind is one of answer, facts, none, error'
);

select is(
  (select count(*)::int from public.league_facts where 'anna' = any (owners) and 2024 = any (seasons)),
  1,
  'cards are found by who and when they are about'
);

select * from finish();

rollback;
