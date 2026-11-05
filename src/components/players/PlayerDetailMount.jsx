import { lazy, Suspense, useState } from 'react';

import { usePlayerDetail } from './PlayerDetailContext.jsx';

// Lazy so the page's code, and the charts inside it, stay out of every load
// that never opens a player.
const PlayerDetail = lazy(() => import('./PlayerDetail.jsx'));

/**
 * Mounts the player page once a player has been opened in this session, and
 * not before. Rendering the lazy component unconditionally would request its
 * chunk on first load, for every viewer, whether or not anybody opens a
 * player; gating it on `isOpen` alone would unmount it the moment the param
 * goes and cut off the dialog's exit animation. So the latch stays set after
 * the first close.
 */
export default function PlayerDetailMount() {
  const { isOpen } = usePlayerDetail();
  const [hasOpened, setHasOpened] = useState(isOpen);

  // Set during render rather than in an effect, so the first open does not
  // wait a frame. React allows this for state owned by the component itself.
  if (isOpen && !hasOpened) setHasOpened(true);

  if (!hasOpened) return null;
  return (
    <Suspense fallback={null}>
      <PlayerDetail />
    </Suspense>
  );
}
