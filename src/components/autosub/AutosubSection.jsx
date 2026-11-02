import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, Plus, Repeat2, X } from 'lucide-react';

import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '../../lib/utils';
import {
  useAutosubAccess,
  useAutosubMutations,
  useCurrentLineups,
  useMyAutosubs,
  useNflOpponentMap
} from '../../../hooks/queries/index.js';
import { atWeeklyLimit, autosubState, benchOptions, coverableStarters } from './autosubChoices.js';

const playerLabel = (row) => `${row.player?.name ?? 'Unknown'} (${row.rosterSlot === 'BE' ? row.position : row.rosterSlot})`;

const AutosubDialog = ({ open, onOpenChange, rows, autosubs, opponents, onSave, saving }) => {
  const [starterId, setStarterId] = useState('');
  const [benchId, setBenchId] = useState('');
  const [error, setError] = useState(null);

  const now = new Date();
  const starters = coverableStarters(rows, autosubs, opponents, now);
  const starter = starters.find((row) => row.playerId === starterId) ?? null;
  const benches = benchOptions(rows, starter, autosubs, opponents, now);
  const bench = benches.find((row) => row.playerId === benchId) ?? null;

  const choose = (id) => {
    setStarterId(id);
    setBenchId('');
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    try {
      await onSave({ starterPlayerId: starter.playerId, benchPlayerId: bench.playerId });
      setStarterId('');
      setBenchId('');
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || 'Could not set that autosub.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an autosub</DialogTitle>
          <DialogDescription>
            If your starter is ruled out this week, your bench player goes in. The commissioner and
            vice commissioner are told, and they make the change if ESPN has already locked it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="autosub-starter">If this starter is out</Label>
            <Select value={starterId} onValueChange={choose}>
              <SelectTrigger id="autosub-starter">
                <SelectValue placeholder="Choose a starter" />
              </SelectTrigger>
              <SelectContent>
                {starters.map((row) => (
                  <SelectItem key={row.playerId} value={row.playerId}>
                    {playerLabel(row)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="autosub-bench">Start this bench player</Label>
            <Select value={benchId} onValueChange={setBenchId} disabled={!starter || benches.length === 0}>
              <SelectTrigger id="autosub-bench">
                <SelectValue placeholder="Choose a bench player" />
              </SelectTrigger>
              <SelectContent>
                {benches.map((row) => (
                  <SelectItem key={row.playerId} value={row.playerId}>
                    {playerLabel(row)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {starter && benches.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nobody on your bench can play {starter.rosterSlot} and still has a game to come.
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!starter || !bench || saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Set autosub
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AutosubRow = ({ autosub, onRemove, removing }) => {
  const state = autosubState(autosub);
  const starter = autosub.starter?.name ?? 'Unknown';
  const bench = autosub.bench?.name ?? 'Unknown';

  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate">{starter}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="replaced by" />
        <span className="truncate">{bench}</span>
      </span>
      <Badge variant={state.variant} className="shrink-0">
        {state.label}
      </Badge>
      {autosub.status === 'armed' && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={`Remove the autosub for ${starter}`}
          onClick={() => onRemove(autosub.id)}
          disabled={removing}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
    </li>
  );
};

const AutosubPanel = ({ access, framed, className }) => {
  const { seasonId, teamId, week, nflSeasonYear, weeklyLimit } = access;
  const { data: autosubs = [], isLoading, error: loadError } = useMyAutosubs(seasonId, week);
  const { data: lineups } = useCurrentLineups(seasonId, week);
  const { data: opponents = {} } = useNflOpponentMap(nflSeasonYear, week);
  const { setAutosub, removeAutosub } = useAutosubMutations(seasonId, week);
  const [adding, setAdding] = useState(false);
  const [removeError, setRemoveError] = useState(null);

  const rows = useMemo(() => lineups?.[teamId] ?? [], [lineups, teamId]);
  const canAdd = !atWeeklyLimit(autosubs, weeklyLimit) && coverableStarters(rows, autosubs, opponents).length > 0;

  // Nothing set and nothing left to set: Sunday night, a section with no use.
  if (isLoading || loadError || (autosubs.length === 0 && !canAdd)) return null;

  const handleRemove = async (id) => {
    setRemoveError(null);
    try {
      await removeAutosub.mutateAsync(id);
    } catch (err) {
      setRemoveError(err?.message || 'Could not remove that autosub.');
    }
  };

  const content = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h5 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Repeat2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Autosubs
          {weeklyLimit != null && autosubs.length > 0 && (
            <span className="tabular text-xs font-normal text-muted-foreground">
              {autosubs.length} of {weeklyLimit}
            </span>
          )}
        </h5>
        {canAdd && (
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </Button>
        )}
      </div>

      {autosubs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Worried about a starter? Name who takes over if they are ruled out this week.
        </p>
      ) : (
        <ul className="space-y-1">
          {autosubs.map((autosub) => (
            <AutosubRow
              key={autosub.id}
              autosub={autosub}
              onRemove={handleRemove}
              removing={removeAutosub.isPending}
            />
          ))}
        </ul>
      )}

      {removeError && <p className="text-xs text-destructive">{removeError}</p>}

      {adding && (
        <AutosubDialog
          open={adding}
          onOpenChange={setAdding}
          rows={rows}
          autosubs={autosubs}
          opponents={opponents}
          saving={setAutosub.isPending}
          onSave={(picks) => setAutosub.mutateAsync({ ...picks, teamId })}
        />
      )}
    </div>
  );

  if (framed) {
    return (
      <Card className={className}>
        <CardContent className="p-4">{content}</CardContent>
      </Card>
    );
  }

  return <div className={cn('border-t border-border/60 pt-3', className)}>{content}</div>;
};

/**
 * A member's autosubs for this week, under their own roster.
 *
 * Every surface that shows a roster renders this with that roster's team and
 * nothing else, so the rule lives here once: it draws nothing unless autosubs
 * are on and this is the viewer's own team this season, which is what hides it
 * from every other member and from anyone signed out. The queries sit in
 * `AutosubPanel`, so a viewer who gets nothing also fetches nothing.
 *
 * `framed` gives it a card of its own, for a page that has no roster card to
 * sit inside.
 */
export function AutosubSection({ teamId, framed = false, className }) {
  const access = useAutosubAccess();

  if (!access.enabled || !access.week || !teamId || access.teamId !== teamId) return null;

  return <AutosubPanel access={access} framed={framed} className={className} />;
}

export default AutosubSection;
