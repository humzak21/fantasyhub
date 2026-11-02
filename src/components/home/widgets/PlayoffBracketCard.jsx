import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Trophy } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { BracketView } from '../../playoffs/BracketView';
import { pathToPlayoffsLink } from '../../playoffs/path/pathLink';
import { Badge } from '../../ui/badge';
import { SkeletonCards } from '../../ui/skeleton';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { useStandings } from '../../../../hooks/queries/index.js';
import {
  flattenStandings,
  mergeStandings,
  resolveUpperBracket
} from '../../../../utils/projectedBracket.js';

/**
 * The upper bracket, under the standings it is drawn from.
 *
 * A projection until ESPN draws the postseason, and labelled as one; after
 * that the real games, scores and winners. Registered in `homeWidgets.js`,
 * which is what holds it back until week 10 is scored. The rows are the home
 * page's own `useStandings` entry and the season's games, so it fetches nothing
 * the page has not already read.
 */
export default function PlayoffBracketCard({ ctx }) {
  const { seasonId, season, config, viewerTeam, openTab } = ctx;
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const standings = useStandings(seasonId);

  const bracket = useMemo(
    () =>
      resolveUpperBracket({
        games: season?.schedule ?? [],
        teams: mergeStandings(flattenStandings(standings.data), season?.teams),
        firstRoundWeek: config?.playoffStartWeek ?? undefined
      }),
    [season?.schedule, season?.teams, standings.data, config?.playoffStartWeek]
  );

  const projected = bracket && !bracket.drawn;

  return (
    <HomeWidget
      id="playoff-bracket"
      icon={Trophy}
      title="Playoff bracket"
      aside={projected && <Badge variant="secondary">Projected</Badge>}
      to="/playoffs"
      toLabel="Open the playoffs"
      onNavigate={openTab}
      loading={standings.isPending}
      skeleton={<SkeletonCards count={3} label="Loading the bracket" />}
      error={standings.isError}
      onRetry={() => standings.refetch()}
      empty={!bracket && <p className="text-sm text-muted-foreground">The bracket needs a full field.</p>}
    >
      {bracket && (
        <>
          <BracketView
            bracket={bracket}
            viewerTeamId={viewerTeam?.id ?? null}
            nameOf={(team) => getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}
          />
          {projected && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p className="text-xs text-muted-foreground">If the season ended today.</p>
              <Link
                to={pathToPlayoffsLink(viewerTeam?.id)}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
              >
                Path to the Playoffs
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </>
      )}
    </HomeWidget>
  );
}
