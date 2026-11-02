import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { formatRecord } from '../../../utils/format';
import { getTeamColor } from '../../../utils/teamColors';
import { formatShare } from './pathFormat';

/** A label, a bar and a figure: one row of a distribution. */
function ShareRow({ label, share, figure = formatShare(share), color, strong = false }) {
  return (
    <li className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3rem] items-center gap-2.5 text-[13px]">
      <span className={cn('truncate', strong ? 'font-semibold' : 'text-muted-foreground')}>{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span
          className="block h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.round((share ?? 0) * 100)}%`, background: color }}
        />
      </span>
      <span className="text-right font-medium tabular">{figure}</span>
    </li>
  );
}

/** Where the team finishes: each seed, and the share of seasons it misses. */
export function SeedChances({ team, row }) {
  const color = getTeamColor(team).value;
  const likeliest = Math.max(...row.seedShares, 1 - row.made);

  return (
    <ul className="space-y-2">
      {row.seedShares.map((share, index) => (
        <ShareRow
          key={index}
          label={`Seed ${index + 1}${index < 2 ? ' (bye)' : ''}`}
          share={share}
          color={color}
          strong={share === likeliest}
        />
      ))}
      <ShareRow
        label="Misses out"
        share={1 - row.made}
        color="var(--muted-foreground)"
        strong={1 - row.made === likeliest}
      />
    </ul>
  );
}

/**
 * Every final record the simulations reached: how often the team gets there,
 * and how often that record is enough. The second figure is the answer to
 * "what do we need"; the bar is that figure, so the eye finds where it falls
 * away.
 */
export function RecordsNeeded({ team, records }) {
  const color = getTeamColor(team).value;
  // A record reached once in a thousand seasons says nothing about the rule.
  const shown = records.filter((record) => record.share >= 0.005);

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3rem] gap-2.5 text-xs font-medium text-muted-foreground">
        <span>Final record</span>
        <span>Gets in</span>
        <span className="text-right">Happens</span>
      </div>
      <ul className="space-y-2">
        {shown.map((record) => {
          const whole = Math.floor(record.wins);
          const ties = record.wins === whole ? 0 : 1;
          return (
            <li
              key={record.wins}
              className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3rem] items-center gap-2.5 text-[13px]"
            >
              <span className="font-medium tabular">
                {formatRecord({ wins: whole, losses: Math.floor(record.losses), ties })}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className="block h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${Math.round(record.made * 100)}%`, background: color }}
                  />
                </span>
                <span className="w-9 shrink-0 text-right font-medium tabular">{formatShare(record.made)}</span>
              </span>
              <span className="text-right text-muted-foreground tabular">{formatShare(record.share)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Who it most often meets in round 1, of the seasons it plays one. */
export function FirstRoundOpponents({ opponents, teamsById, nameOf }) {
  return (
    <ul className="space-y-2">
      {opponents.slice(0, 4).map((opponent) => {
        const team = teamsById.get(opponent.id);
        return (
          <li key={opponent.id} className="flex min-w-0 items-center gap-2 text-[13px]">
            <TeamAvatar team={team} size="xs" />
            <span className="min-w-0 flex-1 truncate font-medium" title={nameOf(team)}>
              {nameOf(team)}
            </span>
            <span className="shrink-0 tabular">{formatShare(opponent.ofRound1)}</span>
          </li>
        );
      })}
    </ul>
  );
}
