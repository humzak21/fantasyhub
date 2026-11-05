import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, UserX, X } from 'lucide-react';

import { usePlayerCareers, usePlayerProfile } from '../../../hooks/queries/index.js';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useIsMobile } from '../../hooks/use-mobile.jsx';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button.jsx';
import { EmptyState } from '../ui/empty-state.jsx';
import { Skeleton } from '../ui/skeleton.jsx';
import PlayerDetailBody from './PlayerDetailBody.jsx';
import { usePlayerDetail } from './PlayerDetailContext.jsx';

/**
 * A player's page: mounted once at the shell root, opened by `?player=<id>`.
 *
 * One Radix dialog, two presentations, chosen by `useIsMobile()` because they
 * are structurally different (the sanctioned use of the hook): from `md` a
 * wide centred card over a dimmed page; below it a full-screen page that
 * slides in from the right with a back arrow. Both get Radix's focus trap,
 * Escape and scroll lock, and Radix keeps the content mounted until the exit
 * animation ends.
 *
 * It portals to `<body>`, a sibling of the header, whose `backdrop-blur`
 * would otherwise be the containing block for anything `fixed` inside it.
 *
 * The shown id outlives the param by one close: the URL loses `?player` the
 * moment Back is pressed, and the page should slide out showing the player,
 * not a skeleton.
 */

const SURFACE = 'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]';

const CARD = cn(
  'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
  'grid h-[min(92dvh,980px)] w-[calc(100%-2rem)] max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden',
  'rounded-lg border border-border bg-background p-0 shadow-lg outline-none',
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2',
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
);

const PAGE = cn(
  'fixed inset-0 z-50 grid h-dvh w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background pt-safe outline-none',
  '[--ff-enter-duration:320ms] [--ff-exit-duration:240ms]',
  'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full',
  'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full'
);

function PlayerDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading player" className="space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-7 w-48 max-w-full" />
          <Skeleton className="h-4 w-32 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 @md:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

function PlayerDetailError({ onRetry }) {
  return (
    <div className="p-4 sm:p-6">
      <div className={cn('rounded-lg border border-border bg-card p-6 text-center', SURFACE)}>
        <p className="text-base font-semibold text-foreground">Couldn&apos;t load this player</p>
        <p className="mt-1.5 text-sm text-muted-foreground">Check your connection and try again.</p>
        <Button className="mt-4" variant="outline" onClick={() => onRetry?.()}>
          Retry
        </Button>
      </div>
    </div>
  );
}

export default function PlayerDetail() {
  const { playerId, isOpen, close } = usePlayerDetail();
  const isMobile = useIsMobile();
  const viewer = useViewer();

  const [shownId, setShownId] = useState(playerId);
  if (playerId && playerId !== shownId) setShownId(playerId);

  const profileQuery = usePlayerProfile(shownId, { enabled: isOpen && Boolean(shownId) });
  const rankingQuery = usePlayerCareers({ enabled: isOpen });

  const profile = profileQuery?.data ?? null;
  const isLoading = !profile && (profileQuery?.isPending || profileQuery?.isLoading) && !profileQuery?.isError;
  const name = profile?.player?.name ?? 'Player';

  let body;
  if (profile) {
    body = (
      <PlayerDetailBody
        profile={profile}
        ranking={rankingQuery?.data ?? null}
        rankingQuery={rankingQuery}
        viewer={viewer}
        onClose={close}
      />
    );
  } else if (profileQuery?.isError) {
    body = <PlayerDetailError onRetry={profileQuery.refetch} />;
  } else if (isLoading) {
    body = <PlayerDetailSkeleton />;
  } else {
    body = (
      <EmptyState
        icon={UserX}
        title="Player not found"
        description="This league has no record of that player."
      />
    );
  }

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        {!isMobile && (
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0'
            )}
          />
        )}
        <DialogPrimitive.Content className={isMobile ? PAGE : CARD}>
          <header className="sticky top-0 z-10 flex min-w-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-2 sm:px-4 md:py-3">
            {isMobile && (
              <Button variant="ghost" size="icon" aria-label="Back" onClick={close} className="shrink-0">
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
            )}
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-base font-semibold text-foreground md:pl-2">
              {name}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {profile ? `${name}'s league history, game log and standing` : 'A player in this league'}
            </DialogPrimitive.Description>
            {!isMobile && (
              <Button variant="ghost" size="icon" aria-label="Close" onClick={close} className="shrink-0">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </header>
          <div className="@container min-h-0 overflow-y-auto overscroll-contain pb-safe">
            {body}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
