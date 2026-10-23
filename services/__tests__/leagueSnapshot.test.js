/**
 * The snapshot is the only thing the league chat knows, so what is pinned here
 * is that it says what the league's rows say: every game from both sides,
 * records from the games, franchises by their latest owner, trades from both
 * sides — and that a query can read it and nothing else.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { openFixtureSnapshot } from './leagueSnapshot.fixture.js';
import { runQuery, describeSchema, SNAPSHOT_TABLES, phaseOfType } from '../leagueSnapshot.js';

let snap;
beforeAll(async () => { snap = await openFixtureSnapshot(); });
const q = (sql) => {
  const r = runQuery(snap.db, sql);
  if (!r.ok) throw new Error(r.error);
  return r.rows;
};

describe('buildSnapshotTables', () => {
  it('lists every game from both sides, unplayed games with no result', () => {
    expect(q("select count(*) from games")).toEqual([[14]]);
    expect(q("select owner, opponent, points_for, points_against, result, margin from games where season = 2024 and week = 1 order by owner"))
      .toEqual([
        ['Anna Park', 'Ben Cole', 120.5, 100.25, 'W', 20.25],
        ['Ben Cole', 'Anna Park', 100.25, 120.5, 'L', -20.25]
      ]);
    expect(q("select result, points_for from games where season = 2025 and week = 3")).toEqual([[null, null], [null, null]]);
  });

  it('names a franchise by its latest owner in every season', () => {
    expect(q("select distinct owner from games where season = 2024 order by owner")).toEqual([['Anna Park'], ['Ben Cole'], ['Cara Diaz']]);
    expect(q("select owner from members order by owner")).toEqual([['Anna Park'], ['Ben Cole'], ['Cara Diaz']]);
  });

  it('types postseason games by phase and round', () => {
    expect(q("select phase, round, result from games where owner = 'Anna Park' and week = 4")).toEqual([['playoff', 'championship', 'W']]);
    expect(phaseOfType('playoff_consolation_5th')).toBe('consolation');
    expect(phaseOfType(null)).toBe('regular');
  });

  it('counts records from regular-season games and keeps placements of completed seasons only', () => {
    expect(q("select owner, wins, losses, points_for, playoff_finish from teams where season = 2024 order by owner")).toEqual([
      ['Anna Park', 1, 1, 218.6, 'champion'],
      ['Ben Cole', 1, 1, 211.36, '2nd'],
      ['Cara Diaz', 1, 1, 220.04, 'none']
    ]);
    expect(q("select champion, runner_up from seasons where season = 2024")).toEqual([['Anna Park', 'Ben Cole']]);
    expect(q("select made_playoffs, playoff_finish from teams where season = 2025 and owner = 'Anna Park'")).toEqual([[null, null]]);
  });

  it('records a trade from both sides and a waiver claim with its bid', () => {
    expect(q("select owner, action, player, other_owner from transactions where type = 'trade' order by owner")).toEqual([
      ['Anna Park', 'traded_away', 'Josh Allen', 'Ben Cole'],
      ['Ben Cole', 'traded_for', 'Josh Allen', 'Anna Park']
    ]);
    expect(q("select owner, action, player, bid from transactions where type = 'waiver'")).toEqual([['Anna Park', 'added', 'Derrick Henry', 12]]);
  });

  it('carries lineups, lineup totals, rankings, awards and the current week', () => {
    expect(q("select player, slot, started, points, nfl_team from lineups order by player")).toEqual([
      ['Derrick Henry', 'BE', 0, 18.2, 'BAL'],
      ['Josh Allen', 'QB', 1, 31.4, 'BUF']
    ]);
    expect(q("select bench_points from team_weeks")).toEqual([[9.49]]);
    expect(q("select owner, rank, power_rating from power_rankings")).toEqual([['Ben Cole', 1, 61.23]]);
    expect(q("select award, winner, category from awards")).toEqual([['Manager of the Year', 'Cara Diaz', 'voted']]);
    expect(Object.fromEntries(q("select key, value from about where key != 'built_at'"))).toEqual({ first_season: '2024', current_season: '2025', current_week: '3', last_scored_week: '2' });
  });
});

describe('runQuery', () => {
  it('reads, and refuses anything else', () => {
    expect(runQuery(snap.db, 'select 1;')).toMatchObject({ ok: true, rows: [[1]] });
    expect(runQuery(snap.db, 'with x as (select 2 as n) select n from x')).toMatchObject({ ok: true, rows: [[2]] });
    expect(runQuery(snap.db, 'delete from games')).toMatchObject({ ok: false });
    expect(runQuery(snap.db, 'select 1; drop table games')).toMatchObject({ ok: false });
    expect(runQuery(snap.db, "select * from games where owner = 'x' union select 1 from pragma_table_info('games')").ok).toBe(false);
    expect(q('select count(*) from games')).toEqual([[14]]);
  });

  it('reports a bad query as an error the model can fix', () => {
    expect(runQuery(snap.db, 'select nope from games')).toMatchObject({ ok: false, error: expect.stringMatching(/no such column/) });
  });

  it('caps the rows it returns but counts them all', () => {
    const r = runQuery(snap.db, 'select * from games', { maxRows: 5 });
    expect(r).toMatchObject({ ok: true, rowCount: 14, truncated: true });
    expect(r.rows).toHaveLength(5);
  });
});

describe('describeSchema', () => {
  it('describes every table and column the snapshot has', () => {
    const schema = describeSchema();
    for (const t of SNAPSHOT_TABLES) {
      expect(schema).toContain(`TABLE ${t.name}`);
      const [{ values }] = snap.db.exec(`select name from pragma_table_info('${t.name}')`);
      expect(values.map(([c]) => c)).toEqual(t.columns.map(([c]) => c));
    }
  });
});
