import { Check, X } from 'lucide-react';

import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { GAME_STATE } from '../../../services/espnLiveScoreMapper.js';

/**
 * A parlay pick's TD status: the official grade, the live in-progress overlay,
 * or a pending marker — in that order of precedence.
 *
 * The official grade always wins. `scored_td` is written once, by the Tuesday
 * sync, and is the league's account of what happened; the live signal is an
 * unofficial overlay that only exists to fill the gap between kickoff and that
 * grade. So a non-null `scoredTd` short-circuits everything below it, and the
 * live states never borrow `success`/`destructive` outright — those read as
 * "settled", and a game in progress is not settled. A live TD is shown, and
 * shown as good news, but tagged LIVE so it can never be mistaken for the final
 * word.
 *
 * `unknown is not zero` carries through from the mapper: a game not yet started
 * (or a player whose team is on a bye) shows the pending dash, never "No TD".
 *
 * @param {object} props
 * @param {boolean|null} props.scoredTd the official grade, or null if ungraded
 * @param {{ state: string, scored: boolean, tds: number|null, detail: string|null }} [props.live]
 * @param {boolean} [props.compact] the dense list variant (icon, not badge)
 * @param {boolean} [props.showPendingDash] draw the em dash when nothing else applies
 */
export function ParlayPickStatus({ scoredTd, live, compact = false, showPendingDash = false }) {
  // 1. Official grade — the settled truth, whichever way it went.
  if (scoredTd === true) {
    return compact
      ? <Check className="h-4 w-4 shrink-0 text-success" aria-label="Scored a touchdown" />
      : <Badge variant="success">Scored a TD</Badge>;
  }
  if (scoredTd === false) {
    return compact
      ? <X className="h-4 w-4 shrink-0 text-destructive" aria-label="No touchdown" />
      : <Badge variant="destructive">No TD</Badge>;
  }

  // 2. Live overlay — only once the game has actually started.
  const started =
    live && live.state !== GAME_STATE.NOT_STARTED && live.state !== GAME_STATE.NO_GAME;

  if (started) {
    const isFinal = live.state === GAME_STATE.FINAL;

    if (live.scored) {
      return compact ? (
        <span className="flex shrink-0 items-center gap-1" title={`Scored a TD — live${isFinal ? ' (final, unofficial)' : ''}`}>
          <Check className="h-4 w-4 text-success" aria-label="Scored a touchdown (live)" />
          <LiveDot done={isFinal} />
        </span>
      ) : (
        <Badge variant="success" className="gap-1.5">
          <LiveDot done={isFinal} />
          {live.tds > 1 ? `${live.tds} TDs` : 'TD'} · {isFinal ? 'unofficial' : 'live'}
        </Badge>
      );
    }

    // Started, no TD yet. Muted, not destructive — nothing is settled until the
    // grade lands, and "final (unofficial)" is a different claim from "No TD".
    const label = isFinal ? 'No TD (final)' : 'No TD yet';
    return compact ? (
      <span
        className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
        title={`${label}${live.detail ? ` — ${live.detail}` : ''}`}
      >
        <LiveDot done={isFinal} />
        <span className="tabular-nums">{isFinal ? 'final' : live.detail || 'live'}</span>
      </span>
    ) : (
      <Badge variant="outline" className="gap-1.5 text-muted-foreground">
        <LiveDot done={isFinal} />
        {label}{!isFinal && live.detail ? ` · ${live.detail}` : ''}
      </Badge>
    );
  }

  // 3. Nothing to show yet.
  if (showPendingDash) {
    return (
      <span className="shrink-0 text-xs text-muted-foreground" aria-label="Not yet graded">
        &mdash;
      </span>
    );
  }
  return null;
}

/** A small status dot: pulsing while live, steady once the game is final. */
function LiveDot({ done }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-1.5 w-1.5 rounded-full bg-current', !done && 'animate-pulse')}
    />
  );
}

export default ParlayPickStatus;
