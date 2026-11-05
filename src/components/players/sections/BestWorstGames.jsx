import { useMemo } from 'react';
import { Flame } from 'lucide-react';

import { GAME_LIST_SIZE } from '../../../../utils/playerProfile/buildPlayerProfile.js';
import { summarizeLine } from '../../../../utils/playerProfile/statCatalog.js';
import { cn } from '../../../lib/utils';
import { formatPoints, formatScore } from '../../../utils/format';
import { FranchiseLink, SectionCard, SectionEmpty } from './SectionCard.jsx';
import { resultTone } from './sectionFormat.js';

const newerFirst = (a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.week ?? 0) - (a.week ?? 0);

/**
 * A season's best and worst weeks, by the profile's own rule: appeared weeks
 * only, ties to the newer week. Across all seasons the profile has them.
 */
function gamesFor(profile, season) {
  if (!season) return { best: profile.bestGames ?? [], worst: profile.worstGames ?? [] };
  const played = season.weeks.filter((w) => w.appeared && w.actualPoints != null);
  return {
    best: [...played].sort((a, b) => b.actualPoints - a.actualPoints || newerFirst(a, b)).slice(0, GAME_LIST_SIZE),
    worst: [...played].sort((a, b) => a.actualPoints - b.actualPoints || newerFirst(a, b)).slice(0, GAME_LIST_SIZE)
  };
}

function GameRow({ line, position, viewer, onClose }) {
  const summary = summarizeLine(line, position);
  const game = line.game;
  return (
    <li className="flex min-w-0 items-start gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="w-16 shrink-0 text-right font-display text-2xl leading-none tracking-[-0.01em] text-foreground tabular">
        {formatPoints(line.actualPoints)}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-baseline gap-1.5 text-sm">
          <span className="shrink-0 font-medium text-foreground tabular">{line.year} · {line.label}</span>
          <span className="shrink-0 text-muted-foreground" aria-hidden="true">·</span>
          <FranchiseLink franchise={line.franchise} viewer={viewer} onClose={onClose} className="min-w-0 text-muted-foreground" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground tabular">
          <span>{line.started ? 'Started' : 'Benched'}</span>
          {game?.result && !game.isBye && (
            <>
              <span aria-hidden="true">·</span>
              <span className={cn('font-semibold', resultTone(game.result))}>{game.result}</span>
              <span>{formatScore(game.teamScore)}–{formatScore(game.opponentScore)}</span>
            </>
          )}
          {summary && (
            <>
              <span aria-hidden="true">·</span>
              <span>{summary}</span>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function GameList({ title, lines, position, viewer, onClose }) {
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <ol>
        {lines.map((line) => (
          <GameRow key={`${line.seasonId}-${line.week}`} line={line} position={position} viewer={viewer} onClose={onClose} />
        ))}
      </ol>
    </div>
  );
}

/** His five best and five worst weeks in the span. */
export default function BestWorstGames({ profile, season, viewer, onClose }) {
  const { best, worst } = useMemo(() => gamesFor(profile, season), [profile, season]);
  const position = profile.player.position;
  return (
    <SectionCard title="Best & worst games" icon={Flame}>
      {best.length === 0 ? (
        <SectionEmpty>No games played in this span</SectionEmpty>
      ) : (
        <div className="grid gap-4 @xl:grid-cols-2">
          <GameList title="Best" lines={best} position={position} viewer={viewer} onClose={onClose} />
          <GameList title="Worst" lines={worst} position={position} viewer={viewer} onClose={onClose} />
        </div>
      )}
    </SectionCard>
  );
}
