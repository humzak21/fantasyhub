import { Trophy } from 'lucide-react';

import { RecordText } from '../ui/number-text';
import { TeamAvatar } from '../ui/team-identity';
import { cn } from '../../lib/utils';
import { formatScore } from '../../utils/format';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

const SEED_CHIP =
  'inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-primary/15 px-1 font-display text-[11px] font-semibold leading-none text-primary tabular';

/**
 * One side of a matchup: a seeded team, or what the slot is waiting for. Spans,
 * because a matchup can be a button, and nothing inside a button may be a div.
 */
function BracketSide({ side, viewerTeamId, nameOf, detailOf }) {
  if (!side.team) {
    return (
      <span className="flex min-h-9 items-center px-2.5 text-[13px] text-muted-foreground">
        {side.label}
      </span>
    );
  }

  const isViewer = sameId(side.team.id, viewerTeamId);
  const name = nameOf(side.team);

  return (
    <span
      className={cn(
        'flex min-h-9 min-w-0 items-center gap-2 px-2.5 py-1 text-[13px]',
        isViewer && 'shadow-[inset_2px_0_0_var(--primary)]',
        side.lost && 'text-muted-foreground'
      )}
    >
      {side.seed != null && <span className={SEED_CHIP}>{side.seed}</span>}
      <TeamAvatar team={side.team} size="xs" />
      <span className={cn('min-w-0 flex-1 break-words leading-tight', side.won ? 'font-semibold' : 'font-medium')}>
        {name}
      </span>
      {side.score != null ? (
        <span className={cn('shrink-0 tabular', side.won && 'font-semibold')}>{formatScore(side.score)}</span>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground tabular">{detailOf(side.team)}</span>
      )}
    </span>
  );
}

const defaultDetail = (team) =>
  team.wins == null ? null : <RecordText wins={team.wins} losses={team.losses} ties={team.ties} />;

/**
 * One matchup's card. With `onOpen` the whole card is a button; a matchup with
 * nobody in it yet has nothing to open, so it stays a card.
 */
export function BracketMatchup({ matchup, viewerTeamId = null, nameOf, detailOf = defaultDetail, onOpen = null }) {
  const named = matchup.sides.filter((side) => side.team);
  const sides = (
    <>
      {matchup.sides.map((side, index) => (
        <BracketSide
          key={side.team?.id ?? side.label ?? index}
          side={side}
          viewerTeamId={viewerTeamId}
          nameOf={nameOf}
          detailOf={detailOf}
        />
      ))}
      {matchup.bye && (
        <span className="flex min-h-9 items-center px-2.5 text-[13px] text-muted-foreground">First-round bye</span>
      )}
    </>
  );
  const card = 'overflow-hidden rounded-lg border border-border/70 bg-muted/20';

  if (!onOpen || named.length === 0) {
    return <li className={cn(card, 'divide-y divide-border/50')}>{sides}</li>;
  }

  return (
    <li className={card}>
      <button
        type="button"
        onClick={() => onOpen(matchup)}
        aria-haspopup="dialog"
        aria-label={`Box score: ${named.map((side) => nameOf(side.team)).join(' vs ')}`}
        className="block w-full cursor-pointer divide-y divide-border/50 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {sides}
      </button>
    </li>
  );
}

/**
 * The upper bracket, from `resolveUpperBracket`: three rounds side by side
 * when the card is wide, stacked when it is not. By the card's width rather
 * than the viewport's, because the home page's column is narrower than the
 * page it sits on. Nothing scrolls sideways, and a long name wraps.
 *
 * Read-only. The form you pick winners on is `PlayoffsBracket`, whose slots are
 * radios; this is the picture of who is where. It takes any season's bracket,
 * so the Schedule tab, the home card and the Path to the Playoffs draw the same
 * thing, and `onOpenMatchup` is what the Schedule tab hangs its box scores on.
 *
 * @param {object} props
 * @param {object} props.bracket
 * @param {*} [props.viewerTeamId] - railed like the viewer's row in a table
 * @param {(team: object) => string} props.nameOf - the masked name
 * @param {(team: object) => React.ReactNode} [props.detailOf] - right of the name
 * @param {(matchup: object, round: object) => void} [props.onOpenMatchup]
 * @param {number|null} [props.currentWeek] - the round being looked at, lit
 */
export function BracketView({
  bracket,
  viewerTeamId = null,
  nameOf,
  detailOf = defaultDetail,
  onOpenMatchup = null,
  currentWeek = null
}) {
  return (
    <div className="@container">
      <div className="grid gap-4 @2xl:grid-cols-3 @2xl:gap-3">
        {bracket.rounds.map((round) => (
          <section key={round.id} aria-label={round.title} className="min-w-0">
            <h3 className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold">
              {round.title}
              <span
                className={cn(
                  'text-xs font-normal tabular',
                  round.week === currentWeek ? 'font-medium text-primary' : 'text-muted-foreground'
                )}
              >
                Week {round.week}
              </span>
            </h3>
            <ul className="grid gap-2 @md:grid-cols-2 @2xl:grid-cols-1">
              {round.matchups.map((matchup) => (
                <BracketMatchup
                  key={matchup.id}
                  matchup={matchup}
                  viewerTeamId={viewerTeamId}
                  nameOf={nameOf}
                  detailOf={detailOf}
                  onOpen={onOpenMatchup ? (opened) => onOpenMatchup(opened, round) : null}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {bracket.champion && (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <Trophy className="h-4 w-4 text-warning" aria-hidden="true" />
          {nameOf(bracket.champion)}
        </p>
      )}
    </div>
  );
}

export default BracketView;
