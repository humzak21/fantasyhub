import { Trophy } from 'lucide-react';

import { neighbours } from '../../../../utils/playerProfile/rankCareers.js';
import { Skeleton } from '../../ui/skeleton.jsx';
import { ROW_TONE, VIEWER_RAIL } from '../../ui/table-tones.js';
import { cn } from '../../../lib/utils';
import { EMPTY, formatPoints } from '../../../utils/format';
import { PlayerLink } from '../PlayerLink.jsx';
import { SectionCard, SectionEmpty } from './SectionCard.jsx';
import { plural } from './sectionFormat.js';

function Row({ entry, isSelf }) {
  return (
    <li
      data-self={isSelf || undefined}
      className={cn(
        'grid grid-cols-[2.75rem_minmax(0,1fr)_auto_3.5rem] items-center gap-2 rounded-md px-2 py-1.5 text-sm',
        isSelf && [ROW_TONE.viewer, VIEWER_RAIL]
      )}
    >
      <span className="text-muted-foreground tabular">
        {entry.rank != null ? `${entry.position}${entry.rank}` : EMPTY}
      </span>
      {isSelf ? (
        <span className="truncate font-semibold text-foreground">{entry.name}</span>
      ) : (
        <PlayerLink playerId={entry.playerId} className="truncate text-foreground">{entry.name}</PlayerLink>
      )}
      <span className="text-right font-medium text-foreground tabular">{formatPoints(entry.pointsPerGame)}</span>
      <span className="text-right text-xs text-muted-foreground tabular">{entry.gamesPlayed} gp</span>
    </li>
  );
}

/**
 * The OG Jits strip: where his career points per game sit among his position,
 * with the two above and two below. A neighbour's name opens his page in place
 * of this one. The ranking is a league-wide query of its own, so this card
 * loads and fails alone.
 */
export default function LeagueStanding({ profile, ranking, rankingQuery }) {
  const playerId = profile.player.id;
  const entry = ranking?.byPlayerId?.[playerId] ?? null;
  const loading = !ranking && (rankingQuery?.isLoading || rankingQuery?.isPending) && !rankingQuery?.isError;
  const list = ranking ? neighbours(ranking, playerId) : [];
  const minGames = ranking?.minGames ?? 5;

  let body;
  if (rankingQuery?.isError || (!ranking && !loading)) {
    body = <SectionEmpty>League ranks unavailable right now</SectionEmpty>;
  } else if (loading) {
    body = (
      <div className="space-y-2" role="status" aria-label="Loading league ranks">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-7" />)}
      </div>
    );
  } else if (list.length === 0) {
    body = <SectionEmpty>No games in this league yet, so no place to show</SectionEmpty>;
  } else {
    body = (
      <ol className="space-y-0.5">
        {list.map((e) => <Row key={e.playerId} entry={e} isSelf={e.playerId === playerId} />)}
      </ol>
    );
  }

  const aside = entry?.qualified
    ? `${entry.position}${entry.rank} of ${entry.of}`
    : entry && ranking
      ? `Unranked · ${plural(entry.gamesPlayed, 'game')}`
      : null;

  return (
    <SectionCard title="OG Jits standing" icon={Trophy} aside={aside}>
      {body}
      <p className="text-xs text-muted-foreground">
        Career points per game, players with {minGames}+ games in this league.
      </p>
    </SectionCard>
  );
}
