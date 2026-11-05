import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';

import { buildTrends } from '../../../../utils/playerProfile/buildPlayerProfile.js';
import { cn } from '../../../lib/utils';
import { EMPTY, deltaDirection, formatDelta, formatFraction, formatPoints, formatRecord } from '../../../utils/format';
import { SectionCard, SectionEmpty } from './SectionCard.jsx';
import { plural, projectionSentence, streakSentence } from './sectionFormat.js';

const DIRECTION_TONE = { positive: 'text-success', negative: 'text-destructive', neutral: 'text-muted-foreground' };

function Item({ label, children, note }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground tabular">{children}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

/**
 * How the span is going: recent form against the average, boom and bust, the
 * range, steadiness, the streak, his team's record when he started, and the
 * projections. With a season picked, that season; across all seasons, the
 * newest season he played in (the profile's own `trends`).
 */
export default function Trends({ profile, season }) {
  const trends = useMemo(() => (season ? buildTrends([season]) : profile.trends ?? null), [season, profile.trends]);
  const totals = season?.totals ?? profile.career ?? {};
  const record = season?.recordWhenStarted ?? profile.recordWhenStarted ?? null;
  const games = record ? record.wins + record.losses + record.ties : 0;
  const direction = deltaDirection(trends?.delta);

  return (
    <SectionCard title="Trends" icon={TrendingUp} aside={trends?.year ? `Over ${trends.year}` : null}>
      {!trends ? (
        <SectionEmpty>No games played to read a trend from</SectionEmpty>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {trends.recent.games >= trends.span.games ? (
            // Every game is a recent game: "20.7 vs 20.7, 0.0" compares the span with itself.
            <Item label="Season average" note={`All ${plural(trends.span.games, 'game')} count as recent`}>
              {formatPoints(trends.span.avg)}
            </Item>
          ) : (
            <Item label={`Last ${trends.recent.games} vs season`} note={`${plural(trends.span.games, 'game')} this season`}>
              {formatPoints(trends.recent.avg)} <span className="text-muted-foreground">vs {formatPoints(trends.span.avg)}</span>{' '}
              <span className={cn('font-semibold', DIRECTION_TONE[direction])}>{formatDelta(trends.delta)}</span>
            </Item>
          )}
          <Item label="Boom / bust" note={trends.boomRate == null ? 'Needs 3 games' : 'Weeks at 1.5× / 0.5× his average'}>
            {formatFraction(trends.boomRate, 0)} / {formatFraction(trends.bustRate, 0)}
          </Item>
          <Item label="Floor / ceiling" note="20th / 80th percentile">
            {formatPoints(trends.floor)} / {formatPoints(trends.ceiling)}
          </Item>
          <Item label="Consistency" note="Std. deviation; lower is steadier">
            {formatPoints(trends.consistency)}
          </Item>
          <Item label="Record when started" note="His team’s results in weeks he started">
            {games ? formatRecord(record) : EMPTY}
          </Item>
          <Item label="Streak">
            {streakSentence(trends.currentStreak) ?? EMPTY}
          </Item>
        </dl>
      )}
      <p className="text-[13px] text-muted-foreground">{projectionSentence(totals.projectedDelta, totals.projectedDeltaWeeks)}</p>
    </SectionCard>
  );
}
