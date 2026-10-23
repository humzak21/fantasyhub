import { Link } from 'react-router-dom';
import { ChevronRight, LogIn } from 'lucide-react';

import { cn } from '../../lib/utils';

/**
 * One line per tab, saying what is behind it. A tab with no line here still
 * gets a card — its label is enough — so a new tab is never missing from the
 * directory for want of a sentence.
 */
const TAB_BLURBS = {
  rankings: 'Power rankings week by week, plus scoring, luck and league history compared.',
  schedule: 'Every matchup, with scores, projections and lineups.',
  teams: 'Every roster and lineup in the league.',
  history: 'Every season since 2020: champions, records and rivalries.'
};

/**
 * The home page for a visitor or an account awaiting approval: a card per tab
 * they may open, and nothing else.
 *
 * Derived from the shell's own tab list filtered by `shouldShowTab` — never a
 * hand-written list. If a tab's access rule changes, the directory follows; a
 * card whose only outcome is a redirect is the bug this prevents.
 */
export function HomeDirectory({ tabs = [], shouldShowTab = () => true, signedOut = false }) {
  const cards = tabs.filter((tab) => tab.id !== 'home' && tab.inNav !== false && shouldShowTab(tab));

  return (
    <div className="space-y-6">
      {signedOut && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/[0.06] p-4">
          <LogIn className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">League members, sign in</p>
            <p className="text-sm text-muted-foreground">
              Use <span className="font-medium text-foreground">Login</span> at the top right to see your
              matchup, your pick&apos;ems and the takes board.
            </p>
          </div>
        </div>
      )}

      <nav aria-label="Sections">
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <Link
                to={`/${id}`}
                className={cn(
                  'group flex min-h-20 items-center gap-3 rounded-xl border border-border bg-card p-4 outline-none transition-colors',
                  'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]',
                  'hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                {Icon && (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{label}</span>
                  {TAB_BLURBS[id] && (
                    <span className="block text-sm text-muted-foreground">{TAB_BLURBS[id]}</span>
                  )}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default HomeDirectory;
