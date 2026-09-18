import { Coins, ListChecks, Trophy } from 'lucide-react';

import { cn } from '../../lib/utils';
import { EDIT_WINDOW_MS, FADE_WINDOW_MS, MAX_BODY } from './milestones.js';

/**
 * What the page says the game is: what a take can win, what it can put on the
 * line, and the rules it is held to.
 *
 * The reward tiers and the payout warning are league rules, not UI copy, and
 * nothing in this system enforces them — no column holds a FAAB balance and
 * grading a take moves no money. They sit above the board because the board is
 * where somebody decides how far out to call something, and a rule nobody reads
 * before posting is a rule that gets argued about after.
 *
 * It used to be one paragraph in the page header's description, which is meant
 * for one line; three questions a reader asks separately were answered in one
 * run of text, and the windows were in it only half. The windows below are
 * read from `milestones.js`, which mirrors the RLS policies, so the copy cannot
 * promise a day the database does not give.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const days = (ms) => {
  const n = Math.round(ms / DAY_MS);
  return `${n} day${n === 1 ? '' : 's'}`;
};

const REWARDS = [
  { when: 'The upcoming week', amount: '$5 FAAB' },
  { when: '3+ weeks out', amount: '$10 FAAB' },
  { when: 'Anything further', amount: '$15 FAAB' }
];

function RulesPanel({ icon: Icon, iconClassName, title, children }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Icon className={cn('h-4 w-4 shrink-0', iconClassName)} aria-hidden="true" />
        {title}
      </h2>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function RuleList({ children }) {
  return <ul className="list-disc space-y-1.5 pl-4 marker:text-muted-foreground/60">{children}</ul>;
}

export function TakesRules({ className }) {
  return (
    <section aria-label="How takes work" className={cn('grid gap-3 md:grid-cols-3', className)}>
      <RulesPanel icon={Trophy} iconClassName="text-warning" title="What you can win">
        <p>A take that hits pays out by how far ahead you called it.</p>
        <dl className="mt-2.5 divide-y divide-border rounded-md border border-border">
          {REWARDS.map(({ when, amount }) => (
            <div key={when} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
              <dt>{when}</dt>
              <dd className="tabular font-medium text-foreground">{amount}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2.5">
          The longest calls may be paid from next season&rsquo;s FAAB, and cash rewards are also
          in play.
        </p>
      </RulesPanel>

      <RulesPanel icon={Coins} iconClassName="text-primary" title="What you can bet">
        <RuleList>
          <li>
            A stake is optional. Put FAAB, pubes or actual dollars on your take &mdash; say which.
          </li>
          <li>
            A stake is what lets others say <span className="text-foreground">Hell Nah</span> and
            take the other side. No stake, no Hell Nahs.
          </li>
          <li>If your take hits, everyone who said Hell Nah owes you the stake.</li>
          <li>
            If it misses, <span className="text-foreground">you pay out every one of them</span>.
          </li>
        </RuleList>
      </RulesPanel>

      <RulesPanel icon={ListChecks} iconClassName="text-info" title="How it works">
        <RuleList>
          <li>
            Post a take (up to {MAX_BODY} characters) and pick when it&rsquo;s decided: a week, the
            end of the regular season, or the end of the season.
          </li>
          <li>It&rsquo;s graded correct, incorrect or push once that point has passed.</li>
          <li>
            You can reword it or change the stake for {days(EDIT_WINDOW_MS)} after posting, until
            it&rsquo;s graded. When it&rsquo;s decided can&rsquo;t be changed.
          </li>
          <li>You can delete your own take any time before it&rsquo;s graded.</li>
          <li>
            You can say Hell Nah, or take yours back, for {days(FADE_WINDOW_MS)} after the take was
            last edited. After that both sides are locked in until it&rsquo;s graded.
          </li>
          <li>Editing a take reopens Hell Nahs for another {days(FADE_WINDOW_MS)}, for everyone.</li>
        </RuleList>
      </RulesPanel>
    </section>
  );
}

export default TakesRules;
