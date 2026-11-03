import { useState } from 'react';

import { Input } from '../../ui/input';
import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { formatPoints } from '../../../utils/format';

/** A typed figure, or null for anything that is not yet one. */
function parsePoints(text) {
  const value = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * One side's points. What is typed stays as typed while the field has focus,
 * because the committed value is a number: "13." would otherwise read back as
 * "13" and swallow the point.
 */
function PointsField({ label, value, placeholder, onChange }) {
  const [draft, setDraft] = useState(null);

  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={draft ?? (value == null ? '' : String(value))}
      placeholder={placeholder}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(event.target.value);
      }}
      onBlur={() => setDraft(null)}
      className="h-9 px-2.5 tabular"
    />
  );
}

/**
 * A remaining game as one card, so a pairing reads as a pairing however many
 * sit beside it: two buttons, one per team, with "vs" between them. Pressing a
 * team decides the game for them and pressing it again hands the game back to
 * the simulation. Each side carries the figure that result leaves the selected
 * team on.
 *
 * Points are one disclosure further in. A score decides the game by itself, and
 * a side left alone plays at its projection, which is what the field shows until
 * something is typed.
 */
export function GameChoice({
  game,
  teamsById,
  nameOf,
  winnerId,
  figures,
  label = null,
  score = null,
  projection = null,
  onChoose,
  onScore = null
}) {
  const [editing, setEditing] = useState(false);
  const [tied, setTied] = useState(false);
  const sides = [game.team1Id, game.team2Id];
  const names = sides.map((teamId) => nameOf(teamsById.get(teamId)));

  const typePoints = (index, text) => {
    const value = parsePoints(text);
    setTied(false);
    if (text.trim() === '') {
      onScore(game.id, null);
      return;
    }
    if (value == null) return;

    const base = score ?? projection;
    const next = index === 0
      ? { team1Score: value, team2Score: base.team2Score }
      : { team1Score: base.team1Score, team2Score: value };

    // A level score has no winner to decide the game for.
    if (next.team1Score === next.team2Score) setTied(true);
    else onScore(game.id, next);
  };

  const vs = (
    <span
      key="vs"
      aria-hidden="true"
      className="flex items-center justify-center gap-2 text-[11px] font-medium text-muted-foreground before:h-px before:flex-1 before:bg-border/60 after:h-px after:flex-1 after:bg-border/60 @sm:before:hidden @sm:after:hidden"
    >
      vs
    </span>
  );

  return (
    <div className="@container min-w-0 rounded-xl border border-border/60 bg-muted/10 p-1.5">
      {(label || onScore) && (
        <div className="flex min-h-7 items-center justify-between gap-2 px-1 pb-1">
          <p className="text-xs text-muted-foreground tabular">{label}</p>
          {onScore && (
            <button
              type="button"
              aria-expanded={editing}
              aria-label={`Points for ${names[0]} vs ${names[1]}`}
              onClick={() => setEditing((open) => !open)}
              className="rounded-sm text-xs font-medium text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-8"
            >
              {score
                ? `${formatPoints(score.team1Score)}–${formatPoints(score.team2Score)}`
                : 'Set points'}
            </button>
          )}
        </div>
      )}
      {/* One above the other in a narrow card, the way a scoreboard stacks: two
          across at phone width left a team name about eight letters a line. */}
      <div
        className="grid gap-0.5 @sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @sm:gap-1.5"
        role="group"
        aria-label={`Week ${game.week}, ${names[0]} vs ${names[1]}: choose a winner`}
      >
        {sides.map((teamId, index) => {
          const team = teamsById.get(teamId);
          const chosen = winnerId === teamId;
          const passedOver = winnerId != null && !chosen;
          const side = (
            <button
              key={teamId}
              type="button"
              aria-pressed={chosen}
              onClick={() => onChoose(game.id, teamId)}
              className={cn(
                'flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                chosen
                  ? 'border-primary bg-primary/12 font-semibold'
                  : 'border-border/70 bg-muted/20 hover:border-foreground/30 hover:bg-accent/40',
                passedOver && 'text-muted-foreground'
              )}
            >
              <TeamAvatar team={team} size="xs" />
              <span className="min-w-0 flex-1 break-words leading-tight">{names[index]}</span>
              {figures?.[index] != null && (
                <span className="shrink-0 text-xs font-medium tabular">{figures[index]}</span>
              )}
            </button>
          );
          return index === 0 ? [side, vs] : side;
        })}
      </div>
      {editing && onScore && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {sides.map((teamId, index) => (
            <PointsField
              key={teamId}
              label={`${names[index]} points, week ${game.week}`}
              value={score ? (index === 0 ? score.team1Score : score.team2Score) : null}
              placeholder={projection ? formatPoints(index === 0 ? projection.team1Score : projection.team2Score) : ''}
              onChange={(text) => typePoints(index, text)}
            />
          ))}
          <p className="col-span-2 px-1 text-xs text-muted-foreground">
            {tied ? 'A level score has no winner, so it isn’t counted.' : 'A side left alone plays at its projection.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default GameChoice;
