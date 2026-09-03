import { useMemo, useState } from 'react';
import {
  UserCheck,
  Check,
  X,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { cn, formatDateTime } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  useMemberApprovals,
  useSetMemberApproval,
  useDeleteMemberAccount
} from '../../../hooks/queries/index.js';

/**
 * Who is waiting to join, and what the admin decided about everyone else.
 *
 * A confirmed sign-up lands here as *pending* (a trigger on `auth.users`
 * writes the row). Three things can happen to it:
 *
 *   * **Approve** — the account becomes a member: names unmask, the
 *     members-only tabs appear, and every form accepts them. `is_approved_member()`
 *     is what every policy and RPC asks, so this is the whole grant.
 *   * **Reject** — the request leaves the queue but the account keeps existing
 *     with no access. It is listed under "rejected" so a change of mind is one
 *     click; nothing about a rejection is visible to the person.
 *   * **Revoke** — the account is deleted outright, cascades and all. There is
 *     no undo, which is why the button asks twice, inline, on the row. The
 *     person can sign up again and re-enters the queue.
 *
 * Nothing here is the enforcement. `list_member_approvals()` returns nothing to
 * a non-admin and both write RPCs raise for one, so the `isAdmin` gate on the
 * settings page is an affordance, not a boundary.
 *
 * Unlike the roles manager there is no local-until-Save state: each action is
 * one row and one decision, and making it immediate is the honest shape.
 */

const SECTION = {
  pending: { title: 'Waiting for approval', empty: 'Nobody is waiting.' },
  rejected: { title: 'Rejected', empty: null },
  approved: { title: 'Approved members', empty: null }
};

const MemberApprovalsManager = () => {
  const { user } = useViewer();
  const { data: rows = [], isLoading, error: loadError } = useMemberApprovals();
  const setApproval = useSetMemberApproval();
  const deleteAccount = useDeleteMemberAccount();

  const [showRejected, setShowRejected] = useState(false);
  const [showApproved, setShowApproved] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState(null);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [error, setError] = useState(null);

  const groups = useMemo(
    () => ({
      pending: rows.filter((row) => row.status === 'pending'),
      rejected: rows.filter((row) => row.status === 'rejected'),
      approved: rows.filter((row) => row.status === 'approved')
    }),
    [rows]
  );

  /** Every write goes through here so a refusal is shown, not swallowed. */
  const run = async (userId, action, failure) => {
    setError(null);
    setPendingUserId(userId);
    try {
      await action();
    } catch (err) {
      setError(`${failure}: ${err?.message || 'unknown error'}`);
    } finally {
      setPendingUserId(null);
      setConfirmRevokeId(null);
    }
  };

  const decide = (row, status) =>
    run(
      row.userId,
      () => setApproval.mutateAsync({ userId: row.userId, status }),
      status === 'approved' ? 'Could not approve' : 'Could not reject'
    );

  const revoke = (row) =>
    run(
      row.userId,
      () => deleteAccount.mutateAsync({ userId: row.userId }),
      'Could not revoke'
    );

  const renderRow = (row) => {
    const busy = pendingUserId === row.userId;
    const isSelf = row.userId === user?.id;
    const confirming = confirmRevokeId === row.userId;

    return (
      <li key={row.userId} className="px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.displayName}</p>
            {/* Two of this league's accounts share a display name; the
                address is what tells them apart. */}
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.status === 'pending' && row.requestedAt && `Requested ${formatDateTime(row.requestedAt)}`}
              {row.status !== 'pending' && row.decidedAt && (
                `${row.status === 'approved' ? 'Approved' : 'Rejected'} ${formatDateTime(row.decidedAt)}`
              )}
              {row.status === 'approved' && !row.decidedAt && 'Approved'}
              {isSelf && ' · you'}
            </p>
          </div>

          {confirming ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                Delete this account permanently? They can sign up again.
              </span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => revoke(row)}
                disabled={busy}
              >
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmRevokeId(null)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {row.status !== 'approved' && (
                <Button
                  size="sm"
                  onClick={() => decide(row, 'approved')}
                  disabled={busy}
                  aria-label={`Approve ${row.displayName}`}
                >
                  {busy ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-4 w-4" />
                  )}
                  Approve
                </Button>
              )}
              {row.status === 'pending' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decide(row, 'rejected')}
                  disabled={busy}
                  aria-label={`Reject ${row.displayName}`}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Reject
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmRevokeId(row.userId)}
                disabled={busy || isSelf}
                title={isSelf ? 'You cannot revoke your own account.' : undefined}
                aria-label={`Revoke ${row.displayName}`}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Revoke
              </Button>
            </div>
          )}
        </div>
      </li>
    );
  };

  const renderSection = (key, { open, onToggle } = {}) => {
    const list = groups[key];
    const { title, empty } = SECTION[key];
    const collapsible = typeof open === 'boolean';
    const Chevron = open ? ChevronDown : ChevronRight;

    return (
      <section key={key} className="space-y-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex w-full items-center gap-2 text-left text-sm font-medium"
          >
            <Chevron className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {open ? 'Hide' : 'Show'} {list.length} {title.toLowerCase()}
          </button>
        ) : (
          <h3 className="flex items-center gap-2 text-sm font-medium">
            {title}
            <Badge variant={list.length > 0 ? 'warning' : 'secondary'}>{list.length}</Badge>
          </h3>
        )}

        {(!collapsible || open) && (
          list.length === 0 ? (
            empty && <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>
          ) : (
            <ul
              className={cn(
                'divide-y divide-border rounded-lg border border-border',
                key === 'pending' && 'border-warning/40'
              )}
            >
              {list.map(renderRow)}
            </ul>
          )
        )}
      </section>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Approvals
        </CardTitle>
        <CardDescription>
          New accounts are visitors until you approve them. Approving unmasks the
          league and opens every form to them; rejecting hides the request without
          giving access; revoking deletes the account outright.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {loadError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {loadError.message || 'Could not load the approval queue.'}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading accounts…</p>
        ) : (
          <>
            {renderSection('pending')}
            {renderSection('rejected', {
              open: showRejected,
              onToggle: () => setShowRejected((was) => !was)
            })}
            {renderSection('approved', {
              open: showApproved,
              onToggle: () => setShowApproved((was) => !was)
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MemberApprovalsManager;
