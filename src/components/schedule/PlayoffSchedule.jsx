import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';

import { Badge } from '../ui/badge';
import { SectionHeading } from '../ui/section-heading';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet';
import { SkeletonCards } from '../ui/skeleton';
import { BracketMatchup, BracketView } from '../playoffs/BracketView';
import { getMaskedTeamName } from '../../utils/displayNameUtils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useStandings } from '../../../hooks/queries/index.js';
import {
  boxScoreGame,
  flattenStandings,
  mergeStandings,
  resolveUpperBracket
} from '../../../utils/projectedBracket.js';
import { resolveViewerTeam } from '../../../utils/viewerTeam.js';

/** The consolation games, under the headings that say which week they are. */
function ConsolationGames({ games, week, viewerTeamId, nameOf, onOpen }) {
  const weeks = [...new Set(games.map((game) => game.week))];

  return (
    <section aria-label="Consolation and placement games" className="space-y-3">
      {weeks.map((gameWeek) => (
        <div key={gameWeek}>
          <h3 className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold">
            Consolation and placement
            {week == null && <span className="text-xs font-normal text-muted-foreground tabular">Week {gameWeek}</span>}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {games
              .filter((game) => game.week === gameWeek)
              .map((matchup) => (
                <BracketMatchup
                  key={matchup.id}
                  matchup={matchup}
                  viewerTeamId={viewerTeamId}
                  nameOf={nameOf}
                  onOpen={() => onOpen(matchup.game, 'Consolation')}
                />
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * The postseason on the Schedule tab: the bracket rather than a list, because
 * a bracket is the only shape that says who plays whom next.
 *
 * Read-only, and any season's. Who is in each slot is `resolveUpperBracket`'s,
 * so this cannot disagree with the Playoffs tab or the home card: the standings'
 * seeds until ESPN draws the postseason, then the real games. Before that it is
 * a projection and says so.
 *
 * Tapping a matchup opens its box score in a sheet, and `renderBoxScore` is the
 * tab's own game card, so a score the admin edits and a lineup a member reads
 * are the same ones as on any other week. A sheet at every width: a card opened
 * in place would land a screen below the tap once the rounds stack on a phone.
 *
 * Consolation and placement games are not in the bracket. They stay beneath it,
 * so nothing that was on the schedule has gone.
 *
 * @param {object} props
 * @param {object} props.season
 * @param {Array} props.schedule
 * @param {number} props.firstRoundWeek
 * @param {number|null} [props.week] - one week of the postseason, or null for all
 * @param {(game: object) => React.ReactNode} props.renderBoxScore
 * @param {React.ReactNode} [props.fallback] - for a league with no bracket to draw
 */
export default function PlayoffSchedule({ season, schedule, firstRoundWeek, week = null, renderBoxScore, fallback = null }) {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const standings = useStandings(season.id);
  const [open, setOpen] = useState(null);

  const bracket = useMemo(
    () =>
      resolveUpperBracket({
        games: schedule,
        teams: mergeStandings(flattenStandings(standings.data), season.teams),
        firstRoundWeek
      }),
    [schedule, standings.data, season.teams, firstRoundWeek]
  );

  if (standings.isPending) return <SkeletonCards count={3} label="Loading the bracket" />;
  if (!bracket) return fallback;

  const nameOf = (team) => getMaskedTeamName(team, user, isAdmin, teamOwnerNames);
  const viewerTeamId = resolveViewerTeam(season.teams, user, teamOwnerNames)?.id ?? null;
  const projected = !bracket.drawn;
  const consolation = bracket.consolation.filter((game) => week == null || game.week === week);

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading icon={Trophy} aside={projected ? <Badge variant="secondary">Projected</Badge> : null}>
          Playoff bracket
        </SectionHeading>
        <p className="mt-2 text-sm text-muted-foreground">
          {projected
            ? "If the season ended today. Tap a matchup to see each team's lineup."
            : 'Tap a matchup for its box score.'}
        </p>
      </div>

      <BracketView
        bracket={bracket}
        viewerTeamId={viewerTeamId}
        nameOf={nameOf}
        currentWeek={week}
        onOpenMatchup={(matchup, round) => setOpen({ game: boxScoreGame(matchup, round.week), title: round.title })}
      />

      {consolation.length > 0 && (
        <ConsolationGames
          games={consolation}
          week={week}
          viewerTeamId={viewerTeamId}
          nameOf={nameOf}
          onOpen={(game, title) => setOpen({ game, title })}
        />
      )}

      <Sheet open={Boolean(open)} onOpenChange={(isOpen) => !isOpen && setOpen(null)}>
        <SheetContent side="bottom" className="overflow-y-auto">
          {open && (
            <div className="mx-auto w-full max-w-3xl space-y-3">
              <SheetHeader>
                <SheetTitle className="font-display text-xl tracking-tight">{open.title}</SheetTitle>
                <SheetDescription>
                  {open.game.isProjected
                    ? `A projected matchup: each roster as it stands today, against week ${open.game.week}'s NFL games.`
                    : `Week ${open.game.week} box score.`}
                </SheetDescription>
              </SheetHeader>
              {renderBoxScore(open.game)}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
