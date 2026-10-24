-- League chat: what `20261024120000_league_chat.sql` makes true.
--
--   * the question log is the service role's alone: neither a member nor a
--     visitor reads it through PostgREST, not even their own questions;
--   * a log row says what kind of reply went back, from a fixed list;
--   * deleting an account deletes its questions.
--
-- Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'asker@example.com');

insert into public.chat_log (user_id, question, kind, answer, queries)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Anna vs Ben?', 'answer', 'Anna leads 3-1.',
        '[{"sql": "select 1", "rowCount": 1}]');

set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';
set local role authenticated;

select throws_ok(
  $$ select count(*) from public.chat_log $$,
  '42501', null,
  'a member cannot read the question log, not even their own questions'
);

reset role;
set local role anon;

select throws_ok(
  $$ select count(*) from public.chat_log $$,
  '42501', null,
  'nor can a visitor'
);

reset role;

select throws_ok(
  $$ insert into public.chat_log (user_id, question, kind) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'q', 'guess') $$,
  '23514', null,
  'a log row''s kind is one of answer, data, none, off, error'
);

delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select is(
  (select count(*)::int from public.chat_log),
  0,
  'deleting an account deletes its questions'
);

select * from finish();

rollback;
