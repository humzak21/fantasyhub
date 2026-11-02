import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';

/**
 * A remaining game as two buttons, one per team. Pressing a team decides the
 * game for them and pressing it again hands the game back to the simulation.
 * Each side carries the figure that result leaves the selected team on.
 */
export function GameChoice({ game, teamsById, nameOf, winnerId, figures, label = null, onChoose }) {
  const sides = [game.team1Id, game.team2Id];

  return (
    <div className="@container min-w-0">
      {label && <p className="mb-1 text-xs text-muted-foreground tabular">{label}</p>}
      {/* One above the other in a narrow card, the way a scoreboard stacks: two
          across at phone width left a team name about eight letters a line. */}
      <div className="grid gap-1 @sm:grid-cols-2 @sm:gap-1.5" role="group" aria-label={`Week ${game.week}: choose a winner`}>
        {sides.map((teamId, index) => {
          const team = teamsById.get(teamId);
          const chosen = winnerId === teamId;
          const passedOver = winnerId != null && !chosen;
          return (
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
              <span className="min-w-0 flex-1 break-words leading-tight">{nameOf(team)}</span>
              {figures?.[index] != null && (
                <span className="shrink-0 text-xs font-medium tabular">{figures[index]}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GameChoice;
