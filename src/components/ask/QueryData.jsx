import { useMemo } from 'react';

import { ScrollHint } from '../ui/scroll-hint';
import { PlayerAvatar } from '../ui/player-avatar';
import { cn } from '../../lib/utils';
import { usePlayersByName } from '../../../hooks/queries/index.js';
import { uniqueByName } from '../../../utils/playerImages.js';

/**
 * What an answer came from: each query the chat ran and the rows it returned,
 * so a member can see the numbers for themselves. Shown open when the chat
 * could not word an answer it could check, and behind "Show the data" when it
 * could.
 */

const ROWS_SHOWN = 10;

const cell = (value) => {
  if (value == null) return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
};

// A column is numbers when every value in it is; its header lines up with them.
const isNumeric = (query, c) => query.rows.some((row) => row[c] != null) && query.rows.every((row) => row[c] == null || typeof row[c] === 'number');

// A column of player names, as the snapshot spells it (`lineups.player`, …).
const isPlayerColumn = (col) => /^player(_name)?$/i.test(col);

/**
 * The names a player column shows, looked up for their headshots (JITS-47).
 * Only a name exactly one player has gets a face; anything else stays text.
 */
function usePlayerFaces(queries) {
  const names = useMemo(() => {
    const found = new Set();
    for (const query of queries) {
      const c = query.columns?.findIndex(isPlayerColumn) ?? -1;
      if (c < 0) continue;
      for (const row of query.rows.slice(0, ROWS_SHOWN)) if (typeof row[c] === 'string') found.add(row[c]);
    }
    return [...found];
  }, [queries]);
  const { data } = usePlayersByName(names);
  return useMemo(() => uniqueByName(data), [data]);
}

const QueryData = ({ queries = [] }) => {
  const shown = queries.filter((q) => q.ok !== false);
  const faces = usePlayerFaces(shown);
  if (!shown.length) return <p className="text-xs text-muted-foreground">No data came back.</p>;
  return (
    <div className="space-y-3">
      {shown.map((query, index) => (
        <figure key={index} className="space-y-1.5">
          {query.rowCount === 0 ? (
            <p className="text-xs text-muted-foreground">No rows.</p>
          ) : (
            <ScrollHint className="rounded-md border border-border">
              <table className="w-max min-w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {query.columns.map((col, c) => (
                      <th key={col} scope="col" className={cn('px-2 py-1.5 font-medium text-muted-foreground', isNumeric(query, c) ? 'text-right' : 'text-left')}>
                        {col.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.rows.slice(0, ROWS_SHOWN).map((row, r) => (
                    <tr key={r} className="border-b border-border/50 last:border-0">
                      {row.map((value, c) => {
                        const face = isPlayerColumn(query.columns[c]) ? faces.get(value) : null;
                        return (
                          <td key={c} className={typeof value === 'number' ? 'tabular px-2 py-1 text-right' : 'px-2 py-1'}>
                            {face ? (
                              <span className="flex items-center gap-1.5">
                                <PlayerAvatar name={value} espnPlayerId={face.espnPlayerId} position={face.position} size={18} />
                                {cell(value)}
                              </span>
                            ) : cell(value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollHint>
          )}
          <figcaption className="text-xs text-muted-foreground">
            {query.rowCount > ROWS_SHOWN ? `First ${ROWS_SHOWN} of ${query.rowCount} rows. ` : ''}
            <details className="inline">
              <summary className="cursor-pointer select-none underline-offset-2 hover:underline">The query</summary>
              <code className="mt-1 block whitespace-pre-wrap break-words rounded bg-muted/50 p-2 font-mono text-[11px] text-foreground">
                {query.sql}
              </code>
            </details>
          </figcaption>
        </figure>
      ))}
    </div>
  );
};

export default QueryData;
