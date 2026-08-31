import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Check, Loader2, AlertCircle, Search } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { cn } from '../../lib/utils';
import {
  useLeagueMembers,
  useParlayCommissioners,
  useSetParlayCommissioners
} from '../../../hooks/queries/index.js';

/**
 * Who holds the parlay commissioner role.
 *
 * The role exists because `is_admin()` is one hardcoded email and the TD parlay
 * needs people who can *read* everyone's picks without gaining the league's
 * write paths. It is not a one-time decision — it changes hands, and more than
 * one person can hold it — so it belongs on a settings page rather than in a
 * migration with a uuid typed by hand.
 *
 * Nothing here is the enforcement. `league_roles` is admin-write by RLS and
 * `list_league_members()` returns nothing to a non-admin, so a viewer who got
 * this component on screen would see an empty list and be unable to write. The
 * `isAdmin` gate on the settings page is an affordance, not a boundary.
 *
 * Selection is local until Save: a per-row toggle that wrote immediately would
 * mean an admin clearing the list passes through a state where nobody holds the
 * role, and every mis-click is a live grant.
 */
const LeagueRolesManager = () => {
  const { data: members = [], isLoading: membersLoading, error: membersError } =
    useLeagueMembers();
  const { data: commissioners = [], isLoading: rolesLoading } = useParlayCommissioners();
  const save = useSetParlayCommissioners();

  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // `selected` starts as null — "not loaded yet" — rather than as an empty
  // array, which is indistinguishable from "the admin cleared the list" and
  // would let a Save land before the current grants had arrived.
  const heldKey = useMemo(
    () => commissioners.map((row) => row.userId).sort().join(','),
    [commissioners]
  );

  useEffect(() => {
    setSelected(heldKey ? heldKey.split(',') : []);
  }, [heldKey]);

  const current = selected ?? [];
  const dirty = current.slice().sort().join(',') !== heldKey;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (member) =>
        member.displayName?.toLowerCase().includes(term) ||
        member.email?.toLowerCase().includes(term)
    );
  }, [members, query]);

  const toggle = (userId) => {
    setError(null);
    setSaved(false);
    setSelected((was) => {
      const next = new Set(was ?? []);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return [...next];
    });
  };

  const handleSave = async () => {
    setError(null);
    try {
      await save.mutateAsync(current);
      setSaved(true);
    } catch (err) {
      setError(err?.message || 'Could not update roles.');
    }
  };

  const loading = membersLoading || rolesLoading || selected === null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crosshair className="h-5 w-5" />
          Parlay commissioners
        </CardTitle>
        <CardDescription>
          Commissioners see every member&rsquo;s TD parlay pick, in every week, and get
          the TD Parlay tab. They cannot change picks or anything else &mdash; the role is
          read-only.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {membersError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {membersError.message || 'Could not load the member list.'}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading members…</p>
        ) : members.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No accounts to show.
          </p>
        ) : (
          <>
            {/* The search box earns its place at ~13 members and will earn it
                more as the league turns over. */}
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
              {filtered.map((member) => {
                const isSelected = current.includes(member.id);
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={() => toggle(member.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors pointer-coarse:py-3',
                        isSelected ? 'bg-primary/10' : 'hover:bg-accent/50'
                      )}
                    >
                      {/* A tick box, not a colour fill: selection that reads
                          only as a tint is invisible to anyone who cannot
                          separate the two, and to assistive technology. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border'
                        )}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {member.displayName}
                        </span>
                        {/* Two of this league's accounts share a display name;
                            the address is what tells them apart. */}
                        <span className="block truncate text-xs text-muted-foreground">
                          {member.email}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}

              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nobody matches &ldquo;{query.trim()}&rdquo;.
                </li>
              )}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleSave} disabled={!dirty || save.isPending}>
                {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save roles
              </Button>

              <Badge variant={current.length > 0 ? 'info' : 'secondary'}>
                {current.length === 0
                  ? 'Nobody selected'
                  : `${current.length} commissioner${current.length === 1 ? '' : 's'}`}
              </Badge>

              {saved && !dirty && (
                <span className="text-sm text-success">Saved.</span>
              )}
            </div>

            {current.length === 0 && (
              <p className="text-xs text-muted-foreground">
                With nobody selected, only you can open the TD Parlay tab.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default LeagueRolesManager;
