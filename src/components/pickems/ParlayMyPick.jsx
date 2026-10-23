import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription } from '../ui/alert';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  useMyParlayPick,
  useNflOpponentMap,
  useSubmitParlayPick
} from '../../../hooks/queries/index.js';
import ParlayCurrentPick from './ParlayCurrentPick.jsx';
import PlayerPicker from './PlayerPicker.jsx';
import { usePickDraft } from './pickDraft.js';

/**
 * The viewer's own TD parlay pick: the pick as stored, the picker to make or
 * change it, or the sentence that says why neither is offered.
 *
 * Lifted out of `ParlayPickSection` so the home page's pick'ems widget renders
 * this, not a second version of it. Both surfaces read the same `myPick`
 * entry, write through the same mutation and keep the same draft, so a pick
 * made on either is on the other.
 *
 * `status` is the pick'em window (`pickEmWindowState`) — passed down, never
 * recomputed, so the parlay's window is the pick'ems' window by construction.
 * The deadline itself is `submit_td_parlay_pick`'s.
 *
 * @param {object} props
 * @param {object} props.pickEmWeek
 * @param {number|null} props.seasonYear - the NFL season, for opponent chips
 * @param {object} props.status - from `pickEmWindowState`
 * @param {number} props.weekNumber
 * @param {object} [props.liveStatus] - `useParlayLive`'s per-pick map
 * @param {string} [props.idPrefix] - keeps the picker's ids unique per page
 */
export function ParlayMyPick({ pickEmWeek, seasonYear = null, status, weekNumber, liveStatus, idPrefix }) {
  // `isApproved` gates the form; `isAuthenticated` only chooses the copy —
  // a signed-in member the admin has not approved yet is told so, rather
  // than being asked to sign in again.
  const { user, isAuthenticated, isApproved } = useViewer();

  const isOpen = status?.status === 'open';
  const isRevealed = status?.status === 'closed' || status?.status === 'completed';

  const { data: myPick, isLoading: myPickLoading } = useMyParlayPick(pickEmWeek?.id);

  // Who each NFL team plays this week, for the "vs BUF" / "@ KC" / "BYE" chips
  // on the current pick and on every autocomplete row. One fetch for the whole
  // season, shared by both — see `hooks/queries/useNflSchedule.js`.
  const { data: opponents = {} } = useNflOpponentMap(seasonYear, weekNumber);

  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState(null);

  const submit = useSubmitParlayPick(pickEmWeek?.seasonId ?? null);

  // A player typed or chosen but not locked in, kept per member per week —
  // the same draft whichever page wrote it. See `pickDraft.js`.
  const { draft, setParlay, clear: clearDraft } = usePickDraft(pickEmWeek?.id, user?.id);

  // A draft that differs from the stored pick reopens the picker, once per
  // week, so the unsaved choice is on screen rather than hidden behind the
  // committed one.
  const reopened = useRef(null);
  useEffect(() => {
    if (!pickEmWeek?.id || reopened.current === pickEmWeek.id || myPickLoading) return;
    reopened.current = pickEmWeek.id;
    if (isOpen && myPick && draft.parlay && draft.parlay.playerName !== myPick.playerNameRaw) {
      setIsEditing(true);
    }
  }, [pickEmWeek?.id, myPickLoading, isOpen, myPick, draft.parlay]);

  if (!pickEmWeek) return null;

  const handleSubmit = async ({ playerId, playerName }) => {
    setError(null);
    try {
      await submit.mutateAsync({ pickEmWeekId: pickEmWeek.id, playerId, playerName });
      clearDraft('parlay');
      setIsEditing(false);
    } catch (err) {
      setError(err?.message || 'Could not save your pick.');
    }
  };

  const showPicker = isOpen && isApproved && (!myPick || isEditing);

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isApproved && (
        <p className="text-sm text-muted-foreground">
          {isAuthenticated
            ? 'Your account is awaiting approval before you can enter the parlay.'
            : isOpen
              ? 'Sign in to enter this week’s parlay.'
              : 'Sign in to see your parlay picks.'}
        </p>
      )}

      {isApproved && !myPickLoading && myPick && !isEditing && (
        <ParlayCurrentPick
          pick={myPick}
          opponent={opponents[myPick.player?.proTeamId]}
          canEdit={isOpen}
          onEdit={() => setIsEditing(true)}
          showGrade={isRevealed}
          live={liveStatus?.[myPick.id]}
        />
      )}

      {isApproved && !isOpen && !myPickLoading && !myPick && (
        <p className="text-sm text-muted-foreground">
          {status?.status === 'upcoming'
            ? 'The parlay opens with pick’ems.'
            : 'You did not enter a player this week.'}
        </p>
      )}

      {showPicker && (
        <PlayerPicker
          key={myPick?.id ?? 'new'}
          idPrefix={idPrefix}
          initialQuery={draft.parlay?.playerName ?? (isEditing ? myPick?.playerNameRaw ?? '' : '')}
          initialSelected={
            draft.parlay?.playerId ? { id: draft.parlay.playerId, name: draft.parlay.playerName } : null
          }
          opponents={opponents}
          submitting={submit.isPending}
          onChange={setParlay}
          onCancel={
            isEditing
              ? () => {
                  clearDraft('parlay');
                  setIsEditing(false);
                }
              : null
          }
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

export default ParlayMyPick;
