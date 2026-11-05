import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { usePlayerByEspnId } from '../../../hooks/queries/index.js';
import { playerIdFrom, withPlayer, withoutPlayer } from './playerDetailLink.js';

/**
 * Which player's page is open. The URL is the state: `?player=<players.id>`,
 * so the phone's back button closes the page, a refresh keeps it open and a
 * link to a player is shareable. One provider in the shell, for every viewer.
 *
 * `open(ref)` takes `{ playerId }` or `{ espnPlayerId }`. Most surfaces know
 * the league's id; a few (a trade line, a chat row) know only ESPN's, which is
 * looked up first and written to the URL once found. A lookup that finds
 * nobody drops quietly: the name stays where it was, nothing opens.
 *
 * Opening pushes a history entry and keeps every other param. Closing removes
 * the param.
 *
 * Outside the provider — a test that does not mount it — `usePlayerDetail()`
 * returns `available: false` and no-ops, the `LeagueChatContext` pattern, so a
 * `PlayerLink` can render anywhere.
 */

const PlayerDetailContext = createContext(null);

const UNAVAILABLE = Object.freeze({
  available: false,
  playerId: null,
  isOpen: false,
  open: () => {},
  close: () => {}
});

export function PlayerDetailProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const playerId = playerIdFrom(searchParams);
  const [pendingEspnId, setPendingEspnId] = useState(null);

  const lookup = usePlayerByEspnId(pendingEspnId, { enabled: pendingEspnId != null });
  const found = lookup?.data;
  const lookupDone = Boolean(lookup?.isSuccess || lookup?.isError);

  useEffect(() => {
    if (pendingEspnId == null || !lookupDone) return;
    // A lookup for a different id (a cached answer from a previous open)
    // is not this one's answer.
    if (found && found.espnPlayerId != null && String(found.espnPlayerId) !== String(pendingEspnId)) return;
    setPendingEspnId(null);
    if (found?.id) setSearchParams((prev) => withPlayer(prev, found.id));
  }, [pendingEspnId, lookupDone, found, setSearchParams]);

  const open = useCallback((ref = {}) => {
    if (ref.playerId) {
      setPendingEspnId(null);
      setSearchParams((prev) => (
        playerIdFrom(prev) === String(ref.playerId) ? prev : withPlayer(prev, ref.playerId)
      ));
    } else if (ref.espnPlayerId != null && ref.espnPlayerId !== '') {
      setPendingEspnId(ref.espnPlayerId);
    }
  }, [setSearchParams]);

  const close = useCallback(() => {
    setPendingEspnId(null);
    setSearchParams((prev) => (playerIdFrom(prev) ? withoutPlayer(prev) : prev));
  }, [setSearchParams]);

  const value = useMemo(
    () => ({ available: true, playerId, isOpen: playerId != null, open, close }),
    [playerId, open, close]
  );

  return <PlayerDetailContext.Provider value={value}>{children}</PlayerDetailContext.Provider>;
}

export function usePlayerDetail() {
  return useContext(PlayerDetailContext) ?? UNAVAILABLE;
}
