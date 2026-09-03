/**
 * "Your account is waiting for approval" — the in-flow notice a signed-in but
 * unapproved member sees at the top of every page.
 *
 * Deliberately the opposite of <DisplayNamePrompt>: not a portal, not modal,
 * nothing to dismiss. An unapproved account can still browse exactly what a
 * visitor can, so blocking the page would take away the one thing they are
 * allowed to do while they wait. It just says what is going on, because the
 * alternative — masked names and closed forms with no explanation — reads as a
 * broken site.
 *
 * It does not distinguish pending from rejected. A rejected request is a
 * pending one the admin has hidden from the queue, and the client only ever
 * reads the boolean `is_approved_member()`; the status itself never leaves the
 * database.
 *
 * "Check again" refetches the viewer's own approval. The admin's approval
 * cannot reach this browser's cache (see `useIsApprovedMember`), so the
 * answer also refreshes on focus and once a minute — the button is for the
 * person who has just been told "you're in" and does not want to wait.
 */

import { Clock, Loader2 } from 'lucide-react';

import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useIsApprovedMember } from '../../../hooks/queries/index.js';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';

export default function ApprovalPendingNotice({ className = '' }) {
  const { isAuthenticated, isApproved, isApprovalLoading } = useViewer();
  const { refetch, isFetching } = useIsApprovedMember();

  if (!isAuthenticated || isApprovalLoading || isApproved) return null;

  return (
    <Alert className={className} role="status">
      <Clock className="h-4 w-4" />
      <AlertTitle>Your account is awaiting approval</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          The league admin has to approve new accounts. Until then you can browse
          like a visitor: names stay hidden and picks are closed.
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 self-start sm:self-auto"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Check again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
