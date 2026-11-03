import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn, storage } from '../../lib/utils';

const KEY_PREFIX = 'disclosure:';

/**
 * A block that is read once and then tucked away: open the first time, and
 * from then on however the reader last left it.
 *
 * The rules under Takes, the tourney note on Pick'ems and the colour key on
 * Automations all sat above their page's content on every visit — on a phone
 * the Takes rules were two and a half screens before the first take. They
 * are still worth reading, once. So the whole block collapses to its title
 * row, and the row stays where the block was, so a reader who wants the
 * rules again finds them in the same place.
 *
 * **This is a preference, not a rule**, which is why it lives in
 * `localStorage` per browser (the `confirmPreference.js` reasoning): a lost
 * mark costs one more read of the rules, nothing else. Every read and write
 * is through `storage`, which swallows a blocked or absent store.
 *
 * @param {object} props
 * @param {string} props.id - what to remember it by, unique across the app
 * @param {React.ReactNode} props.title - the row that stays
 * @param {React.ReactNode} [props.icon]
 * @param {React.ReactNode} [props.summary] - one line beside the title while closed
 * @param {boolean} [props.defaultOpen] - the first time only
 */
export function RememberedDisclosure({
  id,
  title,
  icon = null,
  summary = null,
  defaultOpen = true,
  className,
  children,
}) {
  const key = `${KEY_PREFIX}${id}`;
  const [open, setOpen] = React.useState(() => storage.get(key, defaultOpen) !== false);
  const contentId = React.useId();

  const toggle = () => {
    setOpen((was) => {
      storage.set(key, !was);
      return !was;
    });
  };

  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]',
        className
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-foreground"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {!open && summary && (
          <span className="hidden truncate text-xs font-normal text-muted-foreground sm:inline">
            {summary}
          </span>
        )}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={contentId} className="border-t border-border/60 px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </section>
  );
}
