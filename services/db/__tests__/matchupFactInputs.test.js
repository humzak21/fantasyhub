/**
 * Which team a member owns, for the daily matchup facts.
 *
 * `teams.user_id` is stamped by the `set_user_id` trigger with whoever
 * inserted the row, so in production it is the admin on every team. Trusting
 * it first sent the admin a fact about an arbitrary team's opponent on
 * 2026-10-09. The display name against `teams.owner` is the owner.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { getMatchupFactInputs } from '../notifications.js';

const SEASON = { id: 'season-26', year: 2026 };
const ADMIN = 'user-admin';
const MEMBER = 'user-member';
const STRANGER = 'user-stranger';

function team(id, owner, userId = ADMIN) {
  return { id, season_id: SEASON.id, franchise_id: id, owner, user_id: userId, made_playoffs: null, playoff_finish: null, final_rank: null };
}

function ctxWith(teams, displayNames) {
  return makeCtx({
    'seasons.select': () => [{ id: SEASON.id, year: SEASON.year, is_completed: false }],
    'teams.select': () => teams,
    'v_game_results.select': () => [],
    'games.select': () => [],
    'member_approvals.select': () => [],
    'team_week_lineups.select': () => [],
    'player_week_stats.select': () => [],
    'transaction_events.select': () => [],
    'rpc.get_user_display_names': ({ user_ids }) =>
      user_ids.filter((id) => displayNames[id]).map((id) => ({ id, display_name: displayNames[id] }))
  });
}

describe('getMatchupFactInputs member teams', () => {
  it('matches the display name to the owner, not the row creator', async () => {
    const teams = [team('t-aaron', 'Aaron Wadhwa'), team('t-humza', 'Humza Khalil'), team('t-harshil', 'Harshil Pareek')];
    const ctx = ctxWith(teams, { [ADMIN]: 'Humza Khalil', [MEMBER]: 'harshil pareek ' });

    const { memberTeams } = await getMatchupFactInputs(ctx, { season: SEASON, week: 5, userIds: [ADMIN, MEMBER] });

    expect(memberTeams.get(ADMIN)).toBe('t-humza');
    expect(memberTeams.get(MEMBER)).toBe('t-harshil');
  });

  it('falls back to user_id only when it names exactly one team', async () => {
    const teams = [team('t-one', 'Someone Else', STRANGER), team('t-two', 'Another Owner'), team('t-three', 'Third Owner')];
    const ctx = ctxWith(teams, { [STRANGER]: 'Nickname', [ADMIN]: 'Not An Owner' });

    const { memberTeams } = await getMatchupFactInputs(ctx, { season: SEASON, week: 5, userIds: [STRANGER, ADMIN] });

    expect(memberTeams.get(STRANGER)).toBe('t-one');
    expect(memberTeams.has(ADMIN)).toBe(false);
  });
});
