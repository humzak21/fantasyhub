import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Check, Gavel, Loader2, AlertCircle, Search, ShieldHalf } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';
import { useLeagueMembers, useRoleHolders, useSetRoleHolders } from '../../../hooks/queries/index.js';
import { COMMISSIONER, PARLAY_COMMISSIONER, VICE_COMMISSIONER } from '../../../services/db/users.js';

const AUTOSUB_ROLE_NOTE = 'With nobody in either commissioner role, autosub alerts go to the admins.';

/** The roles an admin grants here, in tab order. */
const ROLES = [
  {
    id: COMMISSIONER,
    tab: 'Commissioner',
    title: 'Commissioner',
    icon: Gavel,
    description:
      'Told when a member\u2019s autosub fires, by push and in Alerts, so they can make the change on ' +
      'ESPN when it needs a person. The role changes nothing else.',
    emptyNote: AUTOSUB_ROLE_NOTE
  },
  {
    id: VICE_COMMISSIONER,
    tab: 'Vice commissioner',
    title: 'Vice commissioner',
    icon: ShieldHalf,
    description:
      'Told about every autosub alongside the commissioner, so one of them can act if the other is ' +
      'away. The role changes nothing else.',
    emptyNote: AUTOSUB_ROLE_NOTE
  },
  {
    id: PARLAY_COMMISSIONER,
    tab: 'Parlay',
    title: 'Parlay commissioners',
    icon: Crosshair,
    description:
      'Commissioners see every member\u2019s TD parlay pick, in every week, and get the TD Parlay tab. ' +
      'They cannot change picks or anything else \u2014 the role is read-only.',
    emptyNote: 'With nobody selected, only you can open the TD Parlay tab.'
  }
];

/**
 * Who holds one role.
 *
 * Roles exist because admin (`is_admin()`, a `league_admins` row) is every
 * power at once, and these jobs need a person without the league's write
 * paths. They are not one-time decisions — they change hands, and more than one
 * person can hold each — so they belong on a settings page rather than in a
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
const RoleCard = ({ role }) => {
  const { data: members = [], isLoading: membersLoading, error: membersError } =
    useLeagueMembers();
  const { data: holders = [], isLoading: rolesLoading } = useRoleHolders(role.id);
  const save = useSetRoleHolders(role.id);

  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // `selected` starts as null — "not loaded yet" — rather than as an empty
  // array, which is indistinguishable from "the admin cleared the list" and
  // would let a Save land before the current grants had arrived.
  const heldKey = useMemo(
    () => holders.map((row) => row.userId).sort().join(','),
    [holders]
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
  const Icon = role.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {role.title}
        </CardTitle>
        <CardDescription>{role.description}</CardDescription>
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
                {current.length === 0 ? 'Nobody selected' : `${current.length} selected`}
              </Badge>

              {saved && !dirty && (
                <span className="text-sm text-success">Saved.</span>
              )}
            </div>

            {current.length === 0 && (
              <p className="text-xs text-muted-foreground">{role.emptyNote}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

/** Every role, one at a time: each list is the whole league, so three would be a long page. */
const LeagueRolesManager = () => {
  const [roleId, setRoleId] = useState(ROLES[0].id);
  const role = ROLES.find((candidate) => candidate.id === roleId);

  return (
    <div className="space-y-4">
      <Tabs value={roleId} onValueChange={setRoleId}>
        <TabsList>
          {ROLES.map((candidate) => (
            <TabsTrigger key={candidate.id} value={candidate.id}>
              {candidate.tab}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* Keyed, so an unsaved selection cannot follow the admin to another role. */}
      <RoleCard key={role.id} role={role} />
    </div>
  );
};

export default LeagueRolesManager;
