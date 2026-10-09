import { useMemo, useState } from 'react';
import { Crown, UserPlus, UserMinus, Loader2, AlertCircle, Search, Users } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { EmptyState } from '../ui/empty-state';
import { SectionHeading } from '../ui/section-heading';
import { formatDateTime } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  useLeagueAdmins,
  useLeagueMembers,
  useSetLeagueAdmin
} from '../../../hooks/queries/index.js';

/**
 * Who the league's admins are.
 *
 * Admin used to be decided twice — `is_admin()` compared the JWT email to a
 * hardcoded address, and the browser compared the user id to a build-time
 * variable. It is one row in `league_admins` now, `is_admin()` answers from
 * it, and this panel is how a row is added or removed.
 *
 * Nothing here is the enforcement. `list_league_admins()` returns nothing to
 * a non-admin and `set_league_admin()` raises for one, so the `isAdmin` gate
 * on the settings page is an affordance, not a boundary. The function also
 * refuses a self-revoke and the revoke that would leave nobody; this panel
 * disables the first rather than offering a button whose only outcome is an
 * error, and shows the database's own message for anything it refuses.
 *
 * Both directions confirm inline on the row, the way Approvals' Revoke does:
 * granting hands over every power the app has, and removing is not something
 * to do on a mis-tap.
 */

/** One confirmation at a time: `{ userId, grant }`, or null. */
const NO_CONFIRM = null;

const RowSkeleton = () => (
  <ul className="divide-y divide-border rounded-lg border border-border" aria-hidden="true">
    {[0, 1].map((i) => (
      <li key={i} className="space-y-2 px-3 py-3">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-3 w-56 max-w-full animate-pulse rounded bg-muted" />
      </li>
    ))}
  </ul>
);

const LeagueAdminsManager = () => {
  const { user } = useViewer();
  const { data: admins = [], isLoading: adminsLoading, error: adminsError } = useLeagueAdmins();
  const { data: members = [], isLoading: membersLoading, error: membersError } =
    useLeagueMembers();
  const setAdmin = useSetLeagueAdmin();

  const [confirm, setConfirm] = useState(NO_CONFIRM);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);

  const adminIds = useMemo(() => new Set(admins.map((row) => row.userId)), [admins]);

  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return members.filter(
      (member) =>
        !adminIds.has(member.id) &&
        (!term ||
          member.displayName?.toLowerCase().includes(term) ||
          member.email?.toLowerCase().includes(term))
    );
  }, [members, adminIds, query]);

  const nonAdminCount = useMemo(
    () => members.filter((member) => !adminIds.has(member.id)).length,
    [members, adminIds]
  );

  const busyId = setAdmin.isPending ? setAdmin.variables?.userId : null;

  /** Every write goes through here so a refusal is shown, not swallowed. */
  const apply = async ({ userId, grant }) => {
    setError(null);
    try {
      await setAdmin.mutateAsync({ userId, grant });
    } catch (err) {
      setError(
        `${grant ? 'Could not add admin' : 'Could not remove admin'}: ${err?.message || 'unknown error'}`
      );
    } finally {
      setConfirm(NO_CONFIRM);
    }
  };

  const ask = (userId, grant) => {
    setError(null);
    setConfirm({ userId, grant });
  };

  const isConfirming = (userId, grant) =>
    confirm?.userId === userId && confirm?.grant === grant;

  const renderConfirm = (row, grant, prompt) => {
    const busy = busyId === row.userId;
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{prompt}</span>
        <Button
          size="sm"
          variant={grant ? 'default' : 'destructive'}
          onClick={() => apply({ userId: row.userId, grant })}
          disabled={busy}
        >
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Confirm
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(NO_CONFIRM)} disabled={busy}>
          Cancel
        </Button>
      </div>
    );
  };

  const renderAdmin = (row) => {
    const isSelf = row.userId === user?.id;
    const busy = busyId === row.userId;

    return (
      <li key={row.userId} className="px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <span className="truncate">{row.displayName || row.email}</span>
              {isSelf && <Badge variant="secondary">YOU</Badge>}
            </p>
            {/* Two of this league's accounts share a display name; the
                address is what tells them apart. */}
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
            {row.grantedAt && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Granted <span className="tabular">{formatDateTime(row.grantedAt)}</span>
              </p>
            )}
          </div>

          {isConfirming(row.userId, false) ? (
            renderConfirm(row, false, `Remove ${row.displayName || 'this account'} as an admin?`)
          ) : (
            <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => ask(row.userId, false)}
                disabled={busy || isSelf}
                aria-label={`Remove ${row.displayName || row.email} as admin`}
              >
                <UserMinus className="mr-1.5 h-4 w-4" />
                Remove
              </Button>
              {isSelf && (
                <span className="text-xs text-muted-foreground">
                  You cannot remove your own access
                </span>
              )}
            </div>
          )}
        </div>
      </li>
    );
  };

  const renderCandidate = (member) => {
    const row = { userId: member.id, displayName: member.displayName };
    const busy = busyId === member.id;

    return (
      <li key={member.id} className="px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{member.displayName || member.email}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>

          {isConfirming(member.id, true) ? (
            renderConfirm(
              row,
              true,
              `Give ${member.displayName || 'this account'} every admin power?`
            )
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 self-start sm:self-auto"
              onClick={() => ask(member.id, true)}
              disabled={busy}
              aria-label={`Make ${member.displayName || member.email} an admin`}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              Make admin
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="h-5 w-5" />
          Admins
        </CardTitle>
        <CardDescription>
          An admin has every power the app has: editing scores and teams, running
          seasons, approving and deleting accounts, and adding or removing other
          admins. Grant it sparingly. The database refuses removing your own access
          and removing the last admin.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="space-y-3">
          <SectionHeading
            as="h3"
            aside={!adminsLoading && <span className="tabular">{admins.length}</span>}
          >
            Current admins
          </SectionHeading>

          {adminsError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {adminsError.message || 'Could not load the admin list.'}
              </AlertDescription>
            </Alert>
          ) : adminsLoading ? (
            <RowSkeleton />
          ) : admins.length === 0 ? (
            <EmptyState
              icon={Crown}
              title="No admins listed"
              description="The list comes back empty when your account is not an admin."
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {admins.map(renderAdmin)}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeading as="h3">Add an admin</SectionHeading>

          {membersError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {membersError.message || 'Could not load the member list.'}
              </AlertDescription>
            </Alert>
          ) : membersLoading || adminsLoading ? (
            <RowSkeleton />
          ) : nonAdminCount === 0 ? (
            <EmptyState
              icon={Users}
              title="Everyone is already an admin"
              description="There is no other account to grant it to."
            />
          ) : (
            <>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by name or email"
                  aria-label="Filter members"
                  className="pl-9"
                />
              </div>

              <ul className="divide-y divide-border rounded-lg border border-border">
                {candidates.map(renderCandidate)}
                {candidates.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Nobody matches &ldquo;{query.trim()}&rdquo;.
                  </li>
                )}
              </ul>
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
};

export default LeagueAdminsManager;
