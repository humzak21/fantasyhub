/**
 * "You haven't set a display name" — a modal that cannot be clicked away.
 *
 * A display name is not cosmetic here: it is the only link between an
 * authenticated account and a league team. `isUserATeamOwner` resolves
 * `user_metadata.full_name || user_metadata.name` and compares it to the active
 * season's owner names, and that match is what unlocks the History tab and
 * unmasks every team and owner name in the app. An account with no name is
 * logged in but permanently treated as a stranger, and the only hint of that
 * was a 'No Display Name Set' string in the mobile nav.
 *
 * So this blocks. It mirrors `ExpandedWeekModal`'s structure — portal, backdrop
 * child, `modal-content` panel, scroll lock — but deliberately omits that
 * component's two dismiss paths: there is no Escape listener and no
 * click-outside handler. Clicks land on the backdrop and do nothing. Only the
 * buttons close it.
 *
 * "Remind me later" is component state and nothing else. Not localStorage, not
 * metadata: the prompt is supposed to come back on the next load, every time,
 * until a name exists.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle, UserCircle } from 'lucide-react';

import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useActiveSeason } from '../../../hooks/queries/index.js';
import { hasDisplayName, matchesTeamOwner, validateFullName } from '../../utils/displayNameUtils.js';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';

/** Focusable descendants, for the Tab trap. */
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export default function DisplayNamePrompt() {
  const { user, isAuthenticated, teamOwnerNames } = useViewer();
  const { updateProfile } = useAuth();
  const { data: activeSeason } = useActiveSeason();

  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState('prompt');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedName, setSavedName] = useState('');

  const panelRef = useRef(null);
  const inputRef = useRef(null);

  // `saved` outlives the gate: a successful save fires USER_UPDATED, AuthContext
  // swaps in a user that now has a name, and `needsName` goes false — but the
  // mismatch warning still has to be read before the modal goes away.
  const needsName = isAuthenticated && !hasDisplayName(user);
  const open = !dismissed && (needsName || phase === 'saved');

  // Nothing behind this scrolls while it is up.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  // Same autofocus idiom as the other modals: let the panel paint first.
  useEffect(() => {
    if (phase !== 'form') return;
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [phase]);

  // Tab cannot escape to the page underneath. Escape is not handled at all —
  // that is the point.
  useEffect(() => {
    if (!open) return;
    const trapTab = (event) => {
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!panelRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapTab, true);
    return () => document.removeEventListener('keydown', trapTab, true);
  }, [open]);

  if (!open) return null;

  const handleChange = (next) => {
    setValue(next);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const message = validateFullName(value);
    if (message) {
      setError(message);
      inputRef.current?.focus();
      return;
    }

    const name = value.trim();
    setSaving(true);
    setError(null);

    // Both keys, the way signup and /settings write them — readers disagree
    // about which one they check first.
    const result = await updateProfile({ full_name: name, name });
    setSaving(false);

    if (!result?.success) {
      setError(result?.error || 'Could not save your name. Please try again.');
      return;
    }

    setSavedName(name);
    // A name that matches an owner needs no confirmation screen; one that
    // matches nobody does, because it means the user probably mistyped it.
    if (teamOwnerNames.length > 0 && !matchesTeamOwner(name, teamOwnerNames)) {
      setPhase('saved');
    } else {
      setDismissed(true);
    }
  };

  const seasonLabel = activeSeason?.year ? `the ${activeSeason.year} season` : 'this league';

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
      data-testid="display-name-prompt"
    >
      {/* No onClick. Clicking the backdrop is not a way out. */}
      <div className="absolute inset-0 modal-backdrop entering" data-testid="display-name-backdrop" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="display-name-prompt-title"
        className="relative modal-content entering rounded-lg w-full max-w-md shadow-modal overflow-hidden"
      >
        <div className="flex items-start gap-3 p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="rounded-full bg-primary/10 p-2 shrink-0">
            {phase === 'saved' ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <UserCircle className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <h2 id="display-name-prompt-title" className="text-base font-semibold leading-tight">
              {phase === 'saved' ? 'Name saved' : 'Set your display name'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {phase === 'saved'
                ? `You're now showing up as "${savedName}".`
                : "Your account doesn't have a display name yet. The league uses it to match you to your team."}
            </p>
          </div>
        </div>

        {phase === 'prompt' && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Until you set it, your team stays hidden from you and you&apos;ll show up as an
              unnamed account everywhere in the league.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" className="sm:flex-1" onClick={() => setDismissed(true)}>
                Remind me later
              </Button>
              <Button className="sm:flex-1" onClick={() => setPhase('form')}>
                Set my name
              </Button>
            </div>
          </div>
        )}

        {phase === 'form' && (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display-name-input">
                Full name <span className="text-muted-foreground font-normal">(First Last)</span>
              </Label>
              <Input
                ref={inputRef}
                id="display-name-input"
                type="text"
                autoComplete="name"
                placeholder="e.g. John Smith"
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                disabled={saving}
                aria-invalid={Boolean(error)}
                aria-describedby="display-name-rules"
              />
              <ul
                id="display-name-rules"
                className="text-xs text-muted-foreground space-y-1 list-disc pl-4 pt-1"
              >
                <li>
                  Write it exactly as <span className="font-medium">First Name Last Name</span> —
                  capitalisation and spelling both matter.
                </li>
                <li>No commas.</li>
                <li>Your real full name, not a nickname.</li>
                <li>No middle name or initial.</li>
              </ul>
            </div>

            {error && (
              <Alert className="border-red-200 bg-red-50 dark:bg-red-950/40">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="sm:flex-1"
                disabled={saving}
                onClick={() => setDismissed(true)}
              >
                Remind me later
              </Button>
              <Button type="submit" className="sm:flex-1" disabled={saving}>
                {saving ? 'Saving…' : 'Confirm'}
              </Button>
            </div>
          </form>
        )}

        {phase === 'saved' && (
          <div className="p-5 space-y-4">
            <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/40">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-900 dark:text-yellow-200">
                It doesn&apos;t match any team owner in {seasonLabel}. If you own a team, reopen this
                from Settings and check the spelling and capitalisation — otherwise your team will
                stay hidden from you.
              </AlertDescription>
            </Alert>
            <Button className="w-full" onClick={() => setDismissed(true)}>
              Got it
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
