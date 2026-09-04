/**
 * Where a password-reset link lands, and the page it was missing.
 *
 * Supabase's recovery link signs the browser in the moment it is clicked —
 * the fragment carries a full session and `detectSessionInUrl` consumes it.
 * Until 2026-09-04 that was all that happened: this path had no route, the
 * catch-all bounced to the default tab, and the member was signed in with the
 * password they had just said they forgot. Five reset links were used that
 * way and not one was followed by a password change. It looked, from the
 * outside, like "Forgot Password" skips the login.
 *
 * So this page has one job: get a new password saved before the member goes
 * anywhere else. App.jsx renders it in place of the tabs while
 * `passwordRecoveryPending` is true, and the `/reset-password` route renders
 * it on a reload. The only other way off it is to sign out, which drops the
 * session the link created — staying signed in with the old password is the
 * state the page exists to end.
 *
 * Three faces:
 *   - signed in           the form. Saving also signs out every other
 *                         session (see `updatePassword`), then goes home.
 *   - link failed         `authLinkError` from the fragment: expired, reused.
 *                         "Back to the league" takes them to the login
 *                         popover, which opens with the same message.
 *   - signed out, no error a stale bookmark. Nothing to reset.
 */

import { CheckCircle, KeyRound, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { useAuth } from '../../contexts/AuthContext.jsx';
import PageContainer from '../layout/PageContainer.jsx';
import ChangePasswordForm from './ChangePasswordForm.jsx';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

export default function ResetPasswordPage() {
  const { user, authLinkError, clearAuthLinkError, updatePassword, abandonPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(null);
  const [leaving, setLeaving] = useState(false);

  const goHome = () => navigate('/', { replace: true });

  const handleSave = async (password) => {
    const result = await updatePassword(password);
    if (result.success) setSaved(result);
    return result;
  };

  const handleSignOut = async () => {
    setLeaving(true);
    await abandonPasswordRecovery();
    goHome();
  };

  let body;
  if (saved) {
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-success">
            <CheckCircle className="h-5 w-5" />
            Password updated
          </CardTitle>
          <CardDescription>
            {saved.othersSignedOut
              ? 'You are signed in here. Every other device has been signed out.'
              : 'You are signed in here. Other devices could not be signed out just now; sign out of them yourself if you need to.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={goHome} className="w-full sm:w-auto">
            Go to the league
          </Button>
        </CardContent>
      </Card>
    );
  } else if (user) {
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Choose a new password
          </CardTitle>
          <CardDescription>
            The link signed you in as <span className="text-foreground">{user.email}</span>.
            Set a new password to finish. Saving it signs out every other device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm
            onSubmit={handleSave}
            submitLabel="Save new password"
            footer={
              <p className="text-xs text-muted-foreground">
                Changed your mind?{' '}
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={leaving}
                  className="underline underline-offset-2 hover:text-foreground disabled:opacity-60"
                >
                  Sign out instead
                </button>
                . Your old password stays as it was.
              </p>
            }
          />
        </CardContent>
      </Card>
    );
  } else {
    const failed = Boolean(authLinkError);
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            {failed ? 'That reset link did not work' : 'Nothing to reset'}
          </CardTitle>
          <CardDescription>
            {failed
              ? 'Reset links work once and expire after an hour. Request a new one from the login menu.'
              : 'You are not signed in from a reset link. Use "Forgot Password?" in the login menu to get one.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {failed && (
            <Alert role="status">
              <AlertTitle>What the link said</AlertTitle>
              <AlertDescription>{authLinkError}</AlertDescription>
            </Alert>
          )}
          {/* The login popover opens itself on `authLinkError`, so the error
              is left in place here for it to show; it clears on the first
              keystroke there. */}
          <Button onClick={goHome} className="w-full sm:w-auto">
            Back to the league
          </Button>
          {failed && (
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => {
                clearAuthLinkError?.();
                goHome();
              }}
            >
              Dismiss
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <PageContainer width="wide" className="max-w-lg py-10">
        {body}
      </PageContainer>
    </div>
  );
}
