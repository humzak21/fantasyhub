import { useMemo } from 'react';

import { BracketView } from '../playoffs/BracketView';
import { Badge } from '../ui/badge';
import { getMaskedTeamName } from '../../utils/displayNameUtils';
import { usesSeededPlayoffs } from '../../../utils/playoffSeeding.js';
import {
  flattenStandings,
  mergeStandings,
  resolveUpperBracket
} from '../../../utils/projectedBracket.js';
import { STANDINGS_VIEW } from '../../../utils/standings/standingsView.js';

const CAPTIONS = {
  [STANDINGS_VIEW.LIVE]: 'If this week ended now.',
  [STANDINGS_VIEW.OFFICIAL]: 'If the season ended today.'
};

/**
 * The bracket the table above would draw.
 *
 * `resolveUpperBracket` is the one answer to who is in a slot, so real rows win
 * slot by slot and "turns to actual after week 14 is scored" needs no rule of its
 * own. Seeded seasons only: nothing before 2026 has a bracket to project.
 *
 * @param {object} props
 * @param {object} props.standings - the rows the drawer is showing
 * @param {Array<object>} props.games - the games that view counts
 * @param {Array<object>} props.teams - the season's teams
 * @param {number} props.seasonYear
 * @param {number} [props.firstRoundWeek]
 * @param {'live'|'official'|'week'} props.mode
 * @param {number|null} [props.week] - for the week view
 * @param {*} [props.viewerTeamId]
 * @param {{ user: object|null, isAdmin: boolean, teamOwnerNames: Array }} props.viewer
 */
export function StandingsBracket({
  standings,
  games,
  teams,
  seasonYear,
  firstRoundWeek,
  mode,
  week = null,
  viewerTeamId = null,
  viewer
}) {
  const seeded = usesSeededPlayoffs(seasonYear);

  const bracket = useMemo(
    () =>
      seeded
        ? resolveUpperBracket({
            games,
            teams: mergeStandings(flattenStandings(standings), teams),
            firstRoundWeek
          })
        : null,
    [seeded, games, standings, teams, firstRoundWeek]
  );

  if (!bracket) return null;

  const projected = !bracket.drawn;

  return (
    <section aria-label="Playoff bracket" className="space-y-2 px-1 pt-2">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">Playoff bracket</h3>
        {projected && <Badge variant="secondary">Projected</Badge>}
      </div>
      <BracketView
        bracket={bracket}
        viewerTeamId={viewerTeamId}
        nameOf={(team) => getMaskedTeamName(team, viewer.user, viewer.isAdmin, viewer.teamOwnerNames)}
      />
      {projected && (
        <p className="text-xs text-muted-foreground">
          {CAPTIONS[mode] ?? `As the standings stood after week ${week}.`}
        </p>
      )}
    </section>
  );
}

export default StandingsBracket;
