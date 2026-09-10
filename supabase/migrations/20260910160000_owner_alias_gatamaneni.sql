-- transactions.owner_name carried ESPN's misspelling of one owner for every
-- season since 2020: "Aashish Gatmaneni" against teams.owner's correct
-- "Aashish Gatamaneni". The ESPN reader now canonicalises through
-- utils/ownerAliases.js, so the daily refresh would rewrite the active
-- season's row on its next run; the six archived seasons are never re-synced,
-- so they are corrected here. Idempotent.
update public.transactions
   set owner_name = 'Aashish Gatamaneni'
 where owner_name = 'Aashish Gatmaneni';
