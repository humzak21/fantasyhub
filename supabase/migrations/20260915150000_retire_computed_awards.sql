-- Retire the computed awards, and the record view nothing reads any more.
--
-- APPLY WITH THE DEPLOY, NOT BEFORE: the previous client reads v_record_book
-- on the Records tab, and dropping it under that client breaks the page.
--
-- `compute_season_awards` wrote eleven stat awards per season — best record,
-- highest points, highest weekly score, most blowouts, worst record, lowest
-- points, lowest weekly score, biggest blowout loss, most points against,
-- most consistent, and the champion. Every one of them is now a record in the
-- History tab's record book, ranked rather than naming one winner, computed
-- from the games on read (utils/recordBook). Keeping the award copies would be
-- a second, frozen answer to the same questions — and the "most blowouts"
-- award used a 25-point line while `games.is_blowout` uses 30, so the two
-- already disagreed.
--
-- The History → Awards gallery shows league-voted awards only (source =
-- 'ballot', category = 'voted'). The admin's hand-entered stat awards
-- (category = 'non-voted') stay in the table for the Awards tab; the gallery
-- no longer shows them, and their records are in the record book.
--
-- `finalize_season` does not call the function, and the client stopped calling
-- it in the same change (services/db/seasons.js::finalizeSeason). A champion
-- was never read from an award: `teams.playoff_finish` is the fact.
--
-- `v_record_book` answered five "who is first" questions; the record book
-- answers them as leaderboards, from the tables, and nothing reads the view.

delete from public.awards where source = 'computed';

drop index if exists public.awards_computed_season_type_idx;

drop function if exists public.compute_season_awards(uuid);

drop view if exists public.v_record_book;
