import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { OpponentChip } from '../ui/opponent-chip';
import { cn } from '../../lib/utils';
import { useDebouncedValue } from '../../hooks/use-debounced-value.js';
import { usePlayerSearch } from '../../../hooks/queries/index.js';
import { getPositionColor } from '../../utils/positionColors';

/**
 * Name entry: autocomplete over the synced `players` table, with the typed text
 * itself as a fallback.
 *
 * The fallback is not a nicety. `players` only holds people ESPN has put on a
 * roster in this league, so a fringe goal-line back — exactly the kind of pick
 * this parlay invites — may genuinely not be there, and an autocomplete that
 * cannot be overridden would make him unpickable.
 *
 * The suggestion list is an absolutely-positioned `role="listbox"` rather than
 * a Popover: a popover moves focus, and on touch that fights the on-screen
 * keyboard — the list closes as the keyboard opens.
 *
 * Shared by the Pick'ems tab and the home page's widget. `idPrefix` keeps the
 * label/listbox ids distinct; `initialSelected` and `onChange` are how an
 * unsubmitted choice survives as a draft (`pickDraft.js`) — the picker reports
 * every change and the caller decides what to keep.
 */
export const PlayerPicker = ({
  initialQuery,
  initialSelected = null,
  opponents = {},
  submitting,
  onSubmit,
  onCancel,
  onChange,
  idPrefix = 'parlay-player'
}) => {
  const [query, setQuery] = useState(initialSelected?.name ?? initialQuery ?? '');
  const [selected, setSelected] = useState(initialSelected);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const blurTimer = useRef(null);

  // The blur close is deferred (see `onBlur` below), so it has to be cancelled
  // on unmount — otherwise a timer fires 150ms after the section is gone and
  // calls setState on a component that no longer exists.
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const debounced = useDebouncedValue(query, 250);
  const { data: matches = [], isFetching } = usePlayerSearch(debounced, {
    enabled: isFocused && !selected
  });

  // A stale highlight from the previous term would send Enter to the wrong row.
  useEffect(() => setActiveIndex(-1), [debounced]);

  const trimmed = query.trim();
  const canSubmit = Boolean(selected) || trimmed.length > 0;
  const showList = isFocused && !selected && trimmed.length >= 2;

  const freeTextOnly = useMemo(
    () => showList && !isFetching && matches.length === 0,
    [showList, isFetching, matches.length]
  );

  const choose = (player) => {
    setSelected(player);
    setQuery(player.name);
    setIsFocused(false);
    onChange?.({ playerId: player.id, playerName: player.name });
  };

  const handleKeyDown = (event) => {
    if (!showList || matches.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? matches.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(matches[activeIndex]);
    } else if (event.key === 'Escape') {
      setIsFocused(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor={idPrefix} className="mb-1.5 block text-sm font-medium text-foreground">
          Your player
        </label>
        <Input
          id={idPrefix}
          value={query}
          placeholder="Start typing a name…"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${idPrefix}-suggestions`}
          aria-autocomplete="list"
          onChange={(event) => {
            setQuery(event.target.value);
            // Typing after choosing means they changed their mind; the id must
            // not survive its own name.
            setSelected(null);
            onChange?.({ playerId: null, playerName: event.target.value });
          }}
          onFocus={() => setIsFocused(true)}
          // A click on a suggestion blurs the input first, so closing on blur
          // immediately would unmount the row before its handler runs.
          onBlur={() => {
            clearTimeout(blurTimer.current);
            blurTimer.current = setTimeout(() => setIsFocused(false), 150);
          }}
          onKeyDown={handleKeyDown}
        />

        {showList && (
          <ul
            id={`${idPrefix}-suggestions`}
            role="listbox"
            aria-label="Player suggestions"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]"
          >
            {matches.map((player, index) => (
              <li key={player.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  // `onMouseDown`, not `onClick`: the input's blur fires first
                  // on a click and the list would be gone by then.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(player);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm pointer-coarse:py-3',
                    index === activeIndex ? 'bg-accent' : 'hover:bg-accent/50'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{player.name}</span>
                  {player.position && (
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
                        getPositionColor(player.position)
                      )}
                    >
                      {player.position}
                    </span>
                  )}
                  <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                    {player.teamAbbreviation ?? ''}
                  </span>
                  <OpponentChip entry={opponents[player.proTeamId]} className="w-14" />
                  {player.injuryStatus && player.injuryStatus !== 'ACTIVE' && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-warning"
                      title={player.injuryStatus}
                      aria-label={`Injury status ${player.injuryStatus}`}
                    />
                  )}
                </button>
              </li>
            ))}

            {isFetching && matches.length === 0 && (
              <li className="px-2 py-2 text-sm text-muted-foreground">Searching…</li>
            )}

            {freeTextOnly && (
              <li className="px-2 py-2 text-sm text-muted-foreground">
                No match. Submit to use &ldquo;{trimmed}&rdquo; as written.
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => onSubmit({ playerId: selected?.id ?? null, playerName: trimmed })}
          disabled={!canSubmit || submitting}
        >
          {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Lock in pick
        </Button>

        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}

        {!selected && trimmed.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Saved as typed &mdash; not matched to a synced player.
          </span>
        )}
      </div>
    </div>
  );
};

export default PlayerPicker;
