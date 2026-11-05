import { Badge } from '../../ui/badge.jsx';
import { NflTeamLogo } from '../../ui/nfl-team-logo.jsx';
import { PlayerAvatar } from '../../ui/player-avatar.jsx';
import { cn } from '../../../lib/utils';
import { getPositionColor } from '../../../utils/positionColors';
import { FranchiseLink } from './SectionCard.jsx';
import { plural, yearSpan } from './sectionFormat.js';

const HEALTHY = new Set(['ACTIVE', 'NORMAL', 'HEALTHY']);
const OUT = new Set(['OUT', 'INJURY_RESERVE', 'SUSPENSION', 'IR']);

/** "INJURY_RESERVE" → "Injury reserve". */
function injuryLabel(status) {
  const text = String(status).toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Who he is: face, name, position, NFL team, health, and where he is now.
 * The player's own name is never masked; the franchise is.
 */
export default function ProfileHeader({ profile, viewer, onClose }) {
  const { player, current, career } = profile;
  const injury = player.injuryStatus && !HEALTHY.has(player.injuryStatus) ? player.injuryStatus : null;
  const span = yearSpan(career?.firstYear, career?.lastYear);
  const seasons = career?.seasonsPlayed ?? 0;
  const franchises = career?.franchisesCount ?? 0;

  return (
    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
      <PlayerAvatar
        name={player.name}
        espnPlayerId={player.espnPlayerId}
        position={player.position}
        team={player.proTeam}
        showTeam
        size={64}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate font-display text-3xl leading-tight tracking-[-0.01em] text-foreground">
          {player.name ?? 'Unknown player'}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {player.position && (
            <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', getPositionColor(player.position))}>
              {player.position}
            </span>
          )}
          {player.proTeam && (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <NflTeamLogo team={player.proTeam} size={16} />
              {player.proTeam}
            </span>
          )}
          {injury && (
            <Badge variant={OUT.has(injury) ? 'destructive' : 'warning'} className="px-1.5 py-0 text-[11px]">
              {injuryLabel(injury)}
            </Badge>
          )}
        </div>
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          {current?.franchise ? (
            <>
              Now on{' '}
              <FranchiseLink franchise={current.franchise} viewer={viewer} onClose={onClose} className="font-medium text-foreground" />
            </>
          ) : (
            'Not on a roster this season'
          )}
        </p>
        {span && (
          <p className="text-[13px] text-muted-foreground tabular">
            Rostered {span} · {plural(seasons, 'season')} · {plural(franchises, 'franchise')}
          </p>
        )}
      </div>
    </div>
  );
}
