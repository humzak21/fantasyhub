#!/usr/bin/env node
/**
 * Rebuild the league chat's snapshot: the league's history as one SQLite file
 * the chat's model queries (see services/leagueSnapshot.js).
 *
 *   node scripts/build-league-chat-db.js              build and upload
 *   node scripts/build-league-chat-db.js --dry-run    build, print row counts
 *   node scripts/build-league-chat-db.js --out=FILE   also write the file locally
 *
 * Idempotent: each run replaces the file in the private `league-chat` bucket,
 * so a failed run is fixed by running it again. The daily refresh and the
 * weekly sync run it after they have written the day's data.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import '../services/db/client.server.js';

import initSqlJs from 'sql.js';

import { getDb, getContext } from '../services/db/index.js';
import { buildSnapshotTables, writeSnapshot } from '../services/leagueSnapshot.js';

const require = createRequire(import.meta.url);

export async function buildLeagueChatSnapshot({ db = getDb(getContext()), dryRun = false, out = null, now = new Date() } = {}) {
  const sources = await db.leagueChat.getLeagueSnapshotSources({ now });
  const { tables, meta } = buildSnapshotTables(sources, { now });

  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const wasm = readFileSync(wasmPath);
  const SQL = await initSqlJs({ wasmBinary: wasm });
  const snapshot = writeSnapshot(SQL, tables);
  if (out) writeFileSync(out, snapshot);

  const rows = Object.fromEntries(Object.entries(tables).map(([name, list]) => [name, list.length]));
  const summary = { bytes: snapshot.byteLength, rows, currentYear: meta.currentYear, currentWeek: meta.currentWeek, lastScoredWeek: meta.lastScoredWeek };
  if (dryRun) return { dryRun: true, ...summary };

  await db.leagueChat.saveLeagueSnapshot({ snapshot, wasm });
  return { uploaded: true, ...summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? null;
  buildLeagueChatSnapshot({ dryRun: process.argv.includes('--dry-run'), out })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    });
}
