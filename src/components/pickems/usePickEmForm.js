import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isByeGame } from './pickSplit.js';
import {
  browserStorage,
  draftDiffers,
  initialSelections,
  readDraft,
  submittedSelections,
  usePickDraft
} from './pickDraft.js';

const NO_PICKS = [];

/**
 * The pick'ems form's state, for every surface that shows the form.
 *
 * The Pick'ems tab and the home page's widget both let a member pick and
 * submit, and the agreement between them — what a form starts from, when a
 * change is a draft, when the draft is cleared — is the risk the plan named.
 * So there is one copy of it, here, and each surface renders it.
 *
 * - On mount (and whenever the submitted picks change) the selection is
 *   `initialSelections`: the draft over what was submitted. A draft that
 *   changes a submitted pick reopens the form for editing, so the change is
 *   on screen and one press from saved.
 * - Every pick is written to the draft as it is made.
 * - A successful submit clears the draft's picks; so does cancelling an edit.
 *
 * `submit(pickEmWeekId, picks)` is the caller's mutation. It is awaited, and a
 * refusal (the window closed, the account is not approved) comes back as
 * `error` rather than as an unhandled rejection.
 *
 * @param {object} args
 * @param {object|null} args.pickEmWeek
 * @param {object[]} args.games - the week's pick'em games
 * @param {object[]} [args.userPicks] - the member's `pick_em_submissions` rows
 * @param {string|null} args.userId
 * @param {(pickEmWeekId: string, picks: object[]) => Promise<unknown>} args.submit
 */
export function usePickEmForm({ pickEmWeek, games = [], userPicks = NO_PICKS, userId = null, submit }) {
  const pickEmWeekId = pickEmWeek?.id ?? null;
  const { setPick, clear } = usePickDraft(pickEmWeekId, userId);

  const [picks, setPicks] = useState({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const confirmationTimer = useRef(null);

  useEffect(() => () => clearTimeout(confirmationTimer.current), []);

  // Keyed on the submitted picks, the week and the member — not on the draft,
  // which this form writes on every pick and would otherwise re-seed itself
  // from its own keystrokes.
  useEffect(() => {
    const draft = readDraft(browserStorage(), userId, pickEmWeekId);
    const drafted = draftDiffers(draft, userPicks);
    const submitted = userPicks.length > 0;

    setPicks(initialSelections({ draft, submitted: userPicks }));
    setHasSubmitted(submitted);
    setIsEditing(submitted && drafted);
    setHasChanges(drafted);
    setError(null);
  }, [userPicks, pickEmWeekId, userId]);

  const availableGames = useMemo(() => games.filter((game) => !game.isCompleted), [games]);
  const selectableGames = useMemo(() => availableGames.filter((game) => !isByeGame(game)), [availableGames]);

  // Counted over the games still to pick, not over every key: a pick on a game
  // that has since finished would otherwise keep the count above the total,
  // and the form would never read as complete.
  const totalPicks = selectableGames.filter((game) => picks[game.id]).length;

  const pick = useCallback(
    (gameId, teamId) => {
      setPicks((current) => ({ ...current, [gameId]: teamId }));
      setHasChanges(true);
      setError(null);
      setShowConfirmation(false);
      setPick(gameId, teamId);
    },
    [setPick]
  );

  const handleSubmit = useCallback(async () => {
    if (!pickEmWeekId) return false;

    const missing = selectableGames.find((game) => !picks[game.id]);
    if (missing) {
      setError(`Please make a pick for ${missing.team1?.name} vs ${missing.team2?.name}`);
      return false;
    }
    if (selectableGames.length === 0) {
      setError('No games available for picks');
      return false;
    }

    const payload = selectableGames.map((game) => ({
      gameId: game.id,
      predictedWinnerTeamId: picks[game.id],
      confidenceLevel: 1
    }));

    setSubmitting(true);
    setError(null);
    try {
      await submit(pickEmWeekId, payload);
      clear('picks');
      setHasChanges(false);
      setHasSubmitted(true);
      setIsEditing(false);
      setShowConfirmation(true);
      clearTimeout(confirmationTimer.current);
      confirmationTimer.current = setTimeout(() => setShowConfirmation(false), 5000);
      return true;
    } catch (err) {
      setError(err?.message || 'Failed to submit picks');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [pickEmWeekId, selectableGames, picks, submit, clear]);

  const startEdit = useCallback(() => setIsEditing(true), []);

  const cancelEdit = useCallback(() => {
    clear('picks');
    setPicks(submittedSelections(userPicks));
    setIsEditing(false);
    setHasChanges(false);
    setError(null);
    setShowConfirmation(false);
  }, [clear, userPicks]);

  return {
    picks,
    availableGames,
    selectableGames,
    totalPicks,
    hasSubmitted,
    isEditing,
    hasChanges,
    submitting,
    error,
    showConfirmation,
    /** True when the selection may change: nothing submitted, or editing. */
    canEdit: !hasSubmitted || isEditing,
    pick,
    handleSubmit,
    startEdit,
    cancelEdit
  };
}

export default usePickEmForm;
