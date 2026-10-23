/**
 * A three-franchise league, 2024 (complete) and 2025 (in progress), in the
 * shape `getLeagueSnapshotSources` returns. Ben Cole's franchise was "Benjamin
 * Cole" in 2024, so the snapshot has to name it by its latest owner.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import initSqlJs from 'sql.js';

import { buildSnapshotTables, writeSnapshot } from '../leagueSnapshot.js';

const require = createRequire(import.meta.url);

const S24 = 's24';
const S25 = 's25';
const team = (id, seasonId, franchiseId, owner, name, extra = {}) => ({ id, seasonId, franchiseId, owner, name, divisionId: 1, ...extra });
const game = (seasonId, week, team1Id, team2Id, team1Score, team2Score, type = 'regular', isCompleted = team1Score != null) =>
  ({ seasonId, week, type, team1Id, team2Id, team1Score, team2Score, isCompleted });

export function fixtureSources() {
  return {
    currentSeasonId: S25,
    currentWeek: 3,
    seasons: [
      { id: S24, year: 2024, isCompleted: true, regularSeasonWeeks: 3, playoffWeeks: 1 },
      { id: S25, year: 2025, isCompleted: false, regularSeasonWeeks: 3, playoffWeeks: 1 }
    ],
    divisions: [{ id: 1, name: 'East' }],
    teams: [
      team('a24', S24, 'fa', 'Anna Park', 'Park Rangers', { madePlayoffs: true, playoffSeed: 1, playoffFinish: 'champion', finalRank: 1 }),
      team('b24', S24, 'fb', 'Benjamin Cole', 'Cole Train', { madePlayoffs: true, playoffSeed: 2, playoffFinish: '2nd', finalRank: 2 }),
      team('c24', S24, 'fc', 'Cara Diaz', 'Diaz Days', { madePlayoffs: false, playoffFinish: 'none', finalRank: 3 }),
      team('a25', S25, 'fa', 'Anna Park', 'Park Life'),
      team('b25', S25, 'fb', 'Ben Cole', 'Cole Mine'),
      team('c25', S25, 'fc', 'Cara Diaz', 'Diaz Days')
    ],
    games: [
      game(S24, 1, 'a24', 'b24', 120.5, 100.25),
      game(S24, 2, 'a24', 'c24', 98.1, 130.04),
      game(S24, 3, 'b24', 'c24', 111.11, 90),
      game(S24, 4, 'a24', 'b24', 150.66, 120.06, 'playoff_championship'),
      game(S25, 1, 'a25', 'b25', 101.01, 133.3),
      game(S25, 2, 'a25', 'c25', 92.2, 88.8),
      game(S25, 3, 'a25', 'b25', null, null)
    ],
    players: [
      { id: 'p1', name: 'Josh Allen', position: 'QB', espnPlayerId: 3918298 },
      { id: 'p2', name: 'Derrick Henry', position: 'RB', espnPlayerId: 3043078 }
    ],
    playerWeeks: [
      { seasonId: S25, week: 1, teamId: 'a25', playerId: 'p1', espnPlayerId: 3918298, position: 'QB', rosterSlot: 'QB', started: true, actualPoints: 31.4, projectedPoints: 22, proTeamId: 2 },
      { seasonId: S25, week: 1, teamId: 'b25', playerId: 'p2', espnPlayerId: 3043078, position: 'RB', rosterSlot: 'BE', started: false, actualPoints: 18.2, projectedPoints: 15, proTeamId: 33 }
    ],
    teamWeeks: [
      { seasonId: S25, week: 1, teamId: 'a25', starterPoints: 101.01, optimalPoints: 110.5, startersScoring: 9 }
    ],
    transactionEvents: [
      { id: 't1', seasonId: S25, type: 'WAIVER', franchiseId: 'fa', scoringPeriod: 2, processedAt: '2025-09-17T09:00:00Z', bidAmount: 12, espnPlayerIds: [3043078], playerFromFranchiseIds: [null], playerToFranchiseIds: ['fa'] },
      { id: 't2', seasonId: S25, type: 'TRADE_ACCEPT', franchiseId: 'fb', scoringPeriod: 2, processedAt: '2025-09-18T09:00:00Z', bidAmount: null, espnPlayerIds: [3918298], playerFromFranchiseIds: ['fa'], playerToFranchiseIds: ['fb'] }
    ],
    transactionTotals: [
      { seasonId: S25, franchiseId: 'fa', ownerName: 'Anna Park', waiverClaims: 1, freeAgentAdds: 0, drops: 1, trades: 1, faabSpent: 12 }
    ],
    rankings: [
      { seasonId: S25, weekNumber: 2, teamId: 'b25', rank: 1, powerRating: 61.234 }
    ],
    awards: [
      { seasonId: S24, title: 'Manager of the Year', category: 'voted', winnerFranchiseId: 'fc', winnerTeamId: null }
    ]
  };
}

let sqlModule;
export async function loadSql() {
  sqlModule ??= await initSqlJs({ wasmBinary: readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')) });
  return sqlModule;
}

/** The fixture as an open snapshot database, plus what it was built from. */
export async function openFixtureSnapshot() {
  const SQL = await loadSql();
  const built = buildSnapshotTables(fixtureSources(), { now: new Date('2025-09-20T12:00:00Z') });
  const db = new SQL.Database(writeSnapshot(SQL, built.tables));
  return { db, ...built };
}
