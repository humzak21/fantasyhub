/**
 * The sentences on the home page's Punishment Watch card, over
 * `services/punishmentWatch.js` and the record book's `places` and `starts`.
 *
 * Pure, so the arithmetic in each sentence is tested here and the component
 * only lays them out. Names come in through `nameOf`, already masked.
 */

import { startKey } from '../recordBook/situations.js';

/** "2–7", or "2–6–1" with a tie: the site's record face (`formatRecord`). */
const formatRecord = (wins, losses) => {
  if (wins && typeof wins === 'object') {
    const { ties = 0 } = wins;
    return ties > 0 ? `${wins.wins}–${wins.losses}–${ties}` : `${wins.wins}–${wins.losses}`;
  }
  return `${wins}–${losses}`;
};

const formatOrdinal = (n) => {
  const ones = n % 10;
  const tens = n % 100;
  if (ones === 1 && tens !== 11) return `${n}st`;
  if (ones === 2 && tens !== 12) return `${n}nd`;
  if (ones === 3 && tens !== 13) return `${n}rd`;
  return `${n}th`;
};

const percent = (share) => {
  if (share == null) return '—';
  const rounded = Math.round(share * 100);
  if (rounded === 0 && share > 0) return '<1%';
  if (rounded === 100 && share < 1) return '>99%';
  return `${rounded}%`;
};

export { percent as formatShare };

/** The odds, or what replaced them once the arithmetic settled it. */
export function oddsLabel(team) {
  if (team.status === 'locked') return 'Locked';
  if (team.status === 'safe') return 'Safe';
  return `${team.odds}%`;
}

const games = (n) => {
  const shown = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${shown} ${n === 1 ? 'game' : 'games'}`;
};

/** How far a team is from the one above it, on record or on points. */
export function gapLine(team, nameOf) {
  if (team.aboveId == null) return null;
  const above = nameOf(team.aboveId);
  if (team.gamesBack > 0) return `${games(team.gamesBack)} behind ${above}`;
  if (team.pointsBack > 0) {
    return `Level with ${above} on record, ${team.pointsBack.toFixed(1)} points for behind`;
  }
  return `Level with ${above}`;
}

/** "the team in last", "the team 2nd from the bottom". */
const placeName = (fromBottom) =>
  fromBottom === 1 ? 'the team in last' : `the team ${formatOrdinal(fromBottom)} from the bottom`;

/**
 * What it takes to escape: the wins that rule last place out, or that winning
 * out is not enough on its own.
 */
export function escapeLine(team, { decided = false } = {}) {
  if (decided) return team.status === 'locked' ? 'Finished last: the punishment is theirs.' : 'Escaped.';
  if (team.status === 'locked') return 'Locked in: no result left can lift them off the bottom.';
  if (team.status === 'safe') return 'Safe: a team below can no longer catch them.';
  if (team.winsToBeSafe == null) {
    return `Winning all ${team.gamesLeft} left does not rule it out on its own: they need results elsewhere too.`;
  }
  if (team.winsToBeSafe === team.gamesLeft) {
    return `Win all ${team.gamesLeft} left and no other result can put them last.`;
  }
  return `Win ${team.winsToBeSafe} of ${team.gamesLeft} left and no other result can put them last.`;
}

/**
 * The line under the most likely path: how much of the team's punishment runs
 * that way, and how often that way ends in it.
 */
export function pathLine(team) {
  const { path } = team;
  if (!path) return null;
  const record = formatRecord(path.wins, path.losses);
  return `Going ${record} is ${percent(path.ofPunishments)} of the seasons they are punished in, and ${percent(path.punishedIfSo)} of the seasons they go ${record} end in punishment.`;
}

/**
 * The fewest wins after which the punishment chance drops under `threshold`,
 * or null if no number of wins does.
 */
export function winsToGetUnder(team, threshold = 0.1) {
  const outcome = team.byWins.find((row) => row.punished != null && row.punished < threshold);
  return outcome ? outcome.wins : null;
}

/** Whom the team wants to win a game, as a sentence. */
export function keyGameLine(game, teamId, nameOf) {
  const name1 = nameOf(game.team1Id);
  const name2 = nameOf(game.team2Id);
  if (game.involves) {
    const mineIs1 = game.team1Id === teamId;
    const ifWin = mineIs1 ? game.ifTeam1 : game.ifTeam2;
    const ifLose = mineIs1 ? game.ifTeam2 : game.ifTeam1;
    return `${percent(ifWin)} with a win, ${percent(ifLose)} with a loss`;
  }
  const rootIs1 = game.rootFor === game.team1Id;
  const good = rootIs1 ? game.ifTeam1 : game.ifTeam2;
  const bad = rootIs1 ? game.ifTeam2 : game.ifTeam1;
  return `Root for ${rootIs1 ? name1 : name2}: ${percent(good)} if they win, ${percent(bad)} if ${rootIs1 ? name2 : name1} do`;
}

/**
 * What league history says about a team in this spot: how the same place after
 * the same number of games ended, and how the same record did.
 *
 * @param {object} team - a watched team
 * @param {{ places?: object, starts?: object }} situations - `useSituations`' data
 * @returns {string[]} empty when there is no history to read
 */
export function historyLines(team, situations) {
  if (!situations) return [];
  const played = team.wins + team.losses + team.ties;
  const lines = [];

  const fromBottom = team.fromBottom;
  const place = situations.places?.[played]?.[fromBottom - 1];
  if (place && place.seasons > 0) {
    lines.push(
      `After ${played} games, ${placeName(fromBottom)} has taken the punishment in ${place.punished} of ${place.seasons} ${place.seasons === 1 ? 'season' : 'seasons'}.`
    );
  }

  const groups = situations.starts?.[played];
  if (groups) {
    const key = startKey(team);
    const group = groups.find((entry) => entry.key === key);
    const record = formatRecord(team);
    if (group) {
      const teamsWord = group.count === 1 ? 'team has' : 'teams have';
      const playoffs = group.madePlayoffs > 0 ? `, and ${group.madePlayoffs} made the playoffs` : '';
      lines.push(
        `${group.count} ${teamsWord} been ${record} after ${played} games before: ${group.punished} took the punishment${playoffs}.`
      );
    } else if (groups.length > 0) {
      lines.push(`No team has been ${record} after ${played} games before.`);
    }
  }

  return lines;
}
