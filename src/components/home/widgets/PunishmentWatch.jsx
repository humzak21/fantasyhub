import { useMemo, useRef, useState } from 'react';
import { Skull } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { Badge } from '../../ui/badge';
import { NumberText, RecordText } from '../../ui/number-text';
import { Skeleton } from '../../ui/skeleton';
import { TeamAvatar } from '../../ui/team-identity';
import { TeamLink } from '../../ui/team-link';
import { cn } from '../../../lib/utils';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { useNearViewport } from '../../../hooks/use-near-viewport.js';
import { useSituations } from '../../../../hooks/queries/index.js';
import { buildPunishmentWatch } from '../../../../services/punishmentWatch.js';
import {
  escapeLine,
  formatShare,
  gapLine,
  historyLines,
  keyGameLine,
  oddsLabel,
  pathLine
} from '../../../../utils/home/punishmentWatch.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

const ordinal = (n) => {
  const ones = n % 10;
  const tens = n % 100;
  if (ones === 1 && tens !== 11) return `${n}st`;
  if (ones === 2 && tens !== 12) return `${n}nd`;
  if (ones === 3 && tens !== 13) return `${n}rd`;
  return `${n}th`;
};

/** One group of facts under the selected team: a label, then its lines. */
function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </section>
  );
}

/** The share of seasons as a bar: how much of the bottom this team owns. */
function OddsMeter({ team }) {
  const width = team.status === 'locked' ? 100 : team.status === 'safe' ? 0 : team.odds;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span className="block h-full rounded-full bg-destructive" style={{ width: `${width}%` }} />
    </span>
  );
}

/**
 * Punishment Watch: the bottom four, and how each could end up last.
 *
 * Last place in the regular season takes the punishment, so from the Tuesday
 * week 9 is scored (`homeWidgets.js`) this card plays out the rest of the
 * season with the playoff odds' own model (`services/punishmentWatch.js`) and
 * says, for each of the bottom four: the chance, the most likely run of results
 * that ends in it, the wins that rule it out, the games that move it most and
 * whom to root for in them, the team really in the race, and what league history
 * says about the same place and the same record. Every figure is a count from
 * that simulation or from the record book's completed seasons; nothing is a
 * guess dressed as a fact.
 *
 * One team's detail is open at a time: the viewer's if they are in the four,
 * else the team in last. The history is the record book's own query key, so it
 * shares a fetch with Records, and waits for the card to come near the viewport.
 */
export default function PunishmentWatch({ ctx }) {
  const { season, config, viewerTeam, openTab } = ctx;
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const anchorRef = useRef(null);
  const near = useNearViewport(anchorRef);
  const situations = useSituations({ enabled: near });

  const watch = useMemo(
    () =>
      buildPunishmentWatch({
        teams: season?.teams ?? [],
        games: season?.schedule ?? [],
        regularSeasonWeeks: config?.regularSeasonWeeks || 14
      }),
    [season?.teams, season?.schedule, config?.regularSeasonWeeks]
  );

  const teamById = useMemo(() => new Map((season?.teams ?? []).map((team) => [team.id, team])), [season?.teams]);
  const nameOf = (id) => getMaskedTeamName(teamById.get(id), user, isAdmin, teamOwnerNames);

  const watched = watch?.watched ?? [];
  const viewerWatched = watched.find((team) => sameId(team.id, viewerTeam?.id));
  const [pickedId, setPickedId] = useState(null);
  const selected = watched.find((team) => sameId(team.id, pickedId)) ?? viewerWatched ?? watched[0] ?? null;

  const weeksLeft = watch ? Math.max(0, ...watched.map((team) => team.gamesLeft)) : 0;

  return (
    <HomeWidget
      id="punishment-watch"
      icon={Skull}
      title="Punishment Watch"
      aside={watch && <Badge variant="secondary">After week {watch.scoredWeek}</Badge>}
      to="/rankings?view=statistics"
      toLabel="How past seasons were decided"
      onNavigate={openTab}
      empty={!watch && <p className="text-sm text-muted-foreground">No standings to read yet.</p>}
    >
      {watch && (
        <div ref={anchorRef} className="@container space-y-4">
          <p className="text-sm text-muted-foreground">
            {watch.decided
              ? 'The regular season is over. Last place takes the punishment.'
              : `Last place in the regular season takes the punishment. ${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} left; the odds are ${watch.simulations.toLocaleString()} simulated seasons, on the model behind Playoff%.`}
          </p>

          <ol className="space-y-1.5" aria-label="The bottom four">
            {watched.map((team) => {
              const isSelected = selected && sameId(team.id, selected.id);
              const isViewer = sameId(team.id, viewerTeam?.id);
              const seasonTeam = teamById.get(team.id);
              return (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => setPickedId(team.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      isSelected ? 'border-primary/50 bg-accent/40' : 'border-border/60 hover:bg-accent/30'
                    )}
                  >
                    <span className="w-8 shrink-0 text-sm font-semibold tabular text-muted-foreground">
                      {ordinal(team.place)}
                    </span>
                    <TeamAvatar team={seasonTeam} size="xs" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate font-medium">{nameOf(team.id)}</span>
                        {isViewer && (
                          <span className="shrink-0 rounded bg-primary/15 px-1 text-[10px] font-semibold uppercase text-primary">
                            You
                          </span>
                        )}
                      </span>
                      {/* Under the name, not beside it: on a phone the name
                          is the thing that would give way. */}
                      <span className="text-xs text-muted-foreground">
                        <RecordText record={team} /> · <NumberText value={team.pointsFor} /> PF
                      </span>
                      <OddsMeter team={team} />
                    </span>
                    <span className="w-14 shrink-0 text-right font-display text-xl leading-none tabular">
                      {oddsLabel(team)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {!watch.decided && (
            <p className="text-xs text-muted-foreground">
              {watch.others.length > 0
                ? `Also still in range: ${watch.others.map((other) => `${nameOf(other.id)} ${other.odds}%`).join(', ')}.`
                : 'Nobody above these four can finish last.'}
            </p>
          )}

          {selected && (
            <TeamDetail
              team={selected}
              watch={watch}
              nameOf={nameOf}
              seasonTeam={teamById.get(selected.id)}
              situations={situations}
            />
          )}
        </div>
      )}
    </HomeWidget>
  );
}

function TeamDetail({ team, watch, nameOf, seasonTeam, situations }) {
  const gap = gapLine(team, nameOf);
  const history = historyLines(team, situations.data);
  const open = !watch.decided && team.status === 'open';

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-3 @md:p-4" aria-live="polite">
      <div className="space-y-0.5">
        <h3 className="text-base font-semibold">
          <TeamLink team={seasonTeam}>{nameOf(team.id)}</TeamLink>
          <span className="text-muted-foreground">
            {' '}
            · {team.status === 'open' ? `${team.odds}% to be punished` : oddsLabel(team)}
          </span>
        </h3>
        {gap && <p className="text-sm text-muted-foreground">{ordinal(team.place)} · {gap}</p>}
      </div>

      <Section title="What it takes to escape">
        <p className="text-sm">{escapeLine(team, { decided: watch.decided })}</p>
        {open && team.byWins.length > 0 && <WinsTable team={team} />}
      </Section>

      {open && team.path && (
        <Section title={`The most likely way down: going ${team.path.wins}–${team.path.losses}`}>
          <ol className="flex flex-wrap gap-1.5" aria-label="Results in the most likely path to punishment">
            {team.path.results.map((game) => (
              <li
                key={game.id}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                  game.won ? 'border-success/30 bg-success/10' : 'border-destructive/30 bg-destructive/10'
                )}
              >
                <span className={cn('font-semibold', game.won ? 'text-success' : 'text-destructive')}>
                  {game.won ? 'W' : 'L'}
                </span>
                <span className="tabular text-muted-foreground">Wk {game.week}</span>
                <span className="max-w-[9rem] truncate">vs {nameOf(game.opponentId)}</span>
                <span className="tabular text-muted-foreground">{formatShare(game.winShare)} to win</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            The likeliest order of those results, from the games left.
          </p>
          <p className="text-sm text-muted-foreground">{pathLine(team)}</p>
        </Section>
      )}

      {open && team.keyGames.length > 0 && (
        <Section title="The games that move it most">
          <ul className="space-y-1.5">
            {team.keyGames.map((game) => (
              <li key={game.id} className="text-sm">
                <span className="tabular text-muted-foreground">Wk {game.week} · </span>
                <span className="font-medium">
                  {game.involves
                    ? `vs ${nameOf(game.team1Id === team.id ? game.team2Id : game.team1Id)}`
                    : `${nameOf(game.team1Id)} vs ${nameOf(game.team2Id)}`}
                </span>
                <span className="block text-muted-foreground @md:inline">
                  <span className="hidden @md:inline"> — </span>
                  {keyGameLine(game, team.id, nameOf)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {open && team.rivals.length > 0 && (
        <Section title="The real race">
          <p className="text-sm text-muted-foreground">
            In the seasons {nameOf(team.id)} finishes last, the team just above is{' '}
            {team.rivals
              .map((rival) => `${nameOf(rival.id)} (${formatShare(rival.share)})`)
              .join(', ')}
            .
          </p>
        </Section>
      )}

      <Section title="What history says">
        {situations.isPending ? (
          <Skeleton className="h-4 w-3/4" />
        ) : situations.isError ? (
          <p className="text-sm text-muted-foreground">League history did not load.</p>
        ) : history.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {history.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No completed season to compare with yet.</p>
        )}
      </Section>
    </div>
  );
}

/** The punishment chance at each number of wins left, and how likely each is. */
function WinsTable({ team }) {
  return (
    <div>
      <table className="w-full text-sm">
        <caption className="sr-only">Punishment chance by wins in the games left</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 pr-2 text-left font-medium">Goes</th>
            <th scope="col" className="px-2 py-1 text-right font-medium">Chance of that</th>
            <th scope="col" className="py-1 pl-2 text-right font-medium">Punished if so</th>
          </tr>
        </thead>
        <tbody>
          {team.byWins.map((row) => (
            <tr key={row.wins} className="border-t border-border/40">
              <td className="py-1 pr-2 tabular">
                {row.wins}–{row.losses}
              </td>
              <td className="px-2 py-1 text-right tabular text-muted-foreground">{formatShare(row.share)}</td>
              <td
                className={cn(
                  'py-1 pl-2 text-right tabular font-medium',
                  row.punished >= 0.5 ? 'text-destructive' : row.punished < 0.1 ? 'text-success' : ''
                )}
              >
                {formatShare(row.punished)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
