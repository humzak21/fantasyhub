/**
 * Where a player's headshot and an NFL team's logo come from (JITS-47).
 *
 * Both are ESPN's CDN, hotlinked through its resize endpoint (`combiner`): a
 * full headshot is ~250 KB at 350 px, the resized one ~10 KB, and one size
 * per kind keeps every surface on the same cached URL. Hotlinked rather than
 * mirrored into `public/`: headshots cover every player ever rostered here and
 * change as ESPN updates them, and the logos are trademarks this repository
 * has no reason to carry. A failed load is not an error anywhere — the
 * components fall back to initials or nothing (`ui/player-avatar.jsx`).
 *
 * Pure, so the rules are tested without a browser.
 */

import { getNFLTeamAbbreviation } from '../services/db/espnMapping.js';

const CDN = 'https://a.espncdn.com';

/** Pixels requested: twice the largest size drawn, for 2x screens. */
export const HEADSHOT_PX = 96;
export const LOGO_PX = 64;

/** The 32 teams, in the league's spelling (`NFL_PRO_TEAM_ABBREVIATIONS`). */
const TEAMS = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
  'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'
]);

/** Older and other-view spellings, as `utils/nflTeamColors.js` reads them. */
const ALIASES = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR' };

/** ESPN's logo files are lowercase, and Washington's is `wsh`. */
const LOGO_SLUG = { WAS: 'wsh' };

/** The league's spelling of a team, or null for none or one it does not know. */
export function canonicalTeam(abbreviation) {
  if (!abbreviation) return null;
  const key = String(abbreviation).trim().toUpperCase();
  const team = ALIASES[key] ?? key;
  return TEAMS.has(team) ? team : null;
}

/**
 * A row's NFL team. The row's own `proTeamId` wins: on a week's lineup it is
 * the team the player was on *that* week, where `players.team_abbreviation`
 * is wherever he is now.
 */
export function teamOf({ proTeamId, teamAbbreviation, proTeam } = {}) {
  return canonicalTeam(getNFLTeamAbbreviation(proTeamId)) ?? canonicalTeam(teamAbbreviation ?? proTeam);
}

const resized = (path, width, height) =>
  `${CDN}/combiner/i?img=${path}&w=${width}&h=${height}&scale=crop`;

/** A team's logo, or null when the team is unknown. */
export function teamLogoUrl(abbreviation) {
  const team = canonicalTeam(abbreviation);
  if (!team) return null;
  const slug = LOGO_SLUG[team] ?? team.toLowerCase();
  return resized(`/i/teamlogos/nfl/500/${slug}.png`, LOGO_PX, LOGO_PX);
}

/**
 * A defence has no face. ESPN gives every D/ST a negative id (-16000 minus the
 * team), so the id alone is enough even without a position.
 */
export function isTeamDefense({ position, espnPlayerId } = {}) {
  const pos = String(position ?? '').toUpperCase();
  return pos === 'D/ST' || pos === 'DST' || pos === 'DEF' || Number(espnPlayerId) < 0;
}

/**
 * A defence's team from its ESPN id alone: -16000 minus the team's proTeamId
 * (Raiders D/ST is -16013, LV). For rows that carry the id and not the team,
 * such as a week's moves.
 */
export function defenseTeam(espnPlayerId) {
  const id = Number(espnPlayerId);
  if (!Number.isInteger(id) || id >= 0) return null;
  return canonicalTeam(getNFLTeamAbbreviation(-id - 16000));
}

/** A player's headshot, square-cropped, or null with no usable ESPN id. */
export function headshotUrl(espnPlayerId) {
  const id = Number(espnPlayerId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return resized(`/i/headshots/nfl/players/full/${id}.png`, HEADSHOT_PX, HEADSHOT_PX);
}

/** Up to two initials, for the neutral avatar a missing headshot falls back to. */
export function initialsOf(name) {
  const words = String(name ?? '')
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Players by name, keeping only names exactly one player has. Two players can
 * share a name, and a face is a claim about which one a row means: when the
 * name alone cannot say, no face is better than the wrong one.
 */
export function uniqueByName(players) {
  const seen = new Map();
  for (const player of players ?? []) {
    if (!player?.name) continue;
    seen.set(player.name, seen.has(player.name) ? null : player);
  }
  return new Map([...seen].filter(([, player]) => player));
}
