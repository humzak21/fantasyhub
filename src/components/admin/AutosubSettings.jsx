import { useState } from 'react';
import { AlertCircle, Repeat2 } from 'lucide-react';

import { Alert, AlertDescription } from '../ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { useActiveSeason, useLeagueMutations } from '../../../hooks/queries/index.js';
import { AUTOSUB_LIMIT_MAX, AUTOSUB_LIMIT_MIN } from '../../../services/autosubPlanner.js';

const LIMITS = Array.from(
  { length: AUTOSUB_LIMIT_MAX - AUTOSUB_LIMIT_MIN + 1 },
  (_, index) => String(AUTOSUB_LIMIT_MIN + index)
);

const Setting = ({ id, label, description, children }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    {children}
  </div>
);

/**
 * The active season's autosub settings.
 *
 * The `isAdmin` gate on the settings page is the affordance; `seasons` is
 * `is_admin()`-write, and `set_autosub()` reads the switch and the limit itself.
 */
const AutosubSettings = () => {
  const { data: season, isLoading } = useActiveSeason();
  const { setAutosubSettings } = useLeagueMutations(season?.id ?? null);
  const [error, setError] = useState(null);

  const save = async (settings) => {
    setError(null);
    try {
      await setAutosubSettings.mutateAsync({ seasonId: season.id, ...settings });
    } catch (err) {
      setError(err?.message || 'Could not save that setting.');
    }
  };

  const enabled = season?.autosubsEnabled === true;
  const busy = isLoading || !season || setAutosubSettings.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat2 className="h-5 w-5" />
          Autosubs
        </CardTitle>
        <CardDescription>
          A member names a bench player to take over from a starter who is ruled out. The commissioner
          and vice commissioner are told when one fires, or the admins if nobody holds those roles.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Setting
          id="autosubs-enabled"
          label="Let members set autosubs"
          description="Off hides autosubs on every roster and stops any already set from firing. They pick up again if you turn this back on."
        >
          <Switch
            id="autosubs-enabled"
            checked={enabled}
            disabled={busy}
            onCheckedChange={(next) => save({ autosubsEnabled: next })}
          />
        </Setting>

        <Setting
          id="autosub-weekly-limit"
          label="Autosubs per team each week"
          description="Takes effect on the next one set. Lowering it leaves any already set in place, and removing one frees up its place."
        >
          <Select
            value={String(season?.autosubWeeklyLimit ?? AUTOSUB_LIMIT_MAX)}
            disabled={busy || !enabled}
            onValueChange={(next) => save({ autosubWeeklyLimit: Number(next) })}
          >
            <SelectTrigger id="autosub-weekly-limit" className="w-20 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMITS.map((limit) => (
                <SelectItem key={limit} value={limit}>
                  {limit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Setting>

        <Setting
          id="autosub-espn-writes"
          label="Make the swap on ESPN"
          description="Off, every autosub that fires goes to the commissioners to make by hand. On, the swap is made on ESPN when neither player's game has started. This needs the ESPN_S2 secret to belong to a league manager."
        >
          <Switch
            id="autosub-espn-writes"
            checked={season?.autosubEspnWrites === true}
            disabled={busy || !enabled}
            onCheckedChange={(next) => save({ autosubEspnWrites: next })}
          />
        </Setting>
      </CardContent>
    </Card>
  );
};

export default AutosubSettings;
