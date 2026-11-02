import { useState } from 'react';
import { LogOut } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../ui/alert-dialog';
import { Button, buttonVariants } from '../ui/button';
import { useAuth } from '../../contexts/AuthContext.jsx';

/** The one question asked before signing out, wherever it is asked from. */
export function LogOutDialog({ open, onOpenChange, onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
          <AlertDialogDescription>
            You will need to sign in again to make your picks and see the members-only tabs.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={onConfirm}>
            Log out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Log out, confirmed first. A member's own profile is where this lives. */
export function LogOutButton({ variant = 'outline', size = 'sm', className }) {
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setConfirming(true)}>
        <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Log out
      </Button>
      <LogOutDialog open={confirming} onOpenChange={setConfirming} onConfirm={() => signOut()} />
    </>
  );
}

export default LogOutButton;
