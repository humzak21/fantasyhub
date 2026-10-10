import { useState } from 'react';
import { Coins, Handshake } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { cn, formatDateTime } from '../../lib/utils';
import {
  STAKE_ACCEPTED,
  STAKE_AGREEMENT_RULE,
  STAKE_DECLINED,
  hasWager,
  stakeRequestTerms,
  stakeResponseDeadline,
  stakeStatus
} from './milestones.js';

/** "Sam", "Sam and Lee", "Sam, Lee and Jo". */
function listNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Where one backer's stake stands, in a line under their name: who is in on
 * it, who said no, who is still to answer. A stake nobody took on is struck
 * through rather than hidden — the Hell Yeah still counts, and "why isn't my
 * $10 there any more" is answered by the line saying nobody accepted it.
 */
export function BackerStakeLine({ take, hellYeah, nameOf, now }) {
  const status = stakeStatus(take, hellYeah, now);
  if (!status) return null;

  const names = (ids) => listNames(ids.map(nameOf));
  const pending = status.open && status.waitingOn.length > 0 ? names(status.waitingOn) : null;
  const until = status.deadline ? ` by ${formatDateTime(status.deadline)}` : '';
  const declined = status.declinedBy.length > 0 ? `${names(status.declinedBy)} declined` : null;

  let parts;
  switch (status.state) {
    case 'in_play':
      parts = [
        `In play with ${names(status.acceptedBy)}`,
        declined,
        pending && `${pending} can still answer${until}`
      ];
      break;
    case 'waiting':
      parts = [`Waiting on ${pending} to answer${until}`, declined];
      break;
    case 'unopposed':
      // Nobody on the other side yet. On a staked take, whoever says Hell
      // Nah while it is open is asked too; on an unstaked one nobody can.
      parts = [hasWager(take) ? 'No Hell Nahs yet to take it on' : 'No Hell Nahs to take it on'];
      break;
    default:
      parts = ['No Hell Nah took it on — this stake is off'];
  }
  const note = parts.filter(Boolean).join(' · ');
  const off = status.state === 'off';

  return (
    <span className="flex flex-col text-xs text-muted-foreground">
      <span className="flex items-baseline gap-1">
        <Coins className="h-3 w-3 shrink-0 translate-y-0.5 text-warning" aria-hidden="true" />
        <span className={cn('break-words', off && 'line-through decoration-muted-foreground/60')}>
          <span className="text-foreground">{hellYeah.wager}</span> on it
        </span>
      </span>
      <span className="pl-4">{note}</span>
    </span>
  );
}

/**
 * The question a staked Hell Yeah puts to a Hell Nah: do you accept it?
 *
 * The answer is final and a yes signs the viewer up to pay a second person,
 * so each button opens a confirmation that restates what that answer does,
 * the way `HellNahDialog` restates a fade. Only the viewer's own position
 * moves: every Hell Nah answers for themselves.
 */
export function StakeRequestPanel({ take, requests, nameOf, onRespond, pending }) {
  const [confirming, setConfirming] = useState(null); // { hellYeah, response }

  if (!requests?.length) return null;

  const confirmBacker = confirming ? nameOf(confirming.hellYeah.userId) : '';
  const accepting = confirming?.response === STAKE_ACCEPTED;

  return (
    <section
      aria-label="Hell Yeah stakes waiting on you"
      className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4"
    >
      {requests.map((hellYeah) => {
        const backer = nameOf(hellYeah.userId);
        const deadline = stakeResponseDeadline(hellYeah);
        return (
          <div key={hellYeah.id} className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
              <Handshake className="h-4 w-4 text-warning" aria-hidden="true" />
              Do you accept {backer}&apos;s Hell Yeah?
            </h3>
            <p className="text-sm leading-relaxed text-foreground">
              {stakeRequestTerms(take, hellYeah, backer)}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {STAKE_AGREEMENT_RULE}
              {deadline && <> Answer by {formatDateTime(deadline)}.</>}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => setConfirming({ hellYeah, response: STAKE_ACCEPTED })}
              >
                Accept
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setConfirming({ hellYeah, response: STAKE_DECLINED })}
              >
                Decline
              </Button>
            </div>
          </div>
        );
      })}

      <AlertDialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {accepting ? `Accept ${confirmBacker}'s stake?` : `Decline ${confirmBacker}'s stake?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {accepting
                ? `If this take hits, you'll owe ${confirmBacker} ${confirming?.hellYeah.wager} as well as owing the author ${take.wager}. If it misses, ${confirmBacker} owes you ${confirming?.hellYeah.wager}.`
                : `You won't be in on ${confirmBacker}'s ${confirming?.hellYeah.wager} — only the author's ${take.wager}. The other Hell Nahs decide for themselves; if none of them accept, ${confirmBacker}'s stake is off.`}{' '}
              You can&apos;t change your answer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                const answer = confirming;
                setConfirming(null);
                if (answer) onRespond?.(take, answer.hellYeah, answer.response);
              }}
            >
              {accepting ? 'Accept stake' : 'Decline stake'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
