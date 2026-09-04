/**
 * New password + confirmation, the one form both password paths share.
 *
 * <ResetPasswordPage> mounts it for a member who arrived by reset link and
 * has no password they remember; Settings → Profile mounts it for a member
 * who does. The two used to differ in exactly one way — the reset page did
 * not exist — so there is one form, and the caller supplies the verb.
 *
 * Validation is `validateNewPassword` in utils/passwordReset.js — the
 * client's half only; Supabase's own minimum applies on top and its error is
 * shown as-is.
 */

import { useRef, useState } from 'react';
import { AlertCircle, Lock } from 'lucide-react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { cn } from '../../lib/utils';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../../utils/passwordReset.js';

/**
 * @param {object} props
 * @param {(password: string) => Promise<{ success: boolean, error?: string }>} props.onSubmit
 * @param {string} [props.submitLabel]
 * @param {string} [props.busyLabel]
 * @param {string} [props.className]
 * @param {import('react').ReactNode} [props.footer] rendered beneath the submit button
 */
export default function ChangePasswordForm({
  onSubmit,
  submitLabel = 'Save password',
  busyLabel = 'Saving…',
  className,
  footer = null,
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;

    const message = validateNewPassword(password, confirm);
    if (message) {
      setError(message);
      passwordRef.current?.focus();
      return;
    }

    setBusy(true);
    setError(null);
    const result = await onSubmit(password);
    setBusy(false);

    if (!result?.success) {
      setError(result?.error || 'Could not save the password. Please try again.');
      return;
    }

    setPassword('');
    setConfirm('');
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)} noValidate>
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            ref={passwordRef}
            id="new-password"
            type="password"
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            className="pl-10"
            disabled={busy}
            aria-invalid={Boolean(error)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (error) setError(null);
            }}
            className="pl-10"
            disabled={busy}
            required
          />
        </div>
      </div>

      {error && (
        <Alert className="border-destructive/20 bg-destructive/10" role="alert">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </Button>

      {footer}
    </form>
  );
}
