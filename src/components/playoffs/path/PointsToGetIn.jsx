import { formatScore } from '../../../utils/format';

/**
 * What the table says about points, in words. `pointsToGetIn` and `scoresNeeded`
 * work it out; this says it, and says when a result has to change first, because
 * points only split teams level on record.
 *
 * @param {object} props
 * @param {null|object} props.answer - from `pointsToGetIn`
 * @param {Array<object>} props.needed - from `scoresNeeded`
 * @param {number} props.undecided - open games the focus team or the rival has
 * @param {Map<*, object>} props.teamsById
 * @param {(team: object) => string} props.nameOf
 */
export function PointsToGetIn({ answer, needed, undecided, teamsById, nameOf }) {
  if (!answer) return null;

  const rival = answer.rivalId != null ? nameOf(teamsById.get(answer.rivalId)) : null;

  let headline;
  let detail;
  if (answer.status === 'in') {
    if (answer.cushion != null) {
      headline = `In as seed ${answer.seed}, by ${formatScore(answer.cushion)} points`;
      detail = `${rival} is level on record and takes the spot with that many more.`;
    } else {
      headline = `In as seed ${answer.seed}`;
      detail = 'Nobody who could take the spot is level on record, so points don’t come into it.';
    }
  } else if (answer.status === 'points') {
    headline = `${formatScore(answer.points)} points from seed ${answer.seed}`;
    detail = `Level on record with ${rival}, who is ${formatScore(answer.gap)} ahead on points for.`;
  } else {
    headline = 'A result has to change first';
    detail = rival
      ? `${rival} holds seed ${answer.seed} on a better record, and points only split teams level on record.`
      : 'Points only split teams level on record.';
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-display text-2xl font-semibold leading-tight tracking-[-0.01em] tabular">{headline}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{detail}</p>
      </div>

      {answer.status === 'points' && needed.length > 0 && (
        <div>
          <p className="pb-1 text-sm font-semibold">In a single game they win here</p>
          <ul className="divide-y divide-border/40">
            {needed.map((game) => {
              const opponent = nameOf(teamsById.get(game.opponentId));
              return (
                <li key={game.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-[13px]">
                  <span className="min-w-0">
                    <span className="text-muted-foreground tabular">Week {game.week}</span> vs {opponent}
                  </span>
                  <span className="ml-auto text-right font-medium tabular">
                    {game.againstRival
                      ? `Win by ${formatScore(game.margin)}`
                      : `Score ${formatScore(game.needed)}, up from ${formatScore(game.score)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {answer.status === 'points' && needed.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          Give them a win above and this says what they&apos;d have to score in it.
        </p>
      )}

      {undecided > 0 && (
        <p className="text-xs text-muted-foreground">
          {undecided} {undecided === 1 ? 'game' : 'games'} involving them still undecided, so this can move. Favorites win fills
          the rest in.
        </p>
      )}
    </div>
  );
}

export default PointsToGetIn;
