#!/usr/bin/env node
/**
 * Rebuild the league chat's fact cards (`league_facts`) from the league's own
 * rows, through the same code the History tab uses.
 *
 *   node scripts/build-league-facts.js            build and store
 *   node scripts/build-league-facts.js --dry-run  build and print a sample
 *
 * Idempotent: each run writes a new generation and removes the old one, so a
 * failed or repeated run is fixed by running it again. The daily refresh and
 * the weekly sync run it after they have written the day's data.
 */

import '../services/db/client.server.js';

import { getDb, getContext } from '../services/db/index.js';
import { buildLeagueFacts } from '../services/leagueFacts.js';

export async function buildAndStoreLeagueFacts({ db = getDb(getContext()), dryRun = false, now = new Date() } = {}) {
  const sources = await db.leagueFacts.getLeagueFactSources({ now });
  if (!sources.currentSeasonId) return { reason: 'no active season' };

  const built = buildLeagueFacts(sources);
  const counts = {};
  for (const card of built.cards) counts[card.topic] = (counts[card.topic] ?? 0) + 1;

  if (dryRun) {
    return {
      dryRun: true,
      cards: built.cards.length,
      byTopic: counts,
      people: built.lexicon.length,
      sample: built.cards.filter((_, i) => i % Math.max(1, Math.floor(built.cards.length / 12)) === 0).map((c) => c.text)
    };
  }

  const saved = await db.leagueFacts.saveLeagueFacts({
    ...built,
    currentWeek: sources.currentWeek
  }, { now });
  return { ...saved, byTopic: counts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildAndStoreLeagueFacts({ dryRun: process.argv.includes('--dry-run') })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    });
}
