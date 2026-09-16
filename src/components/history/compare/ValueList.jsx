import { useState } from 'react';

import { Button } from '../../ui/button';
import { TeamAvatar } from '../../ui/team-identity';
import { formatStatValue } from './statFormat';

/**
 * A list longer than this collapses. One entry per franchise fits (the league
 * has fifteen); one per franchise-season — a scatter drawn season by season —
 * runs past a hundred, which is a page of scrolling nobody asked for.
 */
const COLLAPSED_ENTRIES = 16;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The exact figures behind the chart, ranked — the chart's legend, and what a
 * reader on a phone reads instead of hovering. Franchises with no figure for
 * the picked stat and seasons are named underneath rather than drawn as zero.
 */
const ValueList = ({ caption, rows, scatter, stat, statY, averaged, missing, identity }) => {
  const [expanded, setExpanded] = useState(false);
  const entries = scatter ? scatterEntries(scatter, stat) : rows;
  const collapsible = entries.length > COLLAPSED_ENTRIES + 2;
  const shown = collapsible && !expanded ? entries.slice(0, COLLAPSED_ENTRIES) : entries;

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-muted-foreground">{caption}</p>

      {entries.length > 0 && (
        <ol aria-label="Values" className="gap-x-6 text-sm sm:columns-2">
          {shown.map((entry, index) => (
            <li
              key={`${entry.franchiseId}:${entry.year ?? 'all'}`}
              className="flex min-w-0 break-inside-avoid items-center gap-2 border-b border-border/60 py-1.5"
            >
              <span className="w-5 shrink-0 text-right tabular text-xs text-muted-foreground">
                {entry.rank ?? index + 1}
              </span>
              <TeamAvatar team={identity.avatar(entry.franchiseId)} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">
                  {identity.name(entry.franchiseId)}
                  {entry.year != null && <span className="text-muted-foreground"> · {entry.year}</span>}
                </span>
                {entry.seasons != null && (
                  <span className="block text-xs text-muted-foreground">
                    {plural(entry.seasons, 'season')}
                    {stat.from === 'week' && ` · ${plural(entry.games, 'game')}`}
                  </span>
                )}
              </span>
              {scatter ? (
                <span className="shrink-0 text-right tabular text-xs leading-tight">
                  <span className="block font-semibold text-foreground">{formatStatValue(stat, entry.x, { averaged })}</span>
                  <span className="block text-muted-foreground">{formatStatValue(statY, entry.y, { averaged })}</span>
                </span>
              ) : (
                <span className="shrink-0 tabular font-semibold text-foreground">
                  {formatStatValue(stat, entry.value, { averaged })}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {collapsible && (
        <Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show fewer' : `Show all ${entries.length}`}
        </Button>
      )}

      {scatter && entries.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Top figure {stat.label.toLowerCase()}, below it {statY.label.toLowerCase()}. Dashed lines mark the average of the
          points shown.
        </p>
      )}

      {missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">No data:</span> {missing.map((id) => identity.name(id)).join(', ')}
        </p>
      )}
    </div>
  );
};

/** Scatter points in the first stat's order, best first. */
function scatterEntries(scatter, stat) {
  const sign = stat.better === 'lower' ? 1 : -1;
  return [...scatter.points].sort((a, b) => sign * (a.x - b.x) || (a.year ?? 0) - (b.year ?? 0));
}

export default ValueList;
