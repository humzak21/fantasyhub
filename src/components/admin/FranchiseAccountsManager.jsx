import { useMemo, useState } from 'react';
import { AlertCircle, Link2 } from 'lucide-react';

import { Alert, AlertDescription } from '../ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Skeleton } from '../ui/skeleton';
import {
  useFranchiseAccounts,
  useHistoryFranchises,
  useLeagueMembers,
  useSetFranchiseAccount
} from '../../../hooks/queries/index.js';

const UNLINKED = 'none';

/**
 * Which account speaks for which franchise: the one thing that lets a member
 * edit a profile.
 *
 * Only an admin sets it, because a member's display name is theirs to retype
 * and so cannot decide who may write. A new member is linked here once
 * approved. `isAdmin` on the settings page is the affordance; the boundary is
 * `set_franchise_account()`, and the RLS on `franchise_accounts`.
 */
const FranchiseAccountsManager = () => {
  const { data: members = [], isLoading: membersLoading } = useLeagueMembers();
  const { data: links = [], isLoading: linksLoading } = useFranchiseAccounts();
  const { data: franchises = [], isLoading: franchisesLoading } = useHistoryFranchises();
  const setLink = useSetFranchiseAccount();
  const [error, setError] = useState(null);

  const linkByUser = useMemo(
    () => new Map(links.map((link) => [link.userId, link.franchiseId])),
    [links]
  );
  const options = useMemo(
    () => [...franchises].sort((a, b) => a.owner_name.localeCompare(b.owner_name)),
    [franchises]
  );

  const change = async (userId, value) => {
    setError(null);
    try {
      await setLink.mutateAsync({ userId, franchiseId: value === UNLINKED ? null : value });
    } catch (linkError) {
      setError(linkError.message || 'Could not change that link.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Franchises
        </CardTitle>
        <CardDescription>
          Which account can edit which franchise&rsquo;s profile. An account has one franchise; a
          franchise can have more than one account. Link a new member here after approving them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {membersLoading || linksLoading || franchisesLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
                <Select
                  value={linkByUser.get(member.id) ?? UNLINKED}
                  onValueChange={(value) => change(member.id, value)}
                  disabled={setLink.isPending}
                >
                  <SelectTrigger className="h-9 w-full sm:w-[220px]" aria-label={`Franchise for ${member.displayName}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNLINKED}>Not linked</SelectItem>
                    {options.map((franchise) => (
                      <SelectItem key={franchise.id} value={franchise.id}>
                        {franchise.owner_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default FranchiseAccountsManager;
